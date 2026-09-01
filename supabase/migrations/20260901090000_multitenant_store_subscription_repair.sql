begin;

-- Canonical store lifecycle. The integration row, not a workspace token column,
-- is the authority used by importers and webhooks.
alter table public.integrations
  add column if not exists status text not null default 'inactive',
  add column if not exists external_store_id text,
  add column if not exists store_name text,
  add column if not exists webhook_id text,
  add column if not exists webhook_secret text,
  add column if not exists disconnected_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists credentials_version bigint not null default 1;

alter table public.integrations drop constraint if exists integrations_status_check;
alter table public.integrations
  add constraint integrations_status_check
  check (status in ('active', 'inactive', 'auth_expired', 'error', 'revoked'));

-- Existing generic integration rows predate the lifecycle columns.
update public.integrations
set status = case when access_token is null then 'inactive' else 'active' end,
    updated_at = now()
where status = 'inactive' and access_token is not null;

-- A workspace may have only one canonical connection per provider. Keep the
-- newest row if legacy code previously created duplicates for different users.
update public.integrations set provider = lower(trim(provider));
with ranked as (
  select id,
         row_number() over (
           partition by workspace_id, lower(provider)
           order by connected_at desc nulls last, id desc
         ) as position
  from public.integrations
)
delete from public.integrations item
using ranked
where item.id = ranked.id and ranked.position > 1;

create unique index if not exists integrations_workspace_provider_uidx
  on public.integrations (workspace_id, provider);
create index if not exists integrations_active_store_idx
  on public.integrations (provider, external_store_id, workspace_id)
  where status = 'active';

-- Migrate the only live YouCan credentials into the canonical table. Legacy
-- workspace columns remain temporarily as compatibility mirrors for the UI.
insert into public.integrations (
  user_id, provider, access_token, refresh_token, expires_at, meta,
  connected_at, workspace_id, status, external_store_id, webhook_id,
  webhook_secret, updated_at
)
select
  owner.owner_user_id,
  'youcan',
  workspace.youcan_access_token,
  workspace.youcan_refresh_token,
  workspace.youcan_token_expires_at,
  jsonb_build_object('migrated_from', 'workspaces', 'store_identity_pending_refresh', true),
  now(),
  workspace.id,
  case when workspace.youcan_access_token is null then 'inactive' else 'active' end,
  'legacy:' || workspace.id::text,
  workspace.youcan_webhook_id,
  encode(extensions.gen_random_bytes(24), 'hex'),
  now()
from public.workspaces workspace
join public.workspace_subscription_owners owner on owner.workspace_id = workspace.id
where workspace.youcan_access_token is not null or workspace.youcan_webhook_id is not null
on conflict (workspace_id, provider) do update
set user_id = excluded.user_id,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    status = excluded.status,
    external_store_id = coalesce(public.integrations.external_store_id, excluded.external_store_id),
    webhook_id = coalesce(excluded.webhook_id, public.integrations.webhook_id),
    webhook_secret = coalesce(public.integrations.webhook_secret, excluded.webhook_secret),
    disconnected_at = case when excluded.status = 'active' then null else public.integrations.disconnected_at end,
    updated_at = now();

update public.integration_sync_state sync
set enabled = (integration.status = 'active'),
    sync_lock = case when integration.status = 'active' then sync.sync_lock else null end,
    updated_at = now()
from public.integrations integration
where integration.workspace_id = sync.workspace_id
  and lower(integration.provider) = lower(sync.provider);

update public.orders orders
set source_integration_id = integration.id::text,
    external_order_id = coalesce(orders.external_order_id, orders.youcan_order_id)
from public.integrations integration
where integration.workspace_id = orders.workspace_id
  and integration.provider = 'youcan'
  and orders.source = 'youcan'
  and orders.youcan_order_id is not null
  and (orders.source_integration_id is null or orders.external_order_id is null);

create unique index if not exists orders_source_integration_external_uidx
  on public.orders (workspace_id, source_integration_id, external_order_id);

create or replace function public.enforce_active_order_source_integration_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare integration_id uuid;
begin
  if new.source_integration_id is null then return new; end if;
  begin
    integration_id := new.source_integration_id::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_SOURCE_INTEGRATION' using errcode = '22023';
  end;
  perform 1 from public.integrations integration
  where integration.id = integration_id
    and integration.workspace_id = new.workspace_id
    and integration.status = 'active'
    and integration.access_token is not null
  for key share;
  if not found then
    raise exception 'SOURCE_INTEGRATION_INACTIVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_active_source_integration on public.orders;
create trigger orders_active_source_integration
before insert or update of source_integration_id, external_order_id on public.orders
for each row execute function public.enforce_active_order_source_integration_v1();

create or replace function public.sync_integration_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.provider := lower(trim(new.provider));
  new.updated_at := now();
  if new.status = 'active' then
    new.disconnected_at := null;
  elsif old.status = 'active' and new.status <> 'active' then
    new.disconnected_at := coalesce(new.disconnected_at, now());
    new.webhook_secret := null;
    new.webhook_id := null;
    new.access_token := null;
    new.refresh_token := null;
    new.expires_at := null;
    new.credentials_version := old.credentials_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists integrations_lifecycle_before_write on public.integrations;
create trigger integrations_lifecycle_before_write
before insert or update on public.integrations
for each row execute function public.sync_integration_lifecycle_v1();

create or replace function public.disable_integration_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    update public.integration_sync_state
    set enabled = false, sync_lock = null, updated_at = now()
    where workspace_id = new.workspace_id and lower(provider) = lower(new.provider);
  end if;
  return null;
end;
$$;

drop trigger if exists integrations_disable_sync_after_write on public.integrations;
create trigger integrations_disable_sync_after_write
after insert or update of status on public.integrations
for each row execute function public.disable_integration_sync_v1();

-- The owner-wide subscription authority already exists. Permit active members
-- to resolve their owner's effective plan, and use it for write authorization.
create or replace function public.get_effective_subscription_v1(p_owner_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subscription public.user_subscriptions;
  plan public.subscription_plans;
  limit_override public.subscription_limit_overrides;
  local_now timestamp;
  usage_period_start timestamptz;
  usage_period_end timestamptz;
  usage_count bigint := 0;
  order_limit_value integer;
  order_period_value text;
  workspace_limit_value integer;
  team_limit_value integer;
  integration_limit_value integer;
  operational_access boolean;
  access_reason text;
  entitlements jsonb;
begin
  if p_owner_user_id <> (select auth.uid())
     and not exists (
       select 1
       from public.workspace_subscription_owners owner
       join public.profile_workspaces membership on membership.workspace_id = owner.workspace_id
       where owner.owner_user_id = p_owner_user_id
         and membership.profile_id = (select auth.uid())
         and membership.status = 'active'
     )
     and not public.has_platform_permission('billing.read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SUBSCRIPTION_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into subscription from public.user_subscriptions item
  where item.owner_user_id = p_owner_user_id;
  if not found then
    return jsonb_build_object(
      'owner_user_id', p_owner_user_id, 'subscription_id', null, 'plan', null,
      'status', 'missing', 'payment_status', 'unpaid',
      'migration_state', 'needs_plan_assignment', 'operational_access', false,
      'access_reason', 'subscription_missing', 'limits', null,
      'entitlements', '{}'::jsonb, 'usage', '{}'::jsonb
    );
  end if;

  if subscription.plan_id is not null then
    select * into plan from public.subscription_plans item
    where item.id = subscription.plan_id and item.is_official;
  end if;
  select * into limit_override
  from public.subscription_limit_overrides item
  where item.subscription_id = subscription.id
    and item.revoked_at is null and item.starts_at <= now()
    and (item.ends_at is null or item.ends_at > now())
  order by item.created_at desc limit 1;

  order_limit_value := coalesce(limit_override.order_limit, plan.order_limit);
  order_period_value := coalesce(limit_override.order_period, plan.order_period);
  workspace_limit_value := coalesce(limit_override.workspace_limit, plan.workspace_limit);
  team_limit_value := coalesce(limit_override.team_member_limit, plan.team_member_limit);
  integration_limit_value := coalesce(limit_override.integration_limit, plan.integration_limit);
  local_now := now() at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  if order_period_value = 'day' then
    usage_period_start := date_trunc('day', local_now) at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
    usage_period_end := (date_trunc('day', local_now) + interval '1 day') at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  else
    usage_period_start := date_trunc('month', local_now) at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
    usage_period_end := (date_trunc('month', local_now) + interval '1 month') at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  end if;
  select coalesce(counter.order_count, 0) into usage_count
  from public.subscription_usage_counters counter
  where counter.subscription_id = subscription.id and counter.period_start = usage_period_start;
  usage_count := coalesce(usage_count, 0);

  operational_access := (
    subscription.migration_state in ('legacy_access', 'needs_plan_assignment')
    or subscription.status = 'active'
    or (subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()))
  ) and (subscription.current_period_end is null or subscription.current_period_end > now());
  access_reason := case
    when subscription.current_period_end is not null and subscription.current_period_end <= now() then 'subscription_expired'
    when subscription.migration_state in ('legacy_access', 'needs_plan_assignment') then 'legacy_access_needs_plan_assignment'
    when subscription.status = 'active' then 'active_subscription'
    when subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()) then 'grace_period'
    else 'subscription_' || subscription.status
  end;

  entitlements := jsonb_build_object(
    'mobile_app', coalesce(plan.mobile_app, false),
    'whatsapp_automation', coalesce(plan.whatsapp_automation, false),
    'ai_whatsapp_confirmation_agent', coalesce(plan.ai_whatsapp_confirmation_agent, false),
    'sawty_os', coalesce(plan.sawty_os, false),
    'landing_page_os', coalesce(plan.landing_page_os, false),
    'premium_support', coalesce(plan.premium_support, false)
  );
  select entitlements || coalesce(jsonb_object_agg(active_override.entitlement_key, active_override.enabled), '{}'::jsonb)
  into entitlements
  from (
    select distinct on (override.entitlement_key) override.entitlement_key, override.enabled
    from public.subscription_entitlement_overrides override
    where override.subscription_id = subscription.id and override.revoked_at is null
      and override.starts_at <= now() and (override.ends_at is null or override.ends_at > now())
    order by override.entitlement_key, override.created_at desc
  ) active_override;

  return jsonb_build_object(
    'owner_user_id', subscription.owner_user_id, 'subscription_id', subscription.id,
    'plan', case when plan.id is null then null else jsonb_build_object('id', plan.id, 'code', plan.code, 'name', plan.name) end,
    'billing_cycle', subscription.billing_cycle, 'status', subscription.status,
    'payment_status', subscription.payment_status, 'migration_state', subscription.migration_state,
    'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end,
    'grace_until', subscription.grace_until, 'timezone', subscription.timezone,
    'operational_access', operational_access, 'access_reason', access_reason,
    'limits', jsonb_build_object('orders', order_limit_value, 'order_period', order_period_value,
      'workspaces', workspace_limit_value, 'team_members', team_limit_value, 'integrations', integration_limit_value),
    'entitlements', entitlements,
    'usage', jsonb_build_object(
      'period_start', usage_period_start, 'period_end', usage_period_end, 'orders', usage_count,
      'orders_remaining', case when order_limit_value is null then null else greatest(order_limit_value - usage_count, 0) end,
      'orders_percent', case when order_limit_value is null or order_limit_value = 0 then null else round(usage_count::numeric / order_limit_value * 100, 2) end,
      'workspaces', (select count(*) from public.workspace_subscription_owners owner where owner.owner_user_id = subscription.owner_user_id),
      'team_members', (select count(distinct membership.profile_id) from public.workspace_subscription_owners owner join public.profile_workspaces membership on membership.workspace_id = owner.workspace_id and membership.status = 'active' where owner.owner_user_id = subscription.owner_user_id),
      'integrations', (select count(*) from public.workspace_subscription_owners owner join public.integrations integration on integration.workspace_id = owner.workspace_id and integration.status = 'active' where owner.owner_user_id = subscription.owner_user_id)
    ),
    'active_limit_override_id', limit_override.id
  );
end;
$$;

create or replace function public.workspace_operational_access_v1(p_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare owner_id uuid;
declare effective jsonb;
begin
  if not public.is_active_workspace_member(p_workspace_id) then return false; end if;
  select owner.owner_user_id into owner_id
  from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;
  if owner_id is null then return false; end if;
  effective := public.get_effective_subscription_v1(owner_id);
  return coalesce((effective ->> 'operational_access')::boolean, false);
exception when others then
  return false;
end;
$$;

create or replace function public.get_workspace_allowance_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare effective jsonb;
declare used_value bigint;
declare limit_value bigint;
begin
  if actor_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  effective := public.get_effective_subscription_v1(actor_id);
  limit_value := (effective #>> '{limits,workspaces}')::bigint;
  select count(*) into used_value from public.workspace_subscription_owners where owner_user_id = actor_id;
  return jsonb_build_object(
    'used', used_value, 'limit', limit_value,
    'remaining', case when limit_value is null then null else greatest(limit_value - used_value, 0) end,
    'allowed', coalesce((effective ->> 'operational_access')::boolean, false)
      and (limit_value is null or used_value < limit_value),
    'plan', effective -> 'plan', 'access_reason', effective ->> 'access_reason'
  );
end;
$$;

create or replace function public.switch_profile_workspace(new_workspace_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare updated_profile public.profiles;
declare access jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id = (select auth.uid())
      and membership.workspace_id = new_workspace_id
      and membership.status = 'active'
  ) then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501'; end if;
  access := public.resolve_workspace_access_v1((select auth.uid()), new_workspace_id);
  if not coalesce((access ->> 'allowed')::boolean, false) then
    raise exception 'WORKSPACE_OPERATIONAL_ACCESS_DENIED:%', coalesce(access ->> 'reason', 'unknown') using errcode = '42501';
  end if;
  update public.profiles set workspace_id = new_workspace_id
  where id = (select auth.uid()) returning * into updated_profile;
  return updated_profile;
end;
$$;

-- Remove permissive/legacy seller policies on critical tenant tables, then
-- replace them with one membership read rule and one subscription-aware write rule.
do $$
declare table_name text;
declare policy record;
begin
  foreach table_name in array array['orders','order_items','customers','products','shipments','expenses','transactions','campaigns'] loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('alter table public.%I enable row level security', table_name);
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname not like 'platform_support_%'
    loop
      execute format('drop policy if exists %I on public.%I', policy.policyname, table_name);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_active_workspace_member(workspace_id)))', table_name || '_tenant_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.workspace_operational_access_v1(workspace_id)))', table_name || '_tenant_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.workspace_operational_access_v1(workspace_id))) with check ((select public.workspace_operational_access_v1(workspace_id)))', table_name || '_tenant_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.workspace_operational_access_v1(workspace_id)))', table_name || '_tenant_delete', table_name);
  end loop;
end;
$$;

alter table public.customers alter column workspace_id set not null;
alter table public.order_items alter column workspace_id set not null;
alter table public.shipments alter column workspace_id set not null;
alter table public.expenses alter column workspace_id set not null;

-- Workspaces are readable only through active membership. Platform access is
-- explicit through canonical permissions/support policies, never seller roles.
drop policy if exists "Users and supervisors can read workspaces" on public.workspaces;
drop policy if exists "Users and supervisors can update workspaces" on public.workspaces;
drop policy if exists "workspaces_select_own" on public.workspaces;
drop policy if exists "workspaces_update_own" on public.workspaces;
drop policy if exists "workspaces_update_authorized" on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated
using ((select public.is_active_workspace_member(id)) or (select public.has_platform_permission('workspaces.read')));
create policy workspaces_authorized_update on public.workspaces for update to authenticated
using ((select public.workspace_operational_access_v1(id)) and (select public.has_workspace_role(id, array['owner','admin','manager'])) or (select public.has_platform_permission('workspaces.manage')))
with check ((select public.workspace_operational_access_v1(id)) and (select public.has_workspace_role(id, array['owner','admin','manager'])) or (select public.has_platform_permission('workspaces.manage')));

-- Canonical integrations are service-managed. Sellers can read only a safe
-- status projection through this RPC; tokens and webhook secrets stay hidden.
drop policy if exists "Service role only" on public.integrations;
create policy integrations_service_only on public.integrations for all to authenticated using (false) with check (false);

create or replace function public.get_store_integration_status_v1(p_workspace_id uuid, p_provider text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare item public.integrations;
begin
  if not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into item from public.integrations integration
  where integration.workspace_id = p_workspace_id and lower(integration.provider) = lower(trim(p_provider));
  if not found then return jsonb_build_object('connected', false, 'status', 'inactive'); end if;
  return jsonb_build_object(
    'integration_id', item.id, 'provider', item.provider,
    'connected', item.status = 'active', 'status', item.status,
    'external_store_id', item.external_store_id, 'store_name', item.store_name,
    'connected_at', item.connected_at, 'updated_at', item.updated_at
  );
end;
$$;

-- Product assets use workspace-id as the first path segment. Public reads stay
-- supported, while writes are isolated to active workspace members.
drop policy if exists "Authenticated can delete product images" on storage.objects;
drop policy if exists "Authenticated can update product images" on storage.objects;
drop policy if exists "Authenticated can upload product images" on storage.objects;
drop policy if exists "Authenticated users can delete" on storage.objects;
drop policy if exists "Authenticated users can update" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
create policy product_images_workspace_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.workspace_operational_access_v1(((storage.foldername(name))[1])::uuid)
);
create policy product_images_workspace_update on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.workspace_operational_access_v1(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'product-images' and public.workspace_operational_access_v1(((storage.foldername(name))[1])::uuid));
create policy product_images_workspace_delete on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.workspace_operational_access_v1(((storage.foldername(name))[1])::uuid));

revoke all on function public.workspace_operational_access_v1(uuid) from public, anon;
revoke all on function public.get_workspace_allowance_v1() from public, anon;
revoke all on function public.get_store_integration_status_v1(uuid,text) from public, anon;
grant execute on function public.workspace_operational_access_v1(uuid) to authenticated, service_role;
grant execute on function public.get_workspace_allowance_v1() to authenticated, service_role;
grant execute on function public.get_store_integration_status_v1(uuid,text) to authenticated, service_role;

commit;
