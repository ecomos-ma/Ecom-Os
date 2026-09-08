begin;

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
     and not public.has_platform_permission('billing.read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SUBSCRIPTION_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into subscription
  from public.user_subscriptions item
  where item.owner_user_id = p_owner_user_id;

  if not found then
    return jsonb_build_object(
      'owner_user_id', p_owner_user_id,
      'subscription_id', null,
      'plan', null,
      'status', 'missing',
      'payment_status', 'unpaid',
      'migration_state', 'needs_plan_assignment',
      'operational_access', false,
      'access_reason', 'subscription_missing',
      'limits', null,
      'entitlements', '{}'::jsonb,
      'usage', '{}'::jsonb
    );
  end if;

  if subscription.plan_id is not null then
    select * into plan from public.subscription_plans item where item.id = subscription.plan_id and item.is_official;
  end if;

  select * into limit_override
  from public.subscription_limit_overrides item
  where item.subscription_id = subscription.id
    and item.revoked_at is null
    and item.starts_at <= now()
    and (item.ends_at is null or item.ends_at > now())
  order by item.created_at desc
  limit 1;

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

  operational_access := subscription.migration_state in ('legacy_access', 'needs_plan_assignment')
    or subscription.status = 'active'
    or (subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()));
  access_reason := case
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
    select distinct on (override.entitlement_key)
      override.entitlement_key,
      override.enabled
    from public.subscription_entitlement_overrides override
    where override.subscription_id = subscription.id
      and override.revoked_at is null
      and override.starts_at <= now()
      and (override.ends_at is null or override.ends_at > now())
    order by override.entitlement_key, override.created_at desc
  ) active_override;

  return jsonb_build_object(
    'owner_user_id', subscription.owner_user_id,
    'subscription_id', subscription.id,
    'paypal_subscription_id', subscription.paypal_subscription_id,
    'plan', case when plan.id is null then null else jsonb_build_object('id', plan.id, 'code', plan.code, 'name', plan.name) end,
    'billing_cycle', subscription.billing_cycle,
    'status', subscription.status,
    'payment_status', subscription.payment_status,
    'migration_state', subscription.migration_state,
    'current_period_start', subscription.current_period_start,
    'current_period_end', subscription.current_period_end,
    'grace_until', subscription.grace_until,
    'timezone', subscription.timezone,
    'operational_access', operational_access,
    'access_reason', access_reason,
    'limits', jsonb_build_object(
      'orders', order_limit_value,
      'order_period', order_period_value,
      'workspaces', workspace_limit_value,
      'team_members', team_limit_value,
      'integrations', integration_limit_value
    ),
    'entitlements', entitlements,
    'usage', jsonb_build_object(
      'period_start', usage_period_start,
      'period_end', usage_period_end,
      'orders', usage_count,
      'orders_remaining', case when order_limit_value is null then null else greatest(order_limit_value - usage_count, 0) end,
      'orders_percent', case when order_limit_value is null or order_limit_value = 0 then null else round(usage_count::numeric / order_limit_value * 100, 2) end,
      'workspaces', (select count(*) from public.workspace_subscription_owners owner where owner.owner_user_id = subscription.owner_user_id),
      'team_members', (select count(distinct membership.profile_id) from public.workspace_subscription_owners owner join public.profile_workspaces membership on membership.workspace_id = owner.workspace_id and membership.status = 'active' where owner.owner_user_id = subscription.owner_user_id),
      'integrations', (select count(*) from public.workspace_subscription_owners owner join public.integrations integration on integration.workspace_id = owner.workspace_id where owner.owner_user_id = subscription.owner_user_id)
    ),
    'active_limit_override_id', limit_override.id
  );
end;
$$;
commit;
