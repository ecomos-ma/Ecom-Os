# Complete Subscription & Hard Plan Limit Enforcement SQL Functions

## SQL Function 1: list_official_plans_v1
Returns all active official plans (Starter, Growth, Pro, Scale)
```sql
create or replace function public.list_official_plans_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', plan.code,
    'name', plan.name,
    'description', plan.description,
    'monthly_price_mad', plan.monthly_price_mad,
    'annual_price_mad', plan.annual_price_mad,
    'order_limit', plan.order_limit,
    'order_period', plan.order_period,
    'workspace_limit', plan.workspace_limit,
    'team_member_limit', plan.team_member_limit,
    'integration_limit', plan.integration_limit,
    'entitlements', jsonb_build_object(
      'mobile_app', plan.mobile_app,
      'whatsapp_automation', plan.whatsapp_automation,
      'ai_whatsapp_confirmation_agent', plan.ai_whatsapp_confirmation_agent,
      'sawty_os', plan.sawty_os,
      'landing_page_os', plan.landing_page_os,
      'premium_support', plan.premium_support
    ),
    'is_popular', plan.is_popular,
    'display_order', plan.display_order
  ) order by plan.display_order), '[]'::jsonb)
  from public.subscription_plans plan
  where plan.is_official and plan.is_active;
$$;
```

---

## SQL Function 2: get_effective_subscription_v1
Evaluates the current subscription state including limits, usage, and operational access.
```sql
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
```

---

## SQL Function 3: is_subscription_blocked_v1
**CRITICAL HARD LIMIT ENFORCEMENT** - Checks if a workspace owner's subscription is blocked due to limits, status, or access restrictions.
```sql
create or replace function public.is_subscription_blocked_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare 
  owner_id uuid;
  effective jsonb;
  block_reason text;
begin
  select owner.owner_user_id into owner_id 
  from public.workspace_subscription_owners owner 
  where owner.workspace_id = p_workspace_id;
  
  if owner_id is null then
    return jsonb_build_object(
      'blocked', true, 
      'reason', 'workspace_billing_owner_missing',
      'message', 'This workspace has no billing owner configured. Contact support.'
    );
  end if;
  
  effective := public.get_effective_subscription_v1(owner_id);
  
  -- Check if operational access is denied
  if not coalesce((effective ->> 'operational_access')::boolean, false) then
    block_reason := effective ->> 'access_reason';
    return jsonb_build_object(
      'blocked', true,
      'reason', block_reason,
      'message', 'Your subscription does not permit this operation. Reason: ' || block_reason,
      'subscription', effective
    );
  end if;
  
  -- Check if order limit is reached
  if (effective #>> array['limits', 'orders'])::bigint is not null 
     and (effective #>> array['usage', 'orders'])::bigint >= (effective #>> array['limits', 'orders'])::bigint then
    return jsonb_build_object(
      'blocked', true,
      'reason', 'order_limit_reached',
      'message', 'Your plan has reached its monthly order limit. Please upgrade or wait for the next billing period.',
      'limit', (effective #>> array['limits', 'orders'])::bigint,
      'used', (effective #>> array['usage', 'orders'])::bigint,
      'period_end', effective #>> array['usage', 'period_end'],
      'subscription', effective
    );
  end if;
  
  return jsonb_build_object(
    'blocked', false,
    'reason', 'allowed',
    'subscription', effective
  );
end;
$$;
```

---

## SQL Function 4: resolve_workspace_access_v1
**CORE ACCESS GATE** - Determines if a user can access a workspace (checks membership, subscription, and hard limits).
```sql
create or replace function public.resolve_workspace_access_v1(p_user_id uuid, p_workspace_id uuid)
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

  select exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id = p_user_id and membership.workspace_id = p_workspace_id and membership.status = 'active'
  ) into member_access;

  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;

  if not member_access then
    return jsonb_build_object('allowed', false, 'reason', 'not_active_workspace_member');
  end if;

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
      'period_end', blocked -> 'period_end',
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
```

---

## SQL Function 5: check_order_capacity_v1
Checks if a workspace can still create orders (without consuming capacity).
```sql
create or replace function public.check_order_capacity_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare effective jsonb;
declare order_limit_value bigint;
declare used_value bigint;
begin
  result := public.get_workspace_subscription_v1(p_workspace_id);
  effective := result -> 'effective_subscription';
  if not coalesce((effective ->> 'operational_access')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', effective ->> 'access_reason', 'effective_subscription', effective);
  end if;
  order_limit_value := (effective #>> array['limits', 'orders'])::bigint;
  used_value := coalesce((effective #>> array['usage', 'orders'])::bigint, 0);
  return jsonb_build_object(
    'allowed', order_limit_value is null or used_value < order_limit_value,
    'reason', case when order_limit_value is null or used_value < order_limit_value then 'capacity_available' else 'order_limit_reached' end,
    'limit', order_limit_value,
    'used', used_value,
    'remaining', case when order_limit_value is null then null else greatest(order_limit_value - used_value, 0) end,
    'period_start', effective #>> array['usage', 'period_start'],
    'period_end', effective #>> array['usage', 'period_end']
  );
end;
$$;
```

---

## SQL Function 6: consume_order_capacity_v1
**HARD LIMIT ENFORCEMENT** - Atomically increments order counter; raises exception if limit reached.
```sql
create or replace function public.consume_order_capacity_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare 
  owner_id uuid;
  effective jsonb;
  subscription_id uuid;
  order_limit_value bigint;
  period_start_value timestamptz;
  period_end_value timestamptz;
  current_count bigint;
  new_count bigint;
begin
  -- Get workspace owner
  select owner.owner_user_id into owner_id 
  from public.workspace_subscription_owners owner 
  where owner.workspace_id = p_workspace_id;
  
  if owner_id is null then 
    raise exception 'WORKSPACE_BILLING_OWNER_MISSING' using errcode = '42501';
  end if;
  
  -- Get effective subscription (includes all limits and usage)
  effective := public.get_effective_subscription_v1(owner_id);
  
  -- Check if subscription allows operational access
  if not coalesce((effective ->> 'operational_access')::boolean, false) then
    raise exception 'SUBSCRIPTION_OPERATIONAL_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  
  subscription_id := (effective ->> 'subscription_id')::uuid;
  order_limit_value := (effective #>> array['limits', 'orders'])::bigint;
  period_start_value := (effective #>> array['usage', 'period_start'])::timestamptz;
  period_end_value := (effective #>> array['usage', 'period_end'])::timestamptz;
  
  -- If plan has no order limit, allow unlimited orders
  if order_limit_value is null then
    return jsonb_build_object(
      'allowed', true, 
      'unlimited', true, 
      'subscription_id', subscription_id
    );
  end if;
  
  -- Atomic counter increment with hard limit check
  insert into public.subscription_usage_counters(
    subscription_id, period_start, period_end, order_count
  ) values (subscription_id, period_start_value, period_end_value, 0)
  on conflict (subscription_id, period_start) do nothing;
  
  -- Get current count with FOR UPDATE to lock the row
  select counter.order_count into current_count
  from public.subscription_usage_counters counter
  where counter.subscription_id = subscription_id
    and counter.period_start = period_start_value
  for update;
  
  -- Hard limit check - if already at or above limit, raise exception
  if current_count >= order_limit_value then
    raise exception 'ORDER_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  
  -- Increment counter (this will only succeed if below limit)
  update public.subscription_usage_counters counter
  set order_count = order_count + 1, updated_at = now()
  where counter.subscription_id = subscription_id
    and counter.period_start = period_start_value
    and counter.order_count < order_limit_value
  returning counter.order_count into new_count;
  
  if new_count is null then
    raise exception 'ORDER_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  
  return jsonb_build_object(
    'allowed', true, 
    'subscription_id', subscription_id, 
    'used', new_count, 
    'limit', order_limit_value, 
    'remaining', greatest(order_limit_value - new_count, 0),
    'period_start', period_start_value, 
    'period_end', period_end_value
  );
end;
$$;
```

---

## SQL Function 7: get_workspace_subscription_v1
Gets the subscription info for a specific workspace.
```sql
create or replace function public.get_workspace_subscription_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_active_workspace_member(p_workspace_id)
     and not public.has_platform_permission('billing.read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'WORKSPACE_SUBSCRIPTION_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;
  if owner_id is null then
    return jsonb_build_object('workspace_id', p_workspace_id, 'owner_user_id', null, 'operational_access', false, 'access_reason', 'workspace_billing_owner_missing');
  end if;
  return jsonb_build_object('workspace_id', p_workspace_id, 'owner_user_id', owner_id, 'effective_subscription', public.get_effective_subscription_v1(owner_id));
end;
$$;
```

---

## SQL Function 8: has_workspace_entitlement_v1
Checks if a workspace has a specific feature entitlement.
```sql
create or replace function public.has_workspace_entitlement_v1(p_workspace_id uuid, p_entitlement_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result := public.get_workspace_subscription_v1(p_workspace_id);
  return coalesce((result #>> array['effective_subscription', 'operational_access'])::boolean, false)
    and coalesce((result #>> array['effective_subscription', 'entitlements', p_entitlement_key])::boolean, false);
end;
$$;
```

---

## SQL Function 9: create_subscription_payment_request_v1
Creates a new payment request for initial activation, renewal, or upgrade.
```sql
create or replace function public.create_subscription_payment_request_v1(
  p_plan_code text,
  p_billing_cycle text,
  p_request_type text default 'initial_activation',
  p_payment_method text default null,
  p_transaction_reference text default null,
  p_user_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.subscription_plans;
declare subscription public.user_subscriptions;
declare payment public.subscription_payment_requests;
declare expected_amount numeric(12,2);
declare normalized_cycle text := lower(trim(coalesce(p_billing_cycle, '')));
declare normalized_type text := lower(trim(coalesce(p_request_type, '')));
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  if normalized_cycle not in ('monthly', 'annual') then raise exception 'INVALID_BILLING_CYCLE' using errcode = '22023'; end if;
  if normalized_type not in ('initial_activation', 'renewal', 'upgrade', 'downgrade', 'billing_cycle_change') then raise exception 'INVALID_PAYMENT_REQUEST_TYPE' using errcode = '22023'; end if;
  select * into plan from public.subscription_plans item where item.code = lower(trim(p_plan_code)) and item.is_official and item.is_active;
  if not found then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  expected_amount := case when normalized_cycle = 'annual' then plan.annual_price_mad else plan.monthly_price_mad end;
  insert into public.user_subscriptions(owner_user_id, status, payment_status, migration_state)
  values ((select auth.uid()), 'pending_payment', 'unpaid', 'assigned')
  on conflict (owner_user_id) do nothing;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = (select auth.uid()) for update;
  if exists (
    select 1 from public.subscription_payment_requests existing
    where existing.subscription_id = subscription.id and existing.status in ('unpaid', 'submitted', 'reviewing')
  ) then raise exception 'PAYMENT_REQUEST_ALREADY_UNDER_REVIEW' using errcode = '23505'; end if;
  insert into public.subscription_payment_requests(
    reference, owner_user_id, subscription_id, request_type, current_plan_id,
    requested_plan_id, billing_cycle, expected_amount_mad, currency,
    payment_method, transaction_reference, status, user_note
  ) values (
    'ECOM-' || to_char(now() at time zone 'Africa/Casablanca', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    (select auth.uid()), subscription.id, normalized_type, subscription.plan_id,
    plan.id, normalized_cycle, expected_amount, 'MAD',
    nullif(trim(coalesce(p_payment_method, '')), ''),
    nullif(trim(coalesce(p_transaction_reference, '')), ''),
    'unpaid', nullif(trim(coalesce(p_user_note, '')), '')
  ) returning * into payment;
  update public.user_subscriptions set status = 'pending_payment', payment_status = 'unpaid', updated_at = now() where id = subscription.id;
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_created', jsonb_build_object('payment_request_id', payment.id, 'requested_plan', plan.code, 'billing_cycle', normalized_cycle, 'expected_amount_mad', expected_amount));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'requested_plan', plan.code, 'billing_cycle', payment.billing_cycle, 'expected_amount_mad', payment.expected_amount_mad, 'currency', payment.currency, 'status', payment.status);
end;
$$;
```

---

## SQL Function 10: attach_subscription_payment_proof_v1
Attaches payment proof (receipt) to a payment request and marks it as submitted.
```sql
create or replace function public.attach_subscription_payment_proof_v1(
  p_request_id uuid,
  p_proof_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare payment public.subscription_payment_requests;
begin
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') or p_size_bytes not between 1 and 10485760 then
    raise exception 'INVALID_PAYMENT_PROOF' using errcode = '22023';
  end if;
  if not starts_with(p_proof_path, (select auth.uid())::text || '/') then raise exception 'INVALID_PAYMENT_PROOF_PATH' using errcode = '42501'; end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'subscription-proofs'
      and object.name = p_proof_path
      and (storage.foldername(object.name))[1] = (select auth.uid())::text
  ) then raise exception 'PAYMENT_PROOF_OBJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.subscription_payment_requests request
  set proof_path = p_proof_path, proof_mime_type = p_mime_type, proof_size_bytes = p_size_bytes,
      status = 'submitted', submitted_at = now(), updated_at = now()
  where request.id = p_request_id and request.owner_user_id = (select auth.uid()) and request.status in ('unpaid', 'rejected')
  returning * into payment;
  if not found then raise exception 'PAYMENT_REQUEST_NOT_ATTACHABLE' using errcode = '42501'; end if;
  update public.user_subscriptions set status = 'under_review', payment_status = 'submitted', updated_at = now() where id = payment.subscription_id;
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (payment.subscription_id, (select auth.uid()), 'payment_proof_submitted', jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'submitted_at', payment.submitted_at);
end;
$$;
```

---

## SQL Function 11: platform_review_payment_request_v1
**ADMIN FUNCTION** - Approves, rejects, or waives a payment request.
```sql
create or replace function public.platform_review_payment_request_v1(
  p_request_id uuid,
  p_decision text,
  p_amount_received_mad numeric default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare payment public.subscription_payment_requests;
declare subscription public.user_subscriptions;
declare old_state jsonb;
declare normalized_decision text := lower(trim(coalesce(p_decision, '')));
declare new_payment_status text;
declare period_start_value timestamptz;
declare period_end_value timestamptz;
begin
  if not public.has_platform_permission('billing.approve') then raise exception 'BILLING_APPROVE_REQUIRED' using errcode = '42501'; end if;
  if normalized_decision not in ('approve', 'reject', 'waive') then raise exception 'INVALID_PAYMENT_DECISION' using errcode = '22023'; end if;
  select * into payment from public.subscription_payment_requests request where request.id = p_request_id for update;
  if not found then raise exception 'PAYMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment.status in ('paid', 'waived') and normalized_decision in ('approve', 'waive') then
    return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'idempotent', true);
  end if;
  if payment.status = 'rejected' and normalized_decision = 'reject' then
    return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'idempotent', true);
  end if;
  if payment.status not in ('submitted', 'reviewing') then raise exception 'PAYMENT_REQUEST_NOT_REVIEWABLE' using errcode = '42501'; end if;
  select * into subscription from public.user_subscriptions item where item.id = payment.subscription_id for update;
  old_state := to_jsonb(subscription);
  if normalized_decision = 'reject' then
    update public.subscription_payment_requests set status = 'rejected', amount_received_mad = p_amount_received_mad, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''), reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now() where id = payment.id returning * into payment;
    update public.user_subscriptions set status = 'pending_payment', payment_status = 'rejected', updated_at = now() where id = subscription.id returning * into subscription;
    new_payment_status := 'rejected';
  else
    if normalized_decision = 'approve' and coalesce(p_amount_received_mad, payment.expected_amount_mad) < payment.expected_amount_mad then raise exception 'AMOUNT_RECEIVED_BELOW_EXPECTED' using errcode = '22023'; end if;
    if payment.request_type = 'renewal' and subscription.current_period_end is not null and subscription.current_period_end > now() then
      period_start_value := coalesce(subscription.current_period_start, now());
      period_end_value := case when payment.billing_cycle = 'annual' then subscription.current_period_end + interval '1 year' else subscription.current_period_end + interval '1 month' end;
    else
      period_start_value := now();
      period_end_value := case when payment.billing_cycle = 'annual' then period_start_value + interval '1 year' else period_start_value + interval '1 month' end;
    end if;
    new_payment_status := case when normalized_decision = 'waive' then 'waived' else 'paid' end;
    update public.subscription_payment_requests set status = new_payment_status, amount_received_mad = case when normalized_decision = 'waive' then 0 else coalesce(p_amount_received_mad, expected_amount_mad) end, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''), reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now() where id = payment.id returning * into payment;
    update public.user_subscriptions set plan_id = payment.requested_plan_id, billing_cycle = payment.billing_cycle, status = 'active', payment_status = new_payment_status, current_period_start = period_start_value, current_period_end = period_end_value, grace_until = null, activated_at = coalesce(activated_at, now()), activated_by = (select auth.uid()), migration_state = 'assigned', updated_at = now() where id = subscription.id returning * into subscription;
  end if;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_' || new_payment_status, old_state, to_jsonb(subscription), jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference, 'decision', normalized_decision, 'admin_note', p_admin_note));
  perform public.record_platform_audit('payment_request_' || new_payment_status, 'subscription_payment_request', payment.id, payment.reference, jsonb_build_object('subscription_id', subscription.id, 'owner_user_id', subscription.owner_user_id, 'requested_plan_id', payment.requested_plan_id, 'billing_cycle', payment.billing_cycle, 'amount_received_mad', payment.amount_received_mad));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'subscription_id', subscription.id, 'subscription_status', subscription.status, 'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'idempotent', false);
end;
$$;
```

---

## SQL Function 12: platform_list_payment_requests_v1
**ADMIN FUNCTION** - Lists all payment requests with filtering and pagination.
```sql
create or replace function public.platform_list_payment_requests_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default null,
  p_request_type text default null,
  p_query text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare current_page integer := greatest(coalesce(p_page, 1), 1);
declare size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_platform_permission('billing.read') then raise exception 'BILLING_READ_REQUIRED' using errcode = '42501'; end if;
  with filtered as (
    select request.*, profile.full_name, coalesce(auth_user.email, profile.email) as owner_email,
      current_plan.code as current_plan_code, requested_plan.code as requested_plan_code,
      reviewer.email as reviewer_email
    from public.subscription_payment_requests request
    join public.profiles profile on profile.id = request.owner_user_id
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.subscription_plans current_plan on current_plan.id = request.current_plan_id
    join public.subscription_plans requested_plan on requested_plan.id = request.requested_plan_id
    left join auth.users reviewer on reviewer.id = request.reviewer_id
    where (p_status is null or trim(p_status) = '' or request.status = lower(trim(p_status)))
      and (p_request_type is null or trim(p_request_type) = '' or request.request_type = lower(trim(p_request_type)))
      and (p_query is null or trim(p_query) = '' or request.reference ilike '%' || trim(p_query) || '%' or coalesce(profile.full_name, '') ilike '%' || trim(p_query) || '%' or coalesce(auth_user.email, profile.email, '') ilike '%' || trim(p_query) || '%')
  ), paged as (
    select * from filtered order by submitted_at desc nulls last, created_at desc limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'reference', item.reference, 'owner_user_id', item.owner_user_id,
      'seller_name', item.full_name, 'seller_email', item.owner_email,
      'current_plan', item.current_plan_code, 'requested_plan', item.requested_plan_code,
      'request_type', item.request_type, 'billing_cycle', item.billing_cycle,
      'expected_amount_mad', item.expected_amount_mad, 'amount_received_mad', item.amount_received_mad,
      'currency', item.currency, 'payment_method', item.payment_method,
      'transaction_reference', item.transaction_reference, 'proof_path', item.proof_path,
      'proof_mime_type', item.proof_mime_type, 'proof_size_bytes', item.proof_size_bytes,
      'status', item.status, 'user_note', item.user_note, 'admin_note', item.admin_note,
      'submitted_at', item.submitted_at, 'reviewed_at', item.reviewed_at,
      'reviewer_email', item.reviewer_email, 'created_at', item.created_at
    ) order by item.submitted_at desc nulls last, item.created_at desc) from paged item), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', current_page, 'page_size', size_value
  ) into result;
  return result;
end;
$$;
```

---

## SQL Function 13: platform_list_subscriptions_v1
**ADMIN FUNCTION** - Lists all subscriptions with effective state and usage.
```sql
create or replace function public.platform_list_subscriptions_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_status text default null,
  p_plan_code text default null,
  p_migration_state text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare current_page integer := greatest(coalesce(p_page, 1), 1);
declare size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_platform_permission('billing.read') then raise exception 'BILLING_READ_REQUIRED' using errcode = '42501'; end if;
  with filtered as (
    select subscription.*, profile.full_name, coalesce(auth_user.email, profile.email) as owner_email,
      plan.code as plan_code, plan.name as plan_name,
      (select count(*) from public.workspace_subscription_owners owner where owner.owner_user_id = subscription.owner_user_id) as workspace_count
    from public.user_subscriptions subscription
    join public.profiles profile on profile.id = subscription.owner_user_id
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    where (p_query is null or trim(p_query) = '' or coalesce(profile.full_name, '') ilike '%' || trim(p_query) || '%' or coalesce(auth_user.email, profile.email, '') ilike '%' || trim(p_query) || '%')
      and (p_status is null or trim(p_status) = '' or subscription.status = lower(trim(p_status)))
      and (p_plan_code is null or trim(p_plan_code) = '' or plan.code = lower(trim(p_plan_code)))
      and (p_migration_state is null or trim(p_migration_state) = '' or subscription.migration_state = lower(trim(p_migration_state)))
  ), paged as (
    select * from filtered order by updated_at desc, created_at desc limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'owner_user_id', item.owner_user_id,
      'seller_name', item.full_name, 'seller_email', item.owner_email,
      'plan_code', item.plan_code, 'plan_name', item.plan_name,
      'billing_cycle', item.billing_cycle, 'status', item.status,
      'payment_status', item.payment_status,
      'current_period_start', item.current_period_start,
      'current_period_end', item.current_period_end,
      'grace_until', item.grace_until, 'timezone', item.timezone,
      'migration_state', item.migration_state,
      'workspace_count', item.workspace_count,
      'effective', public.get_effective_subscription_v1(item.owner_user_id),
      'created_at', item.created_at, 'updated_at', item.updated_at
    ) order by item.updated_at desc) from paged item), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', current_page, 'page_size', size_value
  ) into result;
  return result;
end;
$$;
```

---

## SQL Function 14: platform_assign_subscription_v1
**ADMIN FUNCTION** - Manually assigns a subscription to a user.
```sql
create or replace function public.platform_assign_subscription_v1(
  p_owner_user_id uuid,
  p_plan_code text,
  p_billing_cycle text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.subscription_plans;
declare subscription public.user_subscriptions;
declare old_state jsonb := '{}'::jsonb;
declare normalized_cycle text := lower(trim(coalesce(p_billing_cycle, '')));
begin
  if not public.has_platform_permission('billing.manage') then raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501'; end if;
  if normalized_cycle not in ('monthly', 'annual') then raise exception 'INVALID_BILLING_CYCLE' using errcode = '22023'; end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then raise exception 'INVALID_SUBSCRIPTION_PERIOD' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'SUBSCRIPTION_ASSIGNMENT_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into plan from public.subscription_plans item where item.code = lower(trim(p_plan_code)) and item.is_official and item.is_active;
  if not found then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = p_owner_user_id for update;
  if found then old_state := to_jsonb(subscription); end if;
  insert into public.user_subscriptions(
    owner_user_id, plan_id, billing_cycle, status, payment_status,
    current_period_start, current_period_end, grace_until,
    activated_at, activated_by, migration_state, updated_at
  ) values (
    p_owner_user_id, plan.id, normalized_cycle, 'active', 'waived',
    p_period_start, p_period_end, null, now(), (select auth.uid()), 'assigned', now()
  ) on conflict (owner_user_id) do update
  set plan_id = excluded.plan_id, billing_cycle = excluded.billing_cycle,
      status = 'active', payment_status = 'waived',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_until = null, activated_at = coalesce(user_subscriptions.activated_at, now()),
      activated_by = (select auth.uid()), migration_state = 'assigned', updated_at = now()
  returning * into subscription;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'manual_subscription_assigned', old_state, to_jsonb(subscription), jsonb_build_object('plan_code', plan.code, 'billing_cycle', normalized_cycle, 'reason', trim(p_reason)));
  perform public.record_platform_audit('manual_subscription_assigned', 'user_subscription', subscription.id, plan.code, jsonb_build_object('owner_user_id', p_owner_user_id, 'billing_cycle', normalized_cycle, 'period_start', p_period_start, 'period_end', p_period_end, 'reason', trim(p_reason)));
  return public.get_effective_subscription_v1(p_owner_user_id);
end;
$$;
```

---

## SQL Function 15: platform_grant_subscription_grace_v1
**ADMIN FUNCTION** - Grants a grace period for expired subscriptions.
```sql
create or replace function public.platform_grant_subscription_grace_v1(
  p_owner_user_id uuid,
  p_grace_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare subscription public.user_subscriptions;
declare old_state jsonb;
begin
  if not public.has_platform_permission('billing.manage') then raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501'; end if;
  if p_grace_until is null or p_grace_until <= now() or p_grace_until > now() + interval '2 months' then raise exception 'INVALID_GRACE_EXPIRY' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'GRACE_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0002'; end if;
  old_state := to_jsonb(subscription);
  update public.user_subscriptions set status = 'grace', grace_until = p_grace_until, updated_at = now() where id = subscription.id returning * into subscription;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'subscription_grace_granted', old_state, to_jsonb(subscription), jsonb_build_object('grace_until', p_grace_until, 'reason', trim(p_reason)));
  perform public.record_platform_audit('subscription_grace_granted', 'user_subscription', subscription.id, null, jsonb_build_object('owner_user_id', p_owner_user_id, 'grace_until', p_grace_until, 'reason', trim(p_reason)));
  return public.get_effective_subscription_v1(p_owner_user_id);
end;
$$;
```

---

## SQL Function 16: platform_billing_summary_v1
**ADMIN FUNCTION** - Returns aggregate billing dashboard metrics.
```sql
create or replace function public.platform_billing_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_platform_permission('billing.read') then
    raise exception 'BILLING_READ_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'active_count', count(*) filter (where subscription.status = 'active'),
    'pending_payment_count', count(*) filter (where subscription.status = 'pending_payment'),
    'under_review_count', count(*) filter (where subscription.status = 'under_review'),
    'grace_count', count(*) filter (where subscription.status = 'grace'),
    'expiring_count', count(*) filter (
      where subscription.current_period_end >= now()
        and subscription.current_period_end < now() + interval '7 days'
        and subscription.status in ('active', 'grace')
    ),
    'expired_count', count(*) filter (where subscription.status = 'expired'),
    'suspended_count', count(*) filter (where subscription.status = 'suspended'),
    'unassigned_count', count(*) filter (where subscription.plan_id is null),
    'monthly_recurring_revenue_mad', coalesce(sum(
      case
        when subscription.status = 'active' and subscription.billing_cycle = 'monthly' then plan.monthly_price_mad
        when subscription.status = 'active' and subscription.billing_cycle = 'annual' then round(plan.annual_price_mad / 12, 2)
        else 0
      end
    ), 0),
    'annualized_recurring_revenue_mad', coalesce(sum(
      case
        when subscription.status = 'active' and subscription.billing_cycle = 'monthly' then plan.monthly_price_mad * 12
        when subscription.status = 'active' and subscription.billing_cycle = 'annual' then plan.annual_price_mad
        else 0
      end
    ), 0),
    'payments_awaiting_review', (
      select count(*) from public.subscription_payment_requests request
      where request.status in ('submitted', 'reviewing')
    ),
    'official_subscriptions', true,
    'payments', true
  ) into result
  from public.user_subscriptions subscription
  left join public.subscription_plans plan on plan.id = subscription.plan_id;

  return result;
end;
$$;
```

---

## SUMMARY

All 16 SQL functions are now ready to deploy:

1. **list_official_plans_v1** - Fetch all official plans
2. **get_effective_subscription_v1** - Evaluate subscription state (core logic)
3. **is_subscription_blocked_v1** - Hard limit check (blocks on limit reached or invalid status)
4. **resolve_workspace_access_v1** - Core access gate (used by frontend auth)
5. **check_order_capacity_v1** - Check if orders can be created
6. **consume_order_capacity_v1** - Atomic hard limit enforcement (raises exception if limit reached)
7. **get_workspace_subscription_v1** - Get subscription for workspace
8. **has_workspace_entitlement_v1** - Check feature access
9. **create_subscription_payment_request_v1** - User creates payment request
10. **attach_subscription_payment_proof_v1** - User submits payment proof
11. **platform_review_payment_request_v1** - Admin approves/rejects payment
12. **platform_list_payment_requests_v1** - Admin views pending payments
13. **platform_list_subscriptions_v1** - Admin views all subscriptions
14. **platform_assign_subscription_v1** - Admin manually assigns plan
15. **platform_grant_subscription_grace_v1** - Admin grants grace period
16. **platform_billing_summary_v1** - Admin dashboard metrics

**Key enforcement points:**
- `is_subscription_blocked_v1`: Blocks on expired, pending_payment, or limit reached
- `consume_order_capacity_v1`: Atomic increment with hard limit; raises exception on limit reached
- `resolve_workspace_access_v1`: Backend gate that denies access if subscription blocked

This provides complete hard-limit enforcement that cannot be bypassed at the frontend layer.
