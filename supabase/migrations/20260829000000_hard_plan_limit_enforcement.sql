begin;

-- Enhanced hard plan limit enforcement
-- Ensures that when a plan limit is reached, the account is immediately blocked
-- This is a backend-enforced hard limit that cannot be bypassed

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

-- Add a helper function to check if a workspace's owner subscription is blocked
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

-- Replace consume_order_capacity_v1 with stricter atomic enforcement
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
  subscription_status text;
  grace_until_value timestamptz;
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
  -- This is done in a transaction to prevent race conditions
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

-- Grant execute permissions
revoke all on function public.is_subscription_blocked_v1(uuid) from public, anon;
grant execute on function public.is_subscription_blocked_v1(uuid) to authenticated, service_role;

commit;
