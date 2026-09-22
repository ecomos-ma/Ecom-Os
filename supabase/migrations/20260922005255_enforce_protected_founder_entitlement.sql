begin;

-- The root founder is a protected Auth identity. Billing rows, profile state,
-- and platform-admin assignments must never be able to revoke this recovery
-- path. The verified JWT email is the sole identity signal.
create or replace function public.is_root_founder()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) =
      'amineelaaouamecom@gmail.com';
$$;

-- A partial unique index backs subscription_plans.code, so ON CONFLICT(code)
-- is not valid. Insert only when missing, then normalize in a separate update.
insert into public.subscription_plans (
  name, description, code, monthly_price_mad, annual_price_mad,
  order_limit, order_period, workspace_limit, team_member_limit,
  integration_limit, mobile_app, whatsapp_automation,
  ai_whatsapp_confirmation_agent, sawty_os, landing_page_os,
  premium_support, is_popular, is_active, is_public, is_official,
  display_order, custom_limits, custom_benefits
)
select
  'Founder', 'Internal founder entitlement. Not available for purchase.',
  'founder', 0, 0, null, 'month', null, null, null,
  true, true, true, true, true, true,
  false, true, false, true, -100,
  jsonb_build_object('unlimited', true),
  jsonb_build_array('Full platform access', 'No payment required')
where not exists (
  select 1 from public.subscription_plans where code = 'founder'
);

update public.subscription_plans
set name = 'Founder',
    description = 'Internal founder entitlement. Not available for purchase.',
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
    updated_at = now()
where code = 'founder';

-- Repair the current account and remove any legacy payment-review lock.
update public.profiles profile
set role = 'founder', is_active = true, deleted_at = null
from auth.users auth_user
where auth_user.id = profile.id
  and lower(auth_user.email) = 'amineelaaouamecom@gmail.com';

insert into public.user_subscriptions (
  owner_user_id, plan_id, billing_cycle, status, payment_status,
  current_period_start, current_period_end, activated_at, migration_state
)
select auth_user.id, plan.id, 'annual', 'active', 'waived',
  now(), null, now(), 'assigned'
from auth.users auth_user
join public.profiles profile on profile.id = auth_user.id
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
    activated_at = coalesce(public.user_subscriptions.activated_at, now()),
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

update public.subscription_payment_requests request
set status = 'waived',
    amount_received_mad = 0,
    reviewed_at = now(),
    admin_note = 'Automatically waived for protected root founder entitlement',
    updated_at = now()
from auth.users auth_user
where request.owner_user_id = auth_user.id
  and lower(auth_user.email) = 'amineelaaouamecom@gmail.com'
  and request.status in ('unpaid', 'submitted', 'reviewing', 'rejected');

-- The deprecated two-argument subscription overload was removed, but the
-- deployed access resolver still called it. Restore the resolver against the
-- canonical one-argument function so every workspace can pass its billing
-- gate again, with the founder identity checked first.
create or replace function public.resolve_workspace_access_v1(
  p_user_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  effective jsonb;
  member_access boolean;
  blocked jsonb;
begin
  if p_user_id <> (select auth.uid())
     and not public.has_platform_permission('support.impersonate_read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'WORKSPACE_ACCESS_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if public.is_root_founder() then
    effective := public.get_effective_subscription_v1(p_user_id);
    return jsonb_build_object(
      'allowed', true,
      'reason', 'root_founder_bypass',
      'workspace_id', p_workspace_id,
      'workspace_owner_id', p_user_id,
      'subscription', effective
    );
  end if;

  select exists (
    select 1
    from public.profile_workspaces membership
    where membership.profile_id = p_user_id
      and membership.workspace_id = p_workspace_id
      and membership.status = 'active'
  ) into member_access;

  if not member_access then
    return jsonb_build_object('allowed', false, 'reason', 'not_active_workspace_member');
  end if;

  select owner.owner_user_id into owner_id
  from public.workspace_subscription_owners owner
  where owner.workspace_id = p_workspace_id;

  if owner_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'workspace_billing_owner_missing');
  end if;

  effective := public.get_effective_subscription_v1(owner_id);
  blocked := public.is_subscription_blocked_v1(p_workspace_id);

  if coalesce((blocked ->> 'blocked')::boolean, false) then
    return jsonb_build_object(
      'allowed', false,
      'reason', blocked ->> 'reason',
      'message', blocked ->> 'message',
      'workspace_id', p_workspace_id,
      'workspace_owner_id', owner_id,
      'subscription', coalesce(blocked -> 'subscription', effective),
      'limit', blocked -> 'limit',
      'used', blocked -> 'used',
      'period_end', blocked ->> 'period_end',
      'block_detail', blocked
    );
  end if;

  return jsonb_build_object(
    'allowed', coalesce((effective ->> 'operational_access')::boolean, false),
    'reason', effective ->> 'access_reason',
    'workspace_id', p_workspace_id,
    'workspace_owner_id', owner_id,
    'subscription', effective
  );
end;
$$;

-- Reapply the entitlement after every future recreation of the Auth account.
-- The zz prefix makes this run after the normal profile/workspace provisioning
-- trigger without replacing or regressing invitation provisioning logic.
create or replace function public.ensure_protected_founder_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  founder_plan_id uuid;
  founder_workspace_id uuid;
begin
  if lower(coalesce(new.email, '')) <> 'amineelaaouamecom@gmail.com' then
    return new;
  end if;

  select profile.workspace_id into founder_workspace_id
  from public.profiles profile
  where profile.id = new.id;

  select plan.id into founder_plan_id
  from public.subscription_plans plan
  where plan.code = 'founder';

  if founder_plan_id is null then
    raise exception 'FOUNDER_PLAN_MISSING' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = 'founder', is_active = true, deleted_at = null
  where id = new.id;

  insert into public.user_subscriptions (
    owner_user_id, plan_id, billing_cycle, status, payment_status,
    current_period_start, current_period_end, activated_at, migration_state
  ) values (
    new.id, founder_plan_id, 'annual', 'active', 'waived',
    now(), null, now(), 'assigned'
  )
  on conflict (owner_user_id) do update
  set plan_id = excluded.plan_id,
      billing_cycle = 'annual',
      status = 'active',
      payment_status = 'waived',
      current_period_start = excluded.current_period_start,
      current_period_end = null,
      grace_until = null,
      activated_at = coalesce(public.user_subscriptions.activated_at, now()),
      suspended_at = null,
      suspended_by = null,
      cancelled_at = null,
      cancellation_reason = null,
      migration_state = 'assigned',
      updated_at = now();

  if founder_workspace_id is not null then
    insert into public.workspace_subscription_owners (
      workspace_id, owner_user_id, reason, updated_at
    ) values (
      founder_workspace_id, new.id, 'Protected founder entitlement', now()
    )
    on conflict (workspace_id) do update
    set owner_user_id = excluded.owner_user_id,
        reason = excluded.reason,
        updated_at = now();
  end if;

  insert into public.workspace_limits (profile_id, max_workspaces)
  values (new.id, 2147483647)
  on conflict (profile_id) do update
  set max_workspaces = excluded.max_workspaces;

  return new;
end;
$$;

drop trigger if exists zz_ensure_protected_founder_entitlement on auth.users;
create trigger zz_ensure_protected_founder_entitlement
after insert on auth.users
for each row
when (lower(coalesce(new.email, '')) = 'amineelaaouamecom@gmail.com')
execute function public.ensure_protected_founder_entitlement();

revoke all on function public.is_root_founder() from public, anon;
grant execute on function public.is_root_founder() to authenticated, service_role;
revoke all on function public.resolve_workspace_access_v1(uuid, uuid) from public, anon;
grant execute on function public.resolve_workspace_access_v1(uuid, uuid) to authenticated, service_role;
revoke all on function public.ensure_protected_founder_entitlement() from public, anon, authenticated;
grant execute on function public.ensure_protected_founder_entitlement() to service_role;

commit;
