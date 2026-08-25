-- Ecom OS - production TikTok Ads integration
-- TikTok Marketing API v1.3, workspace isolation, attribution and Events API queue.

create extension if not exists pgcrypto;
create schema if not exists private;

alter table public.workspaces add column if not exists reporting_currency text;
alter table public.workspaces drop constraint if exists workspaces_reporting_currency_check;
alter table public.workspaces add constraint workspaces_reporting_currency_check
  check (reporting_currency is null or reporting_currency ~ '^[A-Z]{3}$');

create or replace function public.tiktok_is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_active, true)
      and p.deleted_at is null
      and (
        p.workspace_id = p_workspace_id
        or exists (
          select 1 from public.profile_workspaces pw
          where pw.profile_id = p.id and pw.workspace_id = p_workspace_id
        )
      )
  );
$$;

create or replace function public.tiktok_can_access_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_active, true)
      and p.deleted_at is null
      and (
        p.workspace_id = p_workspace_id
        or exists (
          select 1 from public.profile_workspaces pw
          where pw.profile_id = p.id and pw.workspace_id = p_workspace_id
        )
      )
      and (
        p.role in ('founder', 'owner', 'supervisor', 'admin', 'manager')
        or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["TikTok Ads"]'::jsonb
      )
  );
$$;

create or replace function public.tiktok_can_manage_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_active, true)
      and p.deleted_at is null
      and p.role in ('founder', 'owner', 'supervisor', 'admin', 'manager')
      and (
        p.workspace_id = p_workspace_id
        or exists (
          select 1 from public.profile_workspaces pw
          where pw.profile_id = p.id and pw.workspace_id = p_workspace_id
        )
      )
  );
$$;

revoke all on function public.tiktok_is_workspace_member(uuid) from public, anon;
revoke all on function public.tiktok_can_access_workspace(uuid) from public, anon;
revoke all on function public.tiktok_can_manage_workspace(uuid) from public, anon;
grant execute on function public.tiktok_is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.tiktok_can_access_workspace(uuid) to authenticated, service_role;
grant execute on function public.tiktok_can_manage_workspace(uuid) to authenticated, service_role;

-- Explicit statement boundary for SQL Editor copies.
;

create table if not exists public.tiktok_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  return_url text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connected_by uuid not null references auth.users(id) on delete restrict,
  tiktok_account_id text,
  account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  status text not null default 'connecting' check (status in (
    'configuration_required', 'connecting', 'pending_account_selection', 'connected',
    'syncing', 'token_expired', 'permission_required', 'sync_failed', 'disconnected'
  )),
  auto_sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tiktok_oauth_states
  drop constraint if exists tiktok_oauth_states_connection_id_fkey;
alter table public.tiktok_oauth_states
  add constraint tiktok_oauth_states_connection_id_fkey
  foreign key (connection_id) references public.tiktok_connections(id) on delete cascade;

create table if not exists public.tiktok_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.tiktok_connections(id) on delete cascade,
  advertiser_id text not null,
  advertiser_name text not null,
  currency text,
  timezone text,
  is_enabled boolean not null default false,
  reporting_sync_status text not null default 'pending' check (reporting_sync_status in ('pending','syncing','success','failed','disabled')),
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, advertiser_id)
);

create table if not exists public.tiktok_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  advertiser_id text not null,
  tiktok_campaign_id text not null,
  name text not null,
  status text not null default 'UNKNOWN',
  objective text,
  budget numeric(18,4),
  budget_mode text,
  currency text,
  raw_metadata jsonb not null default '{}'::jsonb,
  tiktok_created_at timestamptz,
  tiktok_modified_at timestamptz,
  is_deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, advertiser_id, tiktok_campaign_id)
);

create table if not exists public.tiktok_adgroups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  advertiser_id text not null,
  tiktok_campaign_id text not null,
  tiktok_adgroup_id text not null,
  name text not null,
  status text not null default 'UNKNOWN',
  placement text,
  optimization_goal text,
  bid_strategy text,
  budget numeric(18,4),
  budget_mode text,
  currency text,
  raw_metadata jsonb not null default '{}'::jsonb,
  tiktok_created_at timestamptz,
  tiktok_modified_at timestamptz,
  is_deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, advertiser_id, tiktok_adgroup_id)
);

create table if not exists public.tiktok_ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  advertiser_id text not null,
  tiktok_campaign_id text not null,
  tiktok_adgroup_id text not null,
  tiktok_ad_id text not null,
  tiktok_creative_id text,
  name text not null,
  status text not null default 'UNKNOWN',
  thumbnail_url text,
  preview_url text,
  preview_expires_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  tiktok_created_at timestamptz,
  tiktok_modified_at timestamptz,
  is_deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, advertiser_id, tiktok_ad_id)
);

create table if not exists public.tiktok_ad_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  advertiser_id text not null,
  reporting_level text not null check (reporting_level in ('advertiser','campaign','adgroup','ad')),
  entity_id text not null,
  report_date date not null,
  spend numeric(18,4) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  destination_clicks bigint not null default 0,
  ctr numeric(18,8) not null default 0,
  cpc numeric(18,8) not null default 0,
  cpm numeric(18,8) not null default 0,
  conversions numeric(18,4) not null default 0,
  cost_per_conversion numeric(18,8) not null default 0,
  video_views bigint not null default 0,
  video_watched_2s bigint not null default 0,
  video_watched_6s bigint not null default 0,
  video_views_p25 bigint not null default 0,
  video_views_p50 bigint not null default 0,
  video_views_p75 bigint not null default 0,
  video_views_p100 bigint not null default 0,
  average_video_play numeric(18,4),
  currency text,
  raw_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, advertiser_id, reporting_level, entity_id, report_date)
);

create table if not exists public.tiktok_click_attributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ttclid text not null,
  advertiser_id text,
  campaign_id text,
  adgroup_id text,
  ad_id text,
  creative_id text,
  landing_page text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, ttclid)
);

create table if not exists public.tiktok_events_config (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.tiktok_connections(id) on delete cascade,
  event_source_id text,
  access_token_encrypted text,
  enabled boolean not null default false,
  test_event_code text,
  last_event_sent_at timestamptz,
  last_successful_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create table if not exists public.tiktok_event_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null,
  event_name text not null check (event_name in ('PlaceAnOrder','CompletePayment')),
  event_id text not null,
  order_status_snapshot jsonb not null default '{}'::jsonb,
  attempt_status text not null default 'pending' check (attempt_status in ('pending','processing','retry','success','permanent_failure','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  tiktok_response_code text,
  sanitized_response jsonb,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_id, event_name),
  unique (event_id)
);

-- Omitting the referenced column binds this foreign key to the declared orders
-- primary key, whether that column is named id or the legacy "Order ID".
alter table public.tiktok_event_logs
  drop constraint if exists tiktok_event_logs_order_id_fkey;
alter table public.tiktok_event_logs
  add constraint tiktok_event_logs_order_id_fkey
  foreign key (order_id) references public.orders on delete cascade;

alter table public.orders
  add column if not exists source_platform text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists landing_page text,
  add column if not exists referrer text,
  add column if not exists ttclid text,
  add column if not exists tiktok_advertiser_id text,
  add column if not exists tiktok_campaign_id text,
  add column if not exists tiktok_adgroup_id text,
  add column if not exists tiktok_ad_id text,
  add column if not exists tiktok_creative_id text,
  add column if not exists attribution_data jsonb not null default '{}'::jsonb,
  add column if not exists tiktok_attribution_status text,
  add column if not exists cod_payment_collected boolean;

alter table public.orders drop constraint if exists orders_tiktok_attribution_status_check;
alter table public.orders add constraint orders_tiktok_attribution_status_check
  check (tiktok_attribution_status is null or tiktok_attribution_status in ('Exact','UTM matched','Source only','Unattributed'));

create index if not exists tiktok_oauth_states_expiry_idx on public.tiktok_oauth_states(expires_at) where consumed_at is null;
create index if not exists tiktok_connections_workspace_status_idx on public.tiktok_connections(workspace_id, status);
create index if not exists tiktok_ad_accounts_enabled_idx on public.tiktok_ad_accounts(workspace_id, is_enabled, advertiser_id);
create index if not exists tiktok_campaigns_lookup_idx on public.tiktok_campaigns(workspace_id, advertiser_id, tiktok_campaign_id);
create index if not exists tiktok_adgroups_lookup_idx on public.tiktok_adgroups(workspace_id, advertiser_id, tiktok_campaign_id, tiktok_adgroup_id);
create index if not exists tiktok_ads_lookup_idx on public.tiktok_ads(workspace_id, advertiser_id, tiktok_campaign_id, tiktok_adgroup_id, tiktok_ad_id);
create index if not exists tiktok_insights_date_idx on public.tiktok_ad_insights(workspace_id, advertiser_id, report_date desc);
create index if not exists tiktok_insights_entity_idx on public.tiktok_ad_insights(workspace_id, reporting_level, entity_id, report_date desc);
create index if not exists tiktok_event_queue_idx on public.tiktok_event_logs(attempt_status, next_retry_at, created_at) where attempt_status in ('pending','retry');
create index if not exists orders_tiktok_report_date_idx on public.orders(workspace_id, created_at desc) where source_platform = 'tiktok' or tiktok_attribution_status is not null;
create index if not exists orders_ttclid_idx on public.orders(workspace_id, ttclid) where ttclid is not null;
create index if not exists orders_tiktok_campaign_idx on public.orders(workspace_id, tiktok_campaign_id) where tiktok_campaign_id is not null;
create index if not exists orders_tiktok_adgroup_idx on public.orders(workspace_id, tiktok_adgroup_id) where tiktok_adgroup_id is not null;
create index if not exists orders_tiktok_ad_idx on public.orders(workspace_id, tiktok_ad_id) where tiktok_ad_id is not null;

create or replace function public.tiktok_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['tiktok_connections','tiktok_ad_accounts','tiktok_campaigns','tiktok_adgroups','tiktok_ads','tiktok_ad_insights','tiktok_events_config','tiktok_event_logs']
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.tiktok_set_updated_at()', 'set_' || table_name || '_updated_at', table_name);
  end loop;
end $$;

create or replace function public.tiktok_resolve_order_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare click_row public.tiktok_click_attributions;
declare matched_campaign_id text;
declare campaign_matches integer;
begin
  if new.workspace_id is null then return new; end if;

  if lower(coalesce(new.utm_source, '')) in ('tiktok','tik_tok','tt')
     or lower(coalesce(new.source_platform, '')) = 'tiktok'
     or lower(coalesce(to_jsonb(new)->>'source', '')) like '%tiktok%'
     or new.ttclid is not null
     or new.tiktok_campaign_id is not null
     or new.tiktok_adgroup_id is not null
     or new.tiktok_ad_id is not null then
    new.source_platform := 'tiktok';
  else
    return new;
  end if;

  if new.ttclid is not null then
    select * into click_row from public.tiktok_click_attributions
    where workspace_id = new.workspace_id and ttclid = new.ttclid
      and (expires_at is null or expires_at > now())
    limit 1;
    if found then
      new.tiktok_advertiser_id := coalesce(new.tiktok_advertiser_id, click_row.advertiser_id);
      new.tiktok_campaign_id := coalesce(new.tiktok_campaign_id, click_row.campaign_id);
      new.tiktok_adgroup_id := coalesce(new.tiktok_adgroup_id, click_row.adgroup_id);
      new.tiktok_ad_id := coalesce(new.tiktok_ad_id, click_row.ad_id);
      new.tiktok_creative_id := coalesce(new.tiktok_creative_id, click_row.creative_id);
      new.tiktok_attribution_status := 'Exact';
      return new;
    end if;
  end if;

  if new.tiktok_ad_id is not null or new.tiktok_adgroup_id is not null or new.tiktok_campaign_id is not null then
    new.tiktok_attribution_status := 'Exact';
    return new;
  end if;

  if nullif(trim(coalesce(new.utm_campaign, '')), '') is not null then
    select count(*), min(c.tiktok_campaign_id)
      into campaign_matches, matched_campaign_id
    from public.tiktok_campaigns c
    where c.workspace_id = new.workspace_id
      and not c.is_deleted
      and (c.tiktok_campaign_id = new.utm_campaign or lower(c.name) = lower(new.utm_campaign));
    if campaign_matches = 1 then
      new.tiktok_campaign_id := matched_campaign_id;
      new.tiktok_attribution_status := 'UTM matched';
      return new;
    end if;
  end if;

  new.tiktok_attribution_status := case
    when new.ttclid is not null or nullif(trim(coalesce(new.utm_campaign, '')), '') is not null then 'Unattributed'
    else 'Source only'
  end;
  return new;
end;
$$;

drop trigger if exists resolve_tiktok_order_attribution on public.orders;
create trigger resolve_tiktok_order_attribution
before insert or update of source_platform, utm_source, utm_campaign, ttclid, tiktok_campaign_id, tiktok_adgroup_id, tiktok_ad_id
on public.orders for each row execute function public.tiktok_resolve_order_attribution();

create or replace function public.refresh_tiktok_order_attribution(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.orders
  set utm_campaign = utm_campaign
  where workspace_id = p_workspace_id
    and (
      source_platform = 'tiktok' or ttclid is not null or tiktok_campaign_id is not null
      or lower(coalesce(utm_source, '')) in ('tiktok','tik_tok','tt')
    );
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.refresh_tiktok_order_attribution(uuid) from public, anon, authenticated;
grant execute on function public.refresh_tiktok_order_attribution(uuid) to service_role;

create or replace function public.tiktok_mark_cod_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare effective_status text;
begin
  effective_status := upper(replace(coalesce(to_jsonb(new)->>'shipping_status', new.delivery_status, new.status, ''), ' ', '_'));
  if effective_status = 'DELIVERED' then
    new.cod_payment_collected := true;
  elsif effective_status in ('CANCELLED','CANCELED','REFUSED','RETURNED','FAKE','BLACKLISTED','DUPLICATE','COMING_BACK') then
    new.cod_payment_collected := false;
  end if;
  return new;
end;
$$;

create or replace function public.tiktok_queue_order_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare effective_status text;
declare previous_status text;
declare is_tiktok_order boolean;
declare connection_active boolean;
declare order_identifier uuid;
begin
  order_identifier := coalesce(to_jsonb(new)->>'Order ID', to_jsonb(new)->>'id')::uuid;
  if order_identifier is null then
    raise exception 'orders row has no UUID primary-key value';
  end if;
  effective_status := upper(replace(coalesce(to_jsonb(new)->>'shipping_status', new.delivery_status, new.status, ''), ' ', '_'));
  previous_status := case when tg_op = 'UPDATE' then upper(replace(coalesce(to_jsonb(old)->>'shipping_status', old.delivery_status, old.status, ''), ' ', '_')) else '' end;
  is_tiktok_order := new.source_platform = 'tiktok' or new.tiktok_attribution_status is not null;

  if not is_tiktok_order then return null; end if;
  select exists (
    select 1 from public.tiktok_events_config ec
    join public.tiktok_connections tc on tc.id = ec.connection_id
    where ec.workspace_id = new.workspace_id and ec.enabled and tc.status in ('connected','syncing')
  ) into connection_active;
  if not connection_active then return null; end if;

  if tg_op = 'INSERT' and effective_status not in ('CANCELLED','CANCELED','REFUSED','RETURNED','FAKE','BLACKLISTED','DUPLICATE','COMING_BACK') then
    insert into public.tiktok_event_logs (workspace_id, order_id, event_name, event_id, order_status_snapshot)
    values (
      new.workspace_id, order_identifier, 'PlaceAnOrder',
      'tt_' || encode(digest(new.workspace_id::text || ':' || order_identifier::text || ':PlaceAnOrder', 'sha256'), 'hex'),
      jsonb_build_object('status', new.status, 'delivery_status', new.delivery_status)
    ) on conflict (workspace_id, order_id, event_name) do nothing;
  end if;

  if effective_status = 'DELIVERED' and previous_status <> 'DELIVERED' then
    insert into public.tiktok_event_logs (workspace_id, order_id, event_name, event_id, order_status_snapshot)
    values (
      new.workspace_id, order_identifier, 'CompletePayment',
      'tt_' || encode(digest(new.workspace_id::text || ':' || order_identifier::text || ':CompletePayment', 'sha256'), 'hex'),
      jsonb_build_object('status', new.status, 'delivery_status', new.delivery_status, 'cod_payment_collected', true)
    ) on conflict (workspace_id, order_id, event_name) do nothing;
  elsif effective_status in ('CANCELLED','CANCELED','REFUSED','RETURNED','FAKE','BLACKLISTED','DUPLICATE','COMING_BACK') then
    update public.tiktok_event_logs
      set attempt_status = 'cancelled', updated_at = now()
      where workspace_id = new.workspace_id and order_id = order_identifier and event_name = 'CompletePayment' and attempt_status <> 'success';
  end if;
  return null;
end;
$$;

drop trigger if exists mark_tiktok_cod_payment on public.orders;
create trigger mark_tiktok_cod_payment
before insert or update of status, delivery_status, shipping_status
on public.orders for each row execute function public.tiktok_mark_cod_payment();

drop trigger if exists queue_tiktok_order_events on public.orders;
create trigger queue_tiktok_order_events
after insert or update of status, delivery_status, shipping_status, cod_payment_collected
on public.orders for each row execute function public.tiktok_queue_order_events();

alter table public.tiktok_oauth_states enable row level security;
alter table public.tiktok_connections enable row level security;
alter table public.tiktok_ad_accounts enable row level security;
alter table public.tiktok_campaigns enable row level security;
alter table public.tiktok_adgroups enable row level security;
alter table public.tiktok_ads enable row level security;
alter table public.tiktok_ad_insights enable row level security;
alter table public.tiktok_click_attributions enable row level security;
alter table public.tiktok_events_config enable row level security;
alter table public.tiktok_event_logs enable row level security;

revoke all on public.tiktok_oauth_states, public.tiktok_connections, public.tiktok_events_config from anon, authenticated;
revoke all on public.tiktok_ad_accounts, public.tiktok_campaigns, public.tiktok_adgroups, public.tiktok_ads, public.tiktok_ad_insights, public.tiktok_click_attributions, public.tiktok_event_logs from anon, authenticated;
grant select on public.tiktok_ad_accounts, public.tiktok_campaigns, public.tiktok_adgroups, public.tiktok_ads, public.tiktok_ad_insights to authenticated;
grant select on public.tiktok_event_logs to authenticated;

drop policy if exists tiktok_ad_accounts_select on public.tiktok_ad_accounts;
drop policy if exists tiktok_campaigns_select on public.tiktok_campaigns;
drop policy if exists tiktok_adgroups_select on public.tiktok_adgroups;
drop policy if exists tiktok_ads_select on public.tiktok_ads;
drop policy if exists tiktok_ad_insights_select on public.tiktok_ad_insights;
drop policy if exists tiktok_event_logs_select on public.tiktok_event_logs;
create policy tiktok_ad_accounts_select on public.tiktok_ad_accounts for select to authenticated using ((select public.tiktok_can_access_workspace(workspace_id)));
create policy tiktok_campaigns_select on public.tiktok_campaigns for select to authenticated using ((select public.tiktok_can_access_workspace(workspace_id)));
create policy tiktok_adgroups_select on public.tiktok_adgroups for select to authenticated using ((select public.tiktok_can_access_workspace(workspace_id)));
create policy tiktok_ads_select on public.tiktok_ads for select to authenticated using ((select public.tiktok_can_access_workspace(workspace_id)));
create policy tiktok_ad_insights_select on public.tiktok_ad_insights for select to authenticated using ((select public.tiktok_can_access_workspace(workspace_id)));
create policy tiktok_event_logs_select on public.tiktok_event_logs for select to authenticated using ((select public.tiktok_can_manage_workspace(workspace_id)));

create or replace function public.get_tiktok_integration_status(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.tiktok_can_access_workspace(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_REQUIRED';
  end if;

  select jsonb_build_object(
    'state', case
      when c.status in ('token_expired', 'permission_required') then 'reauth_required'
      else coalesce(c.status, 'not_connected')
    end,
    'connection', case when c.id is null then null else jsonb_build_object(
      'id', c.id,
      'status', c.status,
      'account_name', c.account_name,
      'tiktok_account_id', c.tiktok_account_id,
      'auto_sync_enabled', c.auto_sync_enabled,
      'last_sync_at', c.last_sync_at,
      'last_successful_sync_at', c.last_successful_sync_at,
      'last_sync_error', c.last_sync_error,
      'token_expires_at', c.token_expires_at,
      'created_at', c.created_at
    ) end,
    'ad_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'advertiser_id', a.advertiser_id, 'advertiser_name', a.advertiser_name,
        'currency', a.currency, 'timezone', a.timezone, 'is_enabled', a.is_enabled,
        'reporting_sync_status', a.reporting_sync_status, 'last_sync_at', a.last_sync_at,
        'last_successful_sync_at', a.last_successful_sync_at, 'last_sync_error', a.last_sync_error
      ) order by a.advertiser_name)
      from public.tiktok_ad_accounts a where a.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'events_api', case when e.id is null then null else jsonb_build_object(
      'enabled', e.enabled, 'event_source_id', e.event_source_id,
      'has_access_token', e.access_token_encrypted is not null,
      'has_test_event_code', nullif(e.test_event_code, '') is not null,
      'last_event_sent_at', e.last_event_sent_at,
      'last_successful_event_at', e.last_successful_event_at,
      'last_error', e.last_error
    ) end
  ) into result
  from (select 1) seed
  left join lateral (
    select * from public.tiktok_connections candidate
    where candidate.workspace_id = p_workspace_id
    order by (candidate.status <> 'disconnected') desc, candidate.created_at desc
    limit 1
  ) c on true
  left join public.tiktok_events_config e on e.workspace_id = p_workspace_id;
  return result;
end;
$$;

revoke all on function public.get_tiktok_integration_status(uuid) from public, anon;
grant execute on function public.get_tiktok_integration_status(uuid) to authenticated, service_role;

-- Vault-backed scheduler installer. It deliberately stores no key in migration SQL.
-- Required Vault secret names: project_url, publishable_key, tiktok_cron_secret.
create or replace function private.install_tiktok_cron_jobs()
returns void
language plpgsql
security definer
set search_path = private, public, vault, cron
as $$
declare base_url text;
declare api_key text;
declare cron_secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'publishable_key' limit 1;
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'tiktok_cron_secret' limit 1;
  if base_url is null or api_key is null or cron_secret is null then
    raise exception 'Create Vault secrets project_url, publishable_key, and tiktok_cron_secret first';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('tiktok-sync-recent','tiktok-sync-historical','tiktok-events-delivery');
  perform cron.schedule('tiktok-sync-recent', '*/20 * * * *', format(
    $job$select net.http_post(url := %L, headers := %L::jsonb, body := '{"scheduled":true,"days":3}'::jsonb, timeout_milliseconds := 55000);$job$,
    base_url || '/functions/v1/tiktok-sync', jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text
  ));
  perform cron.schedule('tiktok-sync-historical', '17 2 * * *', format(
    $job$select net.http_post(url := %L, headers := %L::jsonb, body := '{"scheduled":true,"days":14}'::jsonb, timeout_milliseconds := 55000);$job$,
    base_url || '/functions/v1/tiktok-sync', jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text
  ));
  perform cron.schedule('tiktok-events-delivery', '*/5 * * * *', format(
    $job$select net.http_post(url := %L, headers := %L::jsonb, body := '{"scheduled":true}'::jsonb, timeout_milliseconds := 55000);$job$,
    base_url || '/functions/v1/tiktok-events', jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text
  ));
end;
$$;

revoke all on function private.install_tiktok_cron_jobs() from public, anon, authenticated;
grant execute on function private.install_tiktok_cron_jobs() to service_role;
