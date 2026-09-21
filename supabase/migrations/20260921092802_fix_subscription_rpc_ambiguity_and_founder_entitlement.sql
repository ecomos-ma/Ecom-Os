begin;

-- A two-argument overload with a default second value makes the one-argument
-- call ambiguous to PostgreSQL/PostgREST (42725). It was never used by the
-- application and its only purpose duplicated the canonical function.
drop function if exists public.get_effective_subscription_v1(uuid, boolean);

-- The founder is a protected Auth identity, not a database row or an
-- administrator assignment. A fresh account with the verified founder email
-- therefore recovers platform authority even after the previous account row
-- has been deleted.
create or replace function public.is_root_founder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) =
      'amineelaaouamecom@gmail.com';
$$;

-- Founder is an internal, hidden zero-cost plan. Null limits deliberately mean
-- unlimited in the subscription engine and it is never returned by the public
-- plan picker.
insert into public.subscription_plans (
  name, description, code, monthly_price_mad, annual_price_mad,
  order_limit, order_period, workspace_limit, team_member_limit,
  integration_limit, mobile_app, whatsapp_automation,
  ai_whatsapp_confirmation_agent, sawty_os, landing_page_os,
  premium_support, is_popular, is_active, is_public, is_official,
  display_order, custom_limits, custom_benefits
)
values (
  'Founder', 'Internal founder entitlement. Not available for purchase.',
  'founder', 0, 0, null, 'month', null, null, null,
  true, true, true, true, true, true,
  false, true, false, true, -100,
  jsonb_build_object('unlimited', true),
  jsonb_build_array('Full platform access', 'No payment required')
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    monthly_price_mad = 0,
    annual_price_mad = 0,
    order_limit = null,
    workspace_limit = null,
    team_member_limit = null,
    integration_limit = null,
    mobile_app = true,
    whatsapp_automation = true,
    ai_whatsapp_confirmation_agent = true,
    sawty_os = true,
    landing_page_os = true,
    premium_support = true,
    is_active = true,
    is_public = false,
    is_official = true,
    display_order = -100,
    custom_limits = jsonb_build_object('unlimited', true),
    custom_benefits = jsonb_build_array('Full platform access', 'No payment required'),
    updated_at = now();

-- Repair the existing founder account without relying on its old UUID.
update public.profiles profile
set role = 'founder',
    is_active = true,
    deleted_at = null
from auth.users auth_user
where auth_user.id = profile.id
  and lower(auth_user.email) = 'amineelaaouamecom@gmail.com';

insert into public.user_subscriptions (
  owner_user_id, plan_id, billing_cycle, status, payment_status,
  current_period_start, current_period_end, activated_at, migration_state
)
select profile.id, plan.id, 'annual', 'active', 'waived',
  now(), null, now(), 'assigned'
from public.profiles profile
join auth.users auth_user on auth_user.id = profile.id
join public.subscription_plans plan on plan.code = 'founder'
where lower(auth_user.email) = 'amineelaaouamecom@gmail.com'
on conflict (owner_user_id) do update
set plan_id = excluded.plan_id,
    billing_cycle = 'annual',
    status = 'active',
    payment_status = 'waived',
    current_period_start = excluded.current_period_start,
    current_period_end = null,
    grace_until = null,
    suspended_at = null,
    suspended_by = null,
    cancelled_at = null,
    cancellation_reason = null,
    migration_state = 'assigned',
    updated_at = now();

insert into public.workspace_subscription_owners (
  workspace_id, owner_user_id, reason, updated_at
)
select profile.workspace_id, profile.id, 'Protected founder entitlement', now()
from public.profiles profile
join auth.users auth_user on auth_user.id = profile.id
where lower(auth_user.email) = 'amineelaaouamecom@gmail.com'
  and profile.workspace_id is not null
on conflict (workspace_id) do update
set owner_user_id = excluded.owner_user_id,
    reason = excluded.reason,
    updated_at = now();

-- Ensure every future re-registration of the protected email is provisioned as
-- the founder from the first transaction, including the unlimited entitlement.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_full_name text;
  v_free_plan_id uuid;
  v_founder_plan_id uuid;
  v_is_founder boolean := lower(coalesce(new.email, '')) = 'amineelaaouamecom@gmail.com';
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User');

  if not v_is_founder and exists (
    select 1
    from public.workspace_invitations invitation
    where invitation.status = 'pending'
      and invitation.revoked_at is null
      and (invitation.expires_at is null or invitation.expires_at > now())
      and lower(invitation.email) = lower(new.email)
  ) then
    insert into public.profiles (id, full_name, email, role, workspace_id, is_active, allowed_sections)
    values (new.id, v_full_name, lower(new.email), 'agent', null, true, '[]'::jsonb)
    on conflict (id) do update
      set full_name = excluded.full_name,
          email = excluded.email;

    insert into public.workspace_limits (profile_id, max_workspaces)
    values (new.id, 1)
    on conflict (profile_id) do nothing;
    return new;
  end if;

  v_workspace_name := coalesce(new.raw_user_meta_data->>'workspace_name', v_full_name || '''s Workspace');
  insert into public.workspaces (name, status, plan)
  values (v_workspace_name, 'active', case when v_is_founder then 'founder' else 'free' end)
  returning id into v_workspace_id;

  insert into public.profiles (id, full_name, email, role, workspace_id, is_active)
  values (new.id, v_full_name, lower(new.email), case when v_is_founder then 'founder' else 'owner' end, v_workspace_id, true)
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        is_active = true,
        deleted_at = null;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  values (new.id, v_workspace_id, true, case when v_is_founder then 'founder' else 'owner' end, 'active')
  on conflict (profile_id, workspace_id) do update
    set is_owner = true,
        role = excluded.role,
        status = 'active';

  if v_is_founder then
    select id into v_founder_plan_id
    from public.subscription_plans
    where code = 'founder';

    insert into public.workspace_subscription_owners (workspace_id, owner_user_id, reason)
    values (v_workspace_id, new.id, 'Protected founder entitlement')
    on conflict (workspace_id) do update
      set owner_user_id = excluded.owner_user_id,
          reason = excluded.reason,
          updated_at = now();

    insert into public.user_subscriptions (
      owner_user_id, plan_id, billing_cycle, status, payment_status,
      current_period_start, current_period_end, activated_at, migration_state
    )
    values (new.id, v_founder_plan_id, 'annual', 'active', 'waived', now(), null, now(), 'assigned')
    on conflict (owner_user_id) do update
      set plan_id = excluded.plan_id,
          billing_cycle = 'annual',
          status = 'active',
          payment_status = 'waived',
          current_period_start = excluded.current_period_start,
          current_period_end = null,
          grace_until = null,
          suspended_at = null,
          suspended_by = null,
          cancelled_at = null,
          cancellation_reason = null,
          migration_state = 'assigned',
          updated_at = now();
  else
    select id into v_free_plan_id
    from public.subscription_plans
    where name = 'free'
    limit 1;

    if v_free_plan_id is not null then
      insert into public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
      values (v_workspace_id, v_free_plan_id, 'pending_activation', now())
      on conflict do nothing;
    end if;
  end if;

  insert into public.workspace_limits (profile_id, max_workspaces)
  values (new.id, case when v_is_founder then 2147483647 else 1 end)
  on conflict (profile_id) do update
    set max_workspaces = excluded.max_workspaces;

  return new;
end;
$$;

-- The platform campaign projection previously omitted the active Legacy Meta
-- connector, so the admin console reported zero campaigns even after syncing.
create or replace function public.platform_list_campaigns_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_platform text default null,
  p_status text default null,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  if not public.has_platform_permission('campaigns.read_all') then
    raise exception 'CAMPAIGNS_READ_REQUIRED' using errcode = '42501';
  end if;

  with tiktok_spend as (
    select insight.workspace_id, insight.entity_id,
      coalesce(sum(insight.spend), 0) as spend,
      coalesce(sum(insight.impressions), 0) as impressions,
      coalesce(sum(insight.clicks), 0) as clicks,
      coalesce(sum(insight.conversions), 0) as conversions,
      max(insight.currency) as currency,
      max(insight.updated_at) as metric_updated_at
    from public.tiktok_ad_insights insight
    where insight.reporting_level = 'campaign'
    group by insight.workspace_id, insight.entity_id
  ), sources as (
    select meta.id, meta.workspace_id, 'meta'::text as platform, meta.meta_campaign_id as external_id,
      meta.campaign_name as name, meta.status, meta.budget, meta.spend, meta.impressions,
      meta.clicks, meta.results::numeric as conversions, meta.cost_per_result,
      null::numeric as attributed_revenue, null::numeric as roas, null::text as currency,
      meta.updated_at, true as metrics_available, false as attribution_available
    from public.meta_campaigns meta
    union all
    select legacy.id, legacy.workspace_id, 'meta'::text, legacy.meta_campaign_id,
      legacy.campaign_name, legacy.status, legacy.budget, legacy.spend, legacy.impressions,
      legacy.clicks, legacy.results::numeric, legacy.cost_per_result,
      null::numeric, null::numeric, connection.currency,
      legacy.updated_at, true, false
    from public.meta_legacy_campaigns legacy
    join public.meta_legacy_connections connection on connection.id = legacy.connection_id
    union all
    select tiktok.id, tiktok.workspace_id, 'tiktok'::text, tiktok.tiktok_campaign_id,
      tiktok.name, tiktok.status, tiktok.budget, coalesce(spend.spend, 0), coalesce(spend.impressions, 0),
      coalesce(spend.clicks, 0), coalesce(spend.conversions, 0),
      case when coalesce(spend.conversions, 0) = 0 then null else round(spend.spend / spend.conversions, 4) end,
      null::numeric, null::numeric, coalesce(spend.currency, tiktok.currency),
      coalesce(spend.metric_updated_at, tiktok.synced_at), spend.entity_id is not null, false
    from public.tiktok_campaigns tiktok
    left join tiktok_spend spend on spend.workspace_id = tiktok.workspace_id and spend.entity_id = tiktok.tiktok_campaign_id
    where not tiktok.is_deleted
    union all
    select campaign.id, campaign.workspace_id, coalesce(nullif(lower(campaign.platform), ''), 'manual'), campaign.id::text,
      campaign.name, 'UNKNOWN', null::numeric, null::numeric, null::bigint, null::bigint,
      null::numeric, null::numeric, null::numeric, null::numeric, null::text,
      campaign.created_at, false, false
    from public.campaigns campaign
  ), campaign_rows as (
    select source.*, workspace.name as workspace_name, owner.owner_user_id,
      owner_profile.full_name as seller_name, coalesce(owner_auth.email, owner_profile.email) as seller_email
    from sources source
    join public.workspaces workspace on workspace.id = source.workspace_id
    left join public.workspace_subscription_owners owner on owner.workspace_id = source.workspace_id
    left join public.profiles owner_profile on owner_profile.id = owner.owner_user_id
    left join auth.users owner_auth on owner_auth.id = owner.owner_user_id
    where workspace.deleted_at is null
  ), filtered as (
    select * from campaign_rows campaign
    where (p_query is null or trim(p_query) = '' or campaign.name ilike '%' || trim(p_query) || '%' or campaign.workspace_name ilike '%' || trim(p_query) || '%' or coalesce(campaign.seller_email, '') ilike '%' || trim(p_query) || '%' or campaign.external_id ilike '%' || trim(p_query) || '%')
      and (p_platform is null or trim(p_platform) = '' or campaign.platform = lower(trim(p_platform)))
      and (p_status is null or trim(p_status) = '' or lower(campaign.status) = lower(trim(p_status)))
      and (p_workspace_id is null or campaign.workspace_id = p_workspace_id)
  ), paged as (
    select * from filtered order by updated_at desc nulls last, id desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by paged.updated_at desc nulls last) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', size_value,
    'attribution_rule', 'ROAS is null unless a verified campaign-to-order attribution source exists.'
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_effective_subscription_v1(uuid) from public, anon;
grant execute on function public.get_effective_subscription_v1(uuid) to authenticated, service_role;
revoke all on function public.is_root_founder() from public, anon;
grant execute on function public.is_root_founder() to authenticated, service_role;
revoke all on function public.platform_list_campaigns_v1(integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.platform_list_campaigns_v1(integer, integer, text, text, text, uuid) to authenticated, service_role;

commit;
