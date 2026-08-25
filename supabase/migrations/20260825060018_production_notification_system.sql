begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.notification_event_catalog (
  event_key text primary key,
  category text not null check (category in ('orders','confirmation','shipping','inventory','team','finance','ads','integrations','security','system')),
  default_title text not null,
  default_priority text not null check (default_priority in ('low','normal','high','critical')),
  available_channels text[] not null default array['in_app']::text[],
  default_in_app_enabled boolean not null default true,
  default_push_enabled boolean not null default false,
  default_sound_enabled boolean not null default false,
  allowed_roles text[] not null default array['owner','supervisor']::text[],
  required_section text,
  dedupe_strategy text not null default 'source_event',
  cooldown_seconds integer not null default 0 check (cooldown_seconds between 0 and 604800),
  can_bypass_quiet_hours boolean not null default false,
  sound_allowed boolean not null default true,
  sensitive_preview_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
)
values
  ('order.created','orders','New order','normal',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Orders','source_event',0,false,true,true),
  ('order.assigned','confirmation','Order assigned','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager','agent'],'Confirmation','source_event',0,false,true,true),
  ('order.unassigned','confirmation','Order unassigned','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager','agent'],'Confirmation','source_event',0,false,false,false),
  ('order.confirmed','confirmation','Order confirmed','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager','agent'],'Confirmation','source_event',0,false,true,true),
  ('order.no_response','confirmation','Customer needs follow-up','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager','agent'],'Confirmation','source_event',0,false,true,true),
  ('order.cancelled','orders','Order cancelled','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager','agent'],'Orders','source_event',0,false,true,true),
  ('order.duplicate','orders','Duplicate order detected','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager','agent'],'Orders','source_event',0,false,true,true),
  ('order.blacklisted','orders','Blacklisted order','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager','agent'],'Orders','source_event',0,false,true,false),
  ('shipping.ready_to_send','shipping','Order ready to send','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.sent_to_carrier','shipping','Sent to carrier','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.picked_up','shipping','Shipment picked up','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.in_transit','shipping','Shipment in transit','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.out_for_delivery','shipping','Out for delivery','high',array['in_app','push','sound'],true,true,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.delivered','shipping','Order delivered','normal',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.refused','shipping','Delivery refused','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.returned','shipping','Shipment returned','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.cancelled','shipping','Shipment cancelled','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Shipping','source_event',0,false,true,true),
  ('shipping.provider_error','shipping','Carrier error','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Shipping','failure_window',900,false,true,false),
  ('shipping.tracking_failed','shipping','Tracking sync failed','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Shipping','failure_window',900,false,true,false),
  ('inventory.low_stock','inventory','Low stock','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Inventory','entity_window',3600,false,true,true),
  ('inventory.out_of_stock','inventory','Out of stock','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Inventory','entity_window',3600,true,true,true),
  ('inventory.restocked','inventory','Product restocked','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Inventory','source_event',0,false,true,true),
  ('inventory.adjusted','inventory','Inventory adjusted','normal',array['in_app'],true,false,false,array['owner','supervisor','admin','manager'],'Inventory','source_event',0,false,false,true),
  ('team.invitation_received','team','Workspace invitation','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager','agent','viewer'],'Team','source_event',0,true,true,false),
  ('team.member_joined','team','Team member joined','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Team','source_event',0,false,false,false),
  ('team.member_removed','team','Team member removed','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Team','source_event',0,false,false,false),
  ('team.role_changed','team','Team role changed','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Team','source_event',0,false,false,false),
  ('finance.expense_created','finance','Expense recorded','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager'],'Expenses','source_event',0,false,false,false),
  ('ads.meta_sync_failed','ads','Meta Ads sync failed','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Ads Manager','failure_window',900,false,true,false),
  ('ads.tiktok_sync_failed','ads','TikTok Ads sync failed','high',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'TikTok Ads','failure_window',900,false,true,false),
  ('ads.token_expired','ads','Advertising token expired','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Ads Manager','entity',3600,true,true,false),
  ('integration.connected','integrations','Integration connected','normal',array['in_app'],true,false,false,array['owner','supervisor','admin','manager'],'Settings','source_event',0,false,false,false),
  ('integration.disconnected','integrations','Integration disconnected','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Settings','source_event',0,false,false,false),
  ('integration.token_expired','integrations','Integration authorization expired','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],'Settings','entity',3600,true,true,false),
  ('integration.sync_failed','integrations','Integration sync failed','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager'],'Settings','failure_window',900,false,true,false),
  ('security.new_login','security','New login','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,true,false,false),
  ('security.password_changed','security','Password changed','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,true,true,false),
  ('security.integration_revoked','security','Integration access revoked','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager'],null,'source_event',0,true,true,false),
  ('system.announcement','system','Ecom OS announcement','normal',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,false,true,false),
  ('system.maintenance','system','Scheduled maintenance','high',array['in_app','push'],true,true,false,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,true,false,false),
  ('system.incident','system','Service incident','critical',array['in_app','push','sound'],true,true,true,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,true,true,false),
  ('system.feature_update','system','New Ecom OS feature','normal',array['in_app','push'],true,false,false,array['owner','supervisor','admin','manager','agent','viewer'],null,'source_event',0,false,true,false)
on conflict (event_key) do update set
  category = excluded.category,
  default_title = excluded.default_title,
  default_priority = excluded.default_priority,
  available_channels = excluded.available_channels,
  default_in_app_enabled = excluded.default_in_app_enabled,
  default_push_enabled = excluded.default_push_enabled,
  default_sound_enabled = excluded.default_sound_enabled,
  allowed_roles = excluded.allowed_roles,
  required_section = excluded.required_section,
  dedupe_strategy = excluded.dedupe_strategy,
  cooldown_seconds = excluded.cooldown_seconds,
  can_bypass_quiet_hours = excluded.can_bypass_quiet_hours,
  sound_allowed = excluded.sound_allowed,
  sensitive_preview_allowed = excluded.sensitive_preview_allowed,
  updated_at = now();

create table if not exists public.notification_user_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  sound_enabled boolean not null default true,
  muted_until timestamptz,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  timezone text not null default 'Africa/Casablanca',
  quiet_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  allow_critical_during_quiet_hours boolean not null default true,
  private_preview_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  check (quiet_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

-- Preserve the earlier category-based preference table before replacing it
-- with per-event preferences. Its rows are translated after the new table is
-- created below.
do $$
declare
  has_per_event_shape boolean;
begin
  if to_regclass('public.notification_preferences') is null then
    return;
  end if;

  select count(*) = 7
  into has_per_event_shape
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notification_preferences'
    and column_name = any (array[
      'id',
      'workspace_id',
      'user_id',
      'event_key',
      'in_app_enabled',
      'sound_enabled',
      'delivery_mode'
    ]);

  if not has_per_event_shape then
    if to_regclass('private.notification_preferences_legacy_20260825') is not null then
      raise exception using
        errcode = '42P07',
        message = 'Cannot preserve public.notification_preferences: private.notification_preferences_legacy_20260825 already exists';
    end if;

    alter table public.notification_preferences set schema private;
    alter table private.notification_preferences rename to notification_preferences_legacy_20260825;
    revoke all on table private.notification_preferences_legacy_20260825 from public, anon, authenticated;
  end if;
end;
$$;

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null references public.notification_event_catalog(event_key) on update cascade on delete restrict,
  in_app_enabled boolean,
  push_enabled boolean,
  sound_enabled boolean,
  delivery_mode text not null default 'immediate' check (delivery_mode in ('immediate','digest','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, event_key)
);

-- Translate legacy category switches into the equivalent per-event rows.
-- Unknown legacy types remain preserved in private rather than being guessed.
do $$
begin
  if to_regclass('private.notification_preferences_legacy_20260825') is not null
     and (
       select count(*) = 5
       from information_schema.columns
       where table_schema = 'private'
         and table_name = 'notification_preferences_legacy_20260825'
         and column_name = any (array['workspace_id', 'user_id', 'type', 'enabled', 'push_enabled'])
     ) then
    insert into public.notification_preferences (
      workspace_id,
      user_id,
      event_key,
      in_app_enabled,
      push_enabled,
      sound_enabled,
      delivery_mode
    )
    select
      legacy.workspace_id,
      legacy.user_id,
      catalog.event_key,
      coalesce(legacy.enabled, true),
      coalesce(legacy.push_enabled, false),
      false,
      case when coalesce(legacy.enabled, true) then 'immediate' else 'off' end
    from private.notification_preferences_legacy_20260825 legacy
    join public.workspaces workspace on workspace.id = legacy.workspace_id
    join auth.users account on account.id = legacy.user_id
    join public.notification_event_catalog catalog on
      catalog.event_key = legacy.type
      or (legacy.type in ('order', 'order_update') and catalog.category in ('orders', 'confirmation'))
      or (legacy.type in ('shipping', 'shipping_update') and catalog.category = 'shipping')
      or (legacy.type in ('inventory', 'inventory_update', 'low_stock') and catalog.category = 'inventory')
      or (legacy.type in ('team', 'team_update') and catalog.category = 'team')
      or (legacy.type in ('system', 'system_update') and catalog.category = 'system')
    on conflict (workspace_id, user_id, event_key) do update set
      in_app_enabled = excluded.in_app_enabled,
      push_enabled = excluded.push_enabled,
      sound_enabled = excluded.sound_enabled,
      delivery_mode = excluded.delivery_mode,
      updated_at = now();
  end if;
end;
$$;

create table if not exists public.notification_thresholds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  threshold_key text not null check (threshold_key in ('inventory.low_stock_quantity','order.confirmation_overdue_minutes','shipping.stuck_hours','ads.spend_amount','ads.cpa_amount','ads.roas_minimum','workspace.usage_warning_percent')),
  numeric_value numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, user_id, threshold_key)
);

-- Some early Ecom OS environments have an unrelated workspace-level
-- public.notifications table (body/event_type/deduplication_key) with no
-- recipient. Preserve that table privately instead of trying to coerce its
-- rows into recipient-scoped notifications.
do $$
declare
  has_recipient_scoped_shape boolean;
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  select count(*) = 8
  into has_recipient_scoped_shape
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name = any (array[
      'id',
      'workspace_id',
      'recipient_user_id',
      'event_key',
      'title',
      'message',
      'dedupe_key',
      'created_at'
    ]);

  if not has_recipient_scoped_shape then
    if to_regclass('private.notifications_legacy_20260825') is not null then
      raise exception using
        errcode = '42P07',
        message = 'Cannot preserve public.notifications: private.notifications_legacy_20260825 already exists';
    end if;

    alter table public.notifications set schema private;
    alter table private.notifications rename to notifications_legacy_20260825;
    revoke all on table private.notifications_legacy_20260825 from public, anon, authenticated;
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null references public.notification_event_catalog(event_key) on update cascade on delete restrict,
  category text not null,
  priority text not null check (priority in ('low','normal','high','critical')),
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) between 1 and 600),
  related_entity_type text,
  related_entity_id uuid,
  action_url text check (action_url is null or action_url ~ '^/[A-Za-z0-9/_?=&.%:-]*$'),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  in_app_visible boolean not null default true,
  push_requested boolean not null default false,
  sound_requested boolean not null default false,
  is_read boolean not null default false,
  read_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, recipient_user_id, dedupe_key),
  check (jsonb_typeof(payload) = 'object')
);

-- Complete upgrades from any earlier recipient-scoped draft before partial
-- indexes and policies reference the newer state columns.
alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists priority text not null default 'normal',
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists action_url text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists occurrence_count integer not null default 1,
  add column if not exists in_app_visible boolean not null default true,
  add column if not exists push_requested boolean not null default false,
  add column if not exists sound_requested boolean not null default false,
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '180 days'),
  add column if not exists updated_at timestamptz not null default now();

-- Legacy browser subscriptions used plaintext endpoint/auth column names and
-- cannot satisfy the protected endpoint contract. Keep them private; browsers
-- will create fresh protected subscriptions through the constrained RPC.
do $$
declare
  has_protected_subscription_shape boolean;
begin
  if to_regclass('public.push_subscriptions') is null then
    return;
  end if;

  select count(*) = 7
  into has_protected_subscription_shape
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'push_subscriptions'
    and column_name = any (array[
      'id',
      'workspace_id',
      'user_id',
      'endpoint_encrypted_or_protected',
      'endpoint_hash',
      'p256dh_key',
      'auth_key'
    ]);

  if not has_protected_subscription_shape then
    if to_regclass('private.push_subscriptions_legacy_20260825') is not null then
      raise exception using
        errcode = '42P07',
        message = 'Cannot preserve public.push_subscriptions: private.push_subscriptions_legacy_20260825 already exists';
    end if;

    alter table public.push_subscriptions set schema private;
    alter table private.push_subscriptions rename to push_subscriptions_legacy_20260825;
    revoke all on table private.push_subscriptions_legacy_20260825 from public, anon, authenticated;
  end if;
end;
$$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_encrypted_or_protected text not null,
  endpoint_hash text not null,
  p256dh_key text not null,
  auth_key text not null,
  device_name text not null default 'Browser',
  browser text not null default 'Unknown',
  operating_system text not null default 'Unknown',
  device_type text not null default 'desktop' check (device_type in ('desktop','mobile','tablet','unknown')),
  is_pwa boolean not null default false,
  is_active boolean not null default true,
  last_active_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, endpoint_hash)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_key text not null references public.notification_event_catalog(event_key) on update cascade on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending','processing','delayed','sent','failed','discarded')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (notification_id)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('push','in_app','sound','email','whatsapp','sms')),
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null check (status in ('queued','sent','delivered','failed','discarded')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_status text,
  sanitized_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (notification_id, channel, subscription_id)
);

create index if not exists notifications_recipient_feed_idx on public.notifications (workspace_id, recipient_user_id, created_at desc, id desc) where is_archived = false and in_app_visible = true;
create index if not exists notifications_recipient_unread_idx on public.notifications (workspace_id, recipient_user_id, created_at desc) where is_read = false and is_archived = false and in_app_visible = true;
create index if not exists notifications_event_idx on public.notifications (workspace_id, event_key, created_at desc);
create index if not exists notifications_related_entity_idx on public.notifications (workspace_id, related_entity_type, related_entity_id) where related_entity_id is not null;
create index if not exists notification_preferences_lookup_idx on public.notification_preferences (workspace_id, user_id, event_key);
create index if not exists notification_settings_lookup_idx on public.notification_user_settings (workspace_id, user_id);
create index if not exists notification_thresholds_lookup_idx on public.notification_thresholds (workspace_id, threshold_key, user_id);
create index if not exists push_subscriptions_user_active_idx on public.push_subscriptions (workspace_id, user_id, last_active_at desc) where is_active = true;
create index if not exists notification_outbox_claim_idx on public.notification_outbox (next_attempt_at, created_at) where status in ('pending','delayed');
create index if not exists notification_outbox_recipient_idx on public.notification_outbox (workspace_id, recipient_user_id, status);
create index if not exists notification_deliveries_notification_idx on public.notification_deliveries (notification_id, created_at desc);
create index if not exists notification_deliveries_subscription_idx on public.notification_deliveries (subscription_id, created_at desc) where subscription_id is not null;

alter table public.notification_event_catalog enable row level security;
alter table public.notification_user_settings enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_thresholds enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists notification_catalog_authenticated_read on public.notification_event_catalog;
drop policy if exists notification_settings_own_read on public.notification_user_settings;
drop policy if exists notification_settings_own_insert on public.notification_user_settings;
drop policy if exists notification_settings_own_update on public.notification_user_settings;
drop policy if exists notification_preferences_own_read on public.notification_preferences;
drop policy if exists notification_preferences_own_insert on public.notification_preferences;
drop policy if exists notification_preferences_own_update on public.notification_preferences;
drop policy if exists notification_preferences_own_delete on public.notification_preferences;
drop policy if exists notification_thresholds_member_read on public.notification_thresholds;
drop policy if exists notification_thresholds_member_insert on public.notification_thresholds;
drop policy if exists notification_thresholds_member_update on public.notification_thresholds;
drop policy if exists notification_thresholds_member_delete on public.notification_thresholds;
drop policy if exists notifications_own_read on public.notifications;

create policy notification_catalog_authenticated_read on public.notification_event_catalog for select to authenticated using (true);
create policy notification_settings_own_read on public.notification_user_settings for select to authenticated using (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_settings_own_insert on public.notification_user_settings for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_settings_own_update on public.notification_user_settings for update to authenticated using (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id))) with check (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_preferences_own_read on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_preferences_own_insert on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_preferences_own_update on public.notification_preferences for update to authenticated using (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id))) with check (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_preferences_own_delete on public.notification_preferences for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_thresholds_member_read on public.notification_thresholds for select to authenticated using ((user_id is null or user_id = (select auth.uid())) and (select public.is_active_workspace_member(workspace_id)));
create policy notification_thresholds_member_insert on public.notification_thresholds for insert to authenticated with check (
  (select public.is_active_workspace_member(workspace_id)) and
  (user_id = (select auth.uid()) or (user_id is null and (select public.has_workspace_role(workspace_id, array['owner','supervisor','admin','manager']))))
);
create policy notification_thresholds_member_update on public.notification_thresholds for update to authenticated using (
  (select public.is_active_workspace_member(workspace_id)) and
  (user_id = (select auth.uid()) or (user_id is null and (select public.has_workspace_role(workspace_id, array['owner','supervisor','admin','manager']))))
) with check (
  (select public.is_active_workspace_member(workspace_id)) and
  (user_id = (select auth.uid()) or (user_id is null and (select public.has_workspace_role(workspace_id, array['owner','supervisor','admin','manager']))))
);
create policy notification_thresholds_member_delete on public.notification_thresholds for delete to authenticated using (
  (select public.is_active_workspace_member(workspace_id)) and
  (user_id = (select auth.uid()) or (user_id is null and (select public.has_workspace_role(workspace_id, array['owner','supervisor','admin','manager']))))
);
create policy notifications_own_read on public.notifications for select to authenticated using (recipient_user_id = (select auth.uid()) and (select public.is_active_workspace_member(workspace_id)));

revoke all on public.notification_event_catalog, public.notification_user_settings, public.notification_preferences, public.notification_thresholds, public.notifications, public.push_subscriptions, public.notification_outbox, public.notification_deliveries from anon, authenticated;
grant select on public.notification_event_catalog, public.notifications to authenticated;
grant select, insert, update on public.notification_user_settings, public.notification_preferences to authenticated;
grant delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_thresholds to authenticated;

create or replace function private.notification_safe_text(p_value text, p_max_length integer)
returns text language sql immutable set search_path = '' as $$
  select left(trim(regexp_replace(coalesce(p_value, ''), '<[^>]*>', '', 'g')), greatest(1, p_max_length));
$$;

create or replace function private.notification_safe_payload(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare sanitized jsonb;
begin
  if p_value is null then return 'null'::jsonb; end if;
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(item.key, private.notification_safe_payload(item.value)), '{}'::jsonb)
    into sanitized
    from jsonb_each(p_value) item
    where item.key !~* '(^|_)(phone|address|notes?|token|secret|api_key|password|otp|rib|credential|authorization)($|_)';
    return sanitized;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(private.notification_safe_payload(item.value) order by item.position), '[]'::jsonb)
    into sanitized
    from jsonb_array_elements(p_value) with ordinality item(value, position);
    return sanitized;
  elsif jsonb_typeof(p_value) = 'string' then
    return to_jsonb(private.notification_safe_text(p_value #>> '{}', 600));
  end if;
  return p_value;
end;
$$;

create or replace function private.notification_quiet_until(
  p_timezone text,
  p_enabled boolean,
  p_start time,
  p_end time,
  p_days smallint[],
  p_allow_critical boolean,
  p_is_critical boolean,
  p_can_bypass boolean
)
returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  local_now timestamp;
  local_end timestamp;
  local_day smallint;
  in_window boolean;
begin
  if not coalesce(p_enabled, false) or (p_is_critical and p_allow_critical and p_can_bypass) then return now(); end if;
  begin local_now := now() at time zone p_timezone; exception when invalid_parameter_value then local_now := now() at time zone 'UTC'; end;
  local_day := extract(dow from local_now)::smallint;
  if not (local_day = any(coalesce(p_days, array[0,1,2,3,4,5,6]::smallint[]))) then return now(); end if;
  if p_start = p_end then return now(); end if;
  if p_start < p_end then
    in_window := local_now::time >= p_start and local_now::time < p_end;
    local_end := date_trunc('day', local_now) + p_end;
  else
    in_window := local_now::time >= p_start or local_now::time < p_end;
    local_end := date_trunc('day', local_now) + p_end + case when local_now::time >= p_start then interval '1 day' else interval '0 day' end;
  end if;
  if not in_window then return now(); end if;
  begin return local_end at time zone p_timezone; exception when invalid_parameter_value then return local_end at time zone 'UTC'; end;
end;
$$;

create or replace function private.emit_notification_event(
  p_workspace_id uuid,
  p_event_key text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_recipient_user_id uuid default null,
  p_source_event_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.notification_event_catalog%rowtype;
  recipient record;
  settings_row public.notification_user_settings%rowtype;
  preference_row public.notification_preferences%rowtype;
  notification_row public.notifications%rowtype;
  effective_in_app boolean;
  effective_push boolean;
  effective_sound boolean;
  effective_dedupe text;
  safe_title text;
  safe_message text;
  safe_action text;
  queued_at timestamptz;
  created_count integer := 0;
begin
  select * into event_row from public.notification_event_catalog where event_key = p_event_key;
  if not found then raise exception 'UNKNOWN_NOTIFICATION_EVENT'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_NOTIFICATION_PAYLOAD'; end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and coalesce(w.is_active, true) and w.deleted_at is null
      and coalesce(lower(w.status), 'active') not in ('suspended','removed','deleted','inactive')
  ) then return 0; end if;

  safe_title := private.notification_safe_text(coalesce(p_payload->>'title', event_row.default_title), 180);
  safe_message := private.notification_safe_text(coalesce(p_payload->>'message', event_row.default_title), 600);
  safe_action := case when coalesce(p_payload->>'action_url','') ~ '^/[A-Za-z0-9/_?=&.%:-]*$' and p_payload->>'action_url' not like '//%' then p_payload->>'action_url' else null end;
  effective_dedupe := coalesce(nullif(p_dedupe_key,''), p_event_key || ':' || p_workspace_id::text || ':' || coalesce(p_related_entity_id::text, encode(gen_random_bytes(12), 'hex')));
  if event_row.dedupe_strategy = 'source_event' and nullif(p_source_event_id, '') is not null then
    effective_dedupe := effective_dedupe || ':source:' || p_source_event_id;
  elsif event_row.dedupe_strategy in ('entity_window','failure_window') and event_row.cooldown_seconds > 0 then
    effective_dedupe := effective_dedupe || ':window:' || floor(extract(epoch from now()) / event_row.cooldown_seconds)::bigint;
  end if;
  effective_dedupe := left(effective_dedupe, 500);

  for recipient in
    select
      pw.profile_id as user_id,
      case lower(case when pw.is_owner then 'owner' else coalesce(pw.role, p.role, 'viewer') end)
        when 'employee' then 'agent'
        when 'user' then 'viewer'
        else lower(case when pw.is_owner then 'owner' else coalesce(pw.role, p.role, 'viewer') end)
      end as member_role,
      coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) as allowed_sections
    from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id
      and pw.status = 'active'
      and (p_recipient_user_id is null or pw.profile_id = p_recipient_user_id)
      and coalesce(p.is_active, true) and p.deleted_at is null
      and coalesce(lower(p.status), 'active') not in ('suspended','removed','deleted','inactive')
  loop
    if not (recipient.member_role = any(event_row.allowed_roles)) then continue; end if;
    if event_row.required_section is not null
      and recipient.member_role not in ('owner','supervisor','admin','manager')
      and not (recipient.allowed_sections @> to_jsonb(array[event_row.required_section])) then continue; end if;

    insert into public.notification_user_settings (workspace_id, user_id)
    values (p_workspace_id, recipient.user_id)
    on conflict (workspace_id, user_id) do nothing;
    select * into settings_row from public.notification_user_settings where workspace_id = p_workspace_id and user_id = recipient.user_id;
    select * into preference_row from public.notification_preferences where workspace_id = p_workspace_id and user_id = recipient.user_id and event_key = p_event_key;

    if not settings_row.notifications_enabled or (settings_row.muted_until is not null and settings_row.muted_until > now()) then continue; end if;
    if event_row.default_priority <> 'critical' and (
      select count(*) from public.notifications recent
      where recent.workspace_id = p_workspace_id
        and recent.recipient_user_id = recipient.user_id
        and recent.created_at > now() - interval '5 minutes'
    ) >= 60 then continue; end if;
    effective_in_app := settings_row.in_app_enabled and coalesce(preference_row.in_app_enabled, event_row.default_in_app_enabled) and coalesce(preference_row.delivery_mode, 'immediate') <> 'off';
    effective_push := settings_row.push_enabled and coalesce(preference_row.push_enabled, event_row.default_push_enabled) and 'push' = any(event_row.available_channels) and coalesce(preference_row.delivery_mode, 'immediate') <> 'off';
    effective_sound := effective_in_app and settings_row.sound_enabled and event_row.sound_allowed and coalesce(preference_row.sound_enabled, event_row.default_sound_enabled);
    if not effective_in_app and not effective_push then continue; end if;

    insert into public.notifications (
      workspace_id, recipient_user_id, event_key, category, priority, title, message,
      related_entity_type, related_entity_id, action_url, payload, dedupe_key,
      in_app_visible, push_requested, sound_requested
    ) values (
      p_workspace_id, recipient.user_id, p_event_key, event_row.category,
      case when p_payload->>'priority' in ('low','normal','high','critical') then p_payload->>'priority' else event_row.default_priority end, safe_title, safe_message,
      nullif(p_related_entity_type,''), p_related_entity_id, safe_action,
      private.notification_safe_payload(coalesce(p_payload, '{}'::jsonb)),
      effective_dedupe, effective_in_app, effective_push, effective_sound
    )
    on conflict (workspace_id, recipient_user_id, dedupe_key) do update set
      title = excluded.title, message = excluded.message, payload = excluded.payload,
      occurrence_count = public.notifications.occurrence_count + 1,
      priority = excluded.priority, action_url = excluded.action_url,
      in_app_visible = public.notifications.in_app_visible or excluded.in_app_visible,
      push_requested = public.notifications.push_requested or excluded.push_requested,
      sound_requested = excluded.sound_requested, is_read = false, read_at = null,
      is_archived = false, archived_at = null, updated_at = now()
    returning * into notification_row;

    if effective_push then
      queued_at := private.notification_quiet_until(
        settings_row.timezone, settings_row.quiet_hours_enabled,
        settings_row.quiet_hours_start, settings_row.quiet_hours_end, settings_row.quiet_days,
        settings_row.allow_critical_during_quiet_hours,
        notification_row.priority = 'critical', event_row.can_bypass_quiet_hours
      );
      insert into public.notification_outbox (
        notification_id, workspace_id, event_key, recipient_user_id, payload,
        dedupe_key, status, next_attempt_at
      ) values (
        notification_row.id, p_workspace_id, p_event_key, recipient.user_id,
        jsonb_build_object('notification_id', notification_row.id, 'title', safe_title, 'message', safe_message, 'action_url', coalesce(safe_action,'/notifications'), 'priority', notification_row.priority, 'category', event_row.category, 'private_preview', settings_row.private_preview_enabled),
        effective_dedupe, case when queued_at > now() then 'delayed' else 'pending' end, queued_at
      ) on conflict (notification_id) do nothing;
    end if;
    created_count := created_count + 1;
  end loop;
  return created_count;
end;
$$;

create or replace function public.notification_unread_count(p_workspace_id uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select count(*) from public.notifications
  where workspace_id = p_workspace_id and recipient_user_id = (select auth.uid())
    and in_app_visible and not is_read and not is_archived and expires_at > now();
$$;

create or replace function public.notification_mark_read(p_workspace_id uuid, p_ids uuid[], p_is_read boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.is_active_workspace_member(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  update public.notifications set is_read = p_is_read, read_at = case when p_is_read then now() else null end, updated_at = now()
  where workspace_id = p_workspace_id and recipient_user_id = (select auth.uid()) and id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.notification_mark_all_read(p_workspace_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.is_active_workspace_member(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  update public.notifications set is_read = true, read_at = now(), updated_at = now()
  where workspace_id = p_workspace_id and recipient_user_id = (select auth.uid()) and not is_read and not is_archived;
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.notification_archive(p_workspace_id uuid, p_ids uuid[], p_archived boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.is_active_workspace_member(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  update public.notifications set is_archived = p_archived, archived_at = case when p_archived then now() else null end, updated_at = now()
  where workspace_id = p_workspace_id and recipient_user_id = (select auth.uid()) and id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.notification_delete(p_workspace_id uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.is_active_workspace_member(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  delete from public.notifications where workspace_id = p_workspace_id and recipient_user_id = (select auth.uid()) and id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.notification_list_devices(p_workspace_id uuid)
returns table (id uuid, device_name text, browser text, operating_system text, device_type text, is_pwa boolean, is_active boolean, last_active_at timestamptz, last_success_at timestamptz, last_failure_at timestamptz, failure_count integer, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.device_name, s.browser, s.operating_system, s.device_type, s.is_pwa, s.is_active, s.last_active_at, s.last_success_at, s.last_failure_at, s.failure_count, s.expires_at, s.created_at
  from public.push_subscriptions s
  where s.workspace_id = p_workspace_id and s.user_id = (select auth.uid()) and public.is_active_workspace_member(p_workspace_id)
  order by s.last_active_at desc;
$$;

create or replace function public.claim_notification_outbox(p_worker_id text, p_limit integer default 25)
returns setof public.notification_outbox
language sql security definer set search_path = '' as $$
  with candidates as (
    select id from public.notification_outbox
    where status in ('pending','delayed') and next_attempt_at <= now() and attempt_count < max_attempts
    order by next_attempt_at, created_at
    limit least(greatest(coalesce(p_limit,25),1),100)
    for update skip locked
  )
  update public.notification_outbox o set status = 'processing', locked_at = now(), locked_by = left(p_worker_id,120), attempt_count = o.attempt_count + 1, updated_at = now()
  from candidates c where o.id = c.id returning o.*;
$$;

create or replace function public.recover_stale_notification_outbox(p_timeout_minutes integer default 10)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.notification_outbox set status = 'pending', locked_at = null, locked_by = null,
    next_attempt_at = now(), last_error = 'Recovered stale processing lease', updated_at = now()
  where status = 'processing' and locked_at < now() - make_interval(mins => least(greatest(coalesce(p_timeout_minutes,10),2),60));
  get diagnostics affected = row_count; return affected;
end;
$$;

revoke all on function private.notification_safe_text(text, integer) from public, anon, authenticated;
revoke all on function private.notification_quiet_until(text, boolean, time, time, smallint[], boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function private.emit_notification_event(uuid, text, text, uuid, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function private.emit_notification_event(uuid, text, text, uuid, jsonb, text, uuid, text) to service_role;
revoke all on function public.notification_unread_count(uuid), public.notification_mark_read(uuid, uuid[], boolean), public.notification_mark_all_read(uuid), public.notification_archive(uuid, uuid[], boolean), public.notification_delete(uuid, uuid[]), public.notification_list_devices(uuid), public.claim_notification_outbox(text, integer), public.recover_stale_notification_outbox(integer) from public, anon;
grant execute on function public.notification_unread_count(uuid), public.notification_mark_read(uuid, uuid[], boolean), public.notification_mark_all_read(uuid), public.notification_archive(uuid, uuid[], boolean), public.notification_delete(uuid, uuid[]), public.notification_list_devices(uuid) to authenticated;
revoke execute on function public.claim_notification_outbox(text, integer), public.recover_stale_notification_outbox(integer) from authenticated;
grant execute on function public.claim_notification_outbox(text, integer), public.recover_stale_notification_outbox(integer) to service_role;

create or replace function private.notify_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare key text; order_id uuid; normalized text;
begin
  order_id := new."Order ID";
  if tg_op = 'INSERT' then
    perform private.emit_notification_event(new.workspace_id, 'order.created', 'order', order_id,
      jsonb_build_object('title','New order received','message','Order ' || coalesce(new.order_number,'') || ' is ready for confirmation.','action_url','/orders?order=' || order_id),
      'order.created:' || new.workspace_id || ':' || order_id, null, order_id::text);
    if new.assigned_to is not null then
      perform private.emit_notification_event(new.workspace_id, 'order.assigned', 'order', order_id,
        jsonb_build_object('title','Order assigned to you','message','Order ' || coalesce(new.order_number,'') || ' is ready for confirmation.','action_url','/confirmation?order=' || order_id),
        'order.assigned:' || new.workspace_id || ':' || order_id || ':' || new.assigned_to, new.assigned_to, order_id::text);
    end if;
    return new;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    if old.assigned_to is not null then
      perform private.emit_notification_event(new.workspace_id, 'order.unassigned', 'order', order_id,
        jsonb_build_object('title','Order removed from your queue','message','Order ' || coalesce(new.order_number,'') || ' was unassigned or reassigned.','action_url','/confirmation?order=' || order_id),
        'order.unassigned:' || new.workspace_id || ':' || order_id || ':' || old.assigned_to, old.assigned_to, txid_current()::text);
    end if;
    if new.assigned_to is not null then
      perform private.emit_notification_event(new.workspace_id, 'order.assigned', 'order', order_id,
        jsonb_build_object('title','Order assigned to you','message','Order ' || coalesce(new.order_number,'') || ' is ready for confirmation.','action_url','/confirmation?order=' || order_id),
        'order.assigned:' || new.workspace_id || ':' || order_id || ':' || new.assigned_to, new.assigned_to, txid_current()::text);
    end if;
  end if;
  if new.status is distinct from old.status then
    normalized := lower(coalesce(new.status,''));
    key := case when normalized in ('confirmed','confirmé','confirme') then 'order.confirmed' when normalized in ('no_answer','unreachable','scheduled') then 'order.no_response' when normalized in ('cancelled','canceled','annulé') then 'order.cancelled' when normalized = 'duplicate' then 'order.duplicate' when normalized = 'blacklisted' then 'order.blacklisted' else null end;
    if key is not null then
      perform private.emit_notification_event(new.workspace_id, key, 'order', order_id,
        jsonb_build_object('message','Order ' || coalesce(new.order_number,'') || ' changed to ' || replace(normalized,'_',' ') || '.','action_url','/orders?order=' || order_id),
        key || ':' || new.workspace_id || ':' || order_id || ':' || normalized, case when new.assigned_to is not null and key in ('order.no_response','order.cancelled') then new.assigned_to else null end, txid_current()::text);
    end if;
  end if;
  if new.shipping_status is distinct from old.shipping_status then
    normalized := upper(coalesce(public.normalize_status(new.shipping_status), new.shipping_status, ''));
    key := case when normalized in ('READY','PENDING') then 'shipping.ready_to_send' when normalized in ('SENT','REGISTERED','SHIPPED') then 'shipping.sent_to_carrier' when normalized = 'PICKED_UP' then 'shipping.picked_up' when normalized = 'IN_TRANSIT' then 'shipping.in_transit' when normalized = 'OUT_FOR_DELIVERY' then 'shipping.out_for_delivery' when normalized = 'DELIVERED' then 'shipping.delivered' when normalized = 'REFUSED' then 'shipping.refused' when normalized in ('RETURNED','COMING_BACK') then 'shipping.returned' when normalized = 'CANCELLED' then 'shipping.cancelled' else null end;
    if key is not null then
      perform private.emit_notification_event(new.workspace_id, key, 'order', order_id,
        jsonb_build_object('message','Shipping for order ' || coalesce(new.order_number,'') || ' is now ' || replace(lower(normalized),'_',' ') || '.','action_url','/delivering?order=' || order_id),
        key || ':' || new.workspace_id || ':' || order_id || ':' || normalized, null, txid_current()::text);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_order_insert on public.orders;
create trigger notification_order_insert after insert on public.orders for each row execute function private.notify_order_change();
drop trigger if exists notification_order_update on public.orders;
create trigger notification_order_update after update of status, shipping_status, assigned_to on public.orders for each row execute function private.notify_order_change();

create or replace function private.notify_inventory_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare key text; threshold_value numeric; available_stock numeric;
begin
  if not coalesce(new.inventory_tracking_enabled, false) then return new; end if;
  available_stock := coalesce(new.stock, new.initial_stock, 0);
  threshold_value := coalesce(new.low_stock_threshold, 5);
  if tg_op = 'UPDATE' and available_stock = coalesce(old.stock, old.initial_stock, 0) then return new; end if;
  if available_stock <= 0 then key := 'inventory.out_of_stock';
  elsif available_stock <= threshold_value then key := 'inventory.low_stock';
  elsif tg_op = 'UPDATE' and coalesce(old.stock, old.initial_stock, 0) <= coalesce(old.low_stock_threshold,5) then key := 'inventory.restocked';
  else return new; end if;
  perform private.emit_notification_event(new.workspace_id, key, 'product', new.id,
    jsonb_build_object('message',coalesce(new.name,new.sku,'Product') || case when key = 'inventory.restocked' then ' is back in stock.' else ' has ' || available_stock || ' units available.' end,'action_url','/products-inventory/' || new.id),
    key || ':' || new.workspace_id || ':' || new.id || case when key in ('inventory.low_stock','inventory.out_of_stock') then ':active' else ':' || txid_current()::text end, null, txid_current()::text);
  return new;
end;
$$;

drop trigger if exists notification_inventory_change on public.products;
create trigger notification_inventory_change after insert or update of stock, initial_stock, low_stock_threshold, inventory_tracking_enabled on public.products for each row execute function private.notify_inventory_change();

create or replace function private.notify_team_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  target_user := new.user_id;
  if target_user is null then select id into target_user from public.profiles where lower(email) = lower(new.email) and deleted_at is null limit 1; end if;
  if target_user is not null then
    perform private.emit_notification_event(new.workspace_id, 'team.invitation_received', 'workspace_invitation', new.id,
      jsonb_build_object('message','You were invited to join a workspace.','action_url','/team'),
      'team.invitation_received:' || new.id, target_user, new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists notification_workspace_invitation on public.workspace_invitations;
create trigger notification_workspace_invitation after insert on public.workspace_invitations for each row execute function private.notify_team_invitation();

create or replace function private.notify_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare key text;
begin
  if tg_op = 'INSERT' then key := 'team.member_joined';
  elsif new.status is distinct from old.status and new.status in ('removed','suspended') then key := 'team.member_removed';
  elsif new.role is distinct from old.role or new.is_owner is distinct from old.is_owner then key := 'team.role_changed';
  else return new; end if;
  perform private.emit_notification_event(new.workspace_id, key, 'profile', new.profile_id,
    jsonb_build_object('message','Workspace membership was updated.','action_url','/team'), key || ':' || new.workspace_id || ':' || new.profile_id || ':' || txid_current(), null, txid_current()::text);
  return new;
end;
$$;
drop trigger if exists notification_membership_change on public.profile_workspaces;
create trigger notification_membership_change after insert or update of status, role, is_owner on public.profile_workspaces for each row execute function private.notify_membership_change();

create or replace function private.notify_expense_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_notification_event(new.workspace_id, 'finance.expense_created', 'expense', new.id,
    jsonb_build_object('message','A workspace expense was recorded.','action_url','/expenses'), 'finance.expense_created:' || new.workspace_id || ':' || new.id, null, new.id::text);
  return new;
end;
$$;
drop trigger if exists notification_expense_created on public.expenses;
create trigger notification_expense_created after insert on public.expenses for each row execute function private.notify_expense_created();

create or replace function private.notify_founder_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member record; target_workspace uuid; event_key text;
begin
  if not new.is_active or new.status <> 'published' or (new.publish_at is not null and new.publish_at > now()) or (new.start_at is not null and new.start_at > now()) or (new.end_at is not null and new.end_at <= now()) then return new; end if;
  if tg_op = 'UPDATE' and old.is_active and old.status = 'published' and old.updated_at = new.updated_at then return new; end if;
  event_key := case when new.type = 'maintenance' then 'system.maintenance' when new.type in ('critical','security') then 'system.incident' when new.type = 'update' then 'system.feature_update' else 'system.announcement' end;
  for member in
    select distinct pw.workspace_id, pw.profile_id, lower(case when pw.is_owner then 'owner' else coalesce(pw.role,p.role,'viewer') end) as member_role
    from public.profile_workspaces pw join public.profiles p on p.id = pw.profile_id join public.workspaces w on w.id = pw.workspace_id
    where pw.status = 'active' and coalesce(p.is_active,true) and p.deleted_at is null and coalesce(w.is_active,true) and w.deleted_at is null
      and (new.audience <> 'workspace' or pw.workspace_id = new.workspace_id)
      and (new.audience <> 'user' or pw.profile_id = new.target_profile_id)
      and (new.audience <> 'roles' or lower(case when pw.is_owner then 'owner' else coalesce(pw.role,p.role,'viewer') end) = any(select lower(x) from unnest(new.audience_roles) x))
      and (new.audience <> 'plan' or coalesce(w.plan,'free') = new.target_plan)
  loop
    perform private.emit_notification_event(member.workspace_id, event_key, 'announcement', new.id,
      jsonb_build_object('title',new.title,'message',new.body,'priority',case when new.type in ('critical','security') or new.priority >= 3 then 'critical' when new.priority >= 1 then 'high' else 'normal' end,'action_url',coalesce(new.cta_url,'/notifications')),
      'announcement:' || new.id || ':' || member.profile_id, member.profile_id, new.id::text);
  end loop;
  return new;
end;
$$;
drop trigger if exists notification_founder_announcement on public.founder_announcements;
create trigger notification_founder_announcement after insert or update on public.founder_announcements for each row execute function private.notify_founder_announcement();

create or replace function private.notify_auth_security_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare membership record; event_key text;
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    event_key := 'security.password_changed';
  elsif old.last_sign_in_at is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then
    event_key := 'security.new_login';
  else
    return new;
  end if;
  for membership in
    select pw.workspace_id
    from public.profile_workspaces pw
    join public.workspaces w on w.id = pw.workspace_id
    where pw.profile_id = new.id and pw.status = 'active'
      and coalesce(w.is_active, true) and w.deleted_at is null
      and coalesce(lower(w.status), 'active') not in ('suspended','removed','deleted','inactive')
  loop
    perform private.emit_notification_event(
      membership.workspace_id,
      event_key,
      'user',
      new.id,
      jsonb_build_object(
        'title', case when event_key = 'security.password_changed' then 'Password changed' else 'New sign-in' end,
        'message', case when event_key = 'security.password_changed' then 'Your Ecom OS password was changed.' else 'Your Ecom OS account signed in again.' end,
        'action_url', '/settings/notifications'
      ),
      event_key || ':' || membership.workspace_id || ':' || new.id,
      new.id,
      txid_current()::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notification_auth_security_change on auth.users;
create trigger notification_auth_security_change
after update of encrypted_password, last_sign_in_at on auth.users
for each row execute function private.notify_auth_security_change();

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_notifications') then
    insert into public.notifications (workspace_id, recipient_user_id, event_key, category, priority, title, message, related_entity_type, related_entity_id, action_url, payload, dedupe_key, is_read, read_at, created_at, updated_at)
    select workspace_id, user_id,
      case type when 'order' then 'order.created' when 'shipping' then 'shipping.sent_to_carrier' when 'inventory' then 'inventory.low_stock' else 'system.announcement' end,
      case type when 'order' then 'orders' when 'shipping' then 'shipping' when 'inventory' then 'inventory' else 'system' end,
      'normal', private.notification_safe_text(title,180), private.notification_safe_text(message,600), entity_type, entity_id,
      case when entity_type = 'order' and entity_id is not null then '/orders?order=' || entity_id else '/notifications' end,
      '{}'::jsonb, 'legacy:' || id, read, case when read then updated_at else null end, created_at, updated_at
    from public.user_notifications on conflict do nothing;
    revoke all on public.user_notifications from anon, authenticated;
    revoke all on function public.create_user_notification(uuid, uuid, text, text, text, uuid, text) from public, anon, authenticated;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function public.emit_notification_event_service(
  p_workspace_id uuid,
  p_event_key text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_recipient_user_id uuid default null,
  p_source_event_id text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.emit_notification_event($1,$2,$3,$4,$5,$6,$7,$8);
$$;

create or replace function public.cleanup_notification_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare removed_notifications integer; removed_outbox integer; disabled_subscriptions integer;
begin
  update public.push_subscriptions set is_active = false, updated_at = now()
  where is_active and (failure_count >= 5 or (expires_at is not null and expires_at <= now()));
  get diagnostics disabled_subscriptions = row_count;
  delete from public.notification_outbox where status in ('sent','discarded','failed') and updated_at < now() - interval '30 days';
  get diagnostics removed_outbox = row_count;
  delete from public.notifications where expires_at <= now() or (is_archived and archived_at < now() - interval '90 days');
  get diagnostics removed_notifications = row_count;
  return jsonb_build_object('notifications',removed_notifications,'outbox',removed_outbox,'subscriptions_disabled',disabled_subscriptions);
end;
$$;

revoke all on function public.emit_notification_event_service(uuid,text,text,uuid,jsonb,text,uuid,text), public.cleanup_notification_data() from public, anon, authenticated;
grant execute on function public.emit_notification_event_service(uuid,text,text,uuid,jsonb,text,uuid,text), public.cleanup_notification_data() to service_role;

-- The scheduled command contains no credential. The SECURITY DEFINER wrapper
-- reads delivery configuration from Vault only while it executes.
-- Required Vault secret names: project_url and notification_worker_secret.
create or replace function private.dispatch_notification_push()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'notification_worker_secret' limit 1;
  if nullif(base_url, '') is null or nullif(worker_secret, '') is null then
    return null;
  end if;
  select net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/notification-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notification-worker-secret', worker_secret
    ),
    body := jsonb_build_object('limit', 50),
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function private.dispatch_notification_push() from public, anon, authenticated;
grant execute on function private.dispatch_notification_push() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'notification-push-dispatch' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'notification-push-dispatch',
    '* * * * *',
    'select private.dispatch_notification_push();'
  );
end;
$$;

commit;
