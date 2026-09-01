begin;

create or replace function public.consume_order_capacity_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_effective jsonb;
  v_subscription_id uuid;
  v_order_limit bigint;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_new_count bigint;
begin
  select owner.owner_user_id into v_owner_id
  from public.workspace_subscription_owners owner
  where owner.workspace_id = p_workspace_id;
  if v_owner_id is null then raise exception 'WORKSPACE_BILLING_OWNER_MISSING' using errcode = '42501'; end if;

  v_effective := public.get_effective_subscription_v1(v_owner_id);
  if not coalesce((v_effective ->> 'operational_access')::boolean, false) then
    raise exception 'SUBSCRIPTION_OPERATIONAL_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  v_subscription_id := (v_effective ->> 'subscription_id')::uuid;
  v_order_limit := (v_effective #>> '{limits,orders}')::bigint;
  v_period_start := (v_effective #>> '{usage,period_start}')::timestamptz;
  v_period_end := (v_effective #>> '{usage,period_end}')::timestamptz;

  if v_order_limit is null then
    return jsonb_build_object('allowed', true, 'unlimited', true, 'subscription_id', v_subscription_id);
  end if;

  insert into public.subscription_usage_counters(subscription_id, period_start, period_end, order_count)
  values (v_subscription_id, v_period_start, v_period_end, 0)
  on conflict (subscription_id, period_start) do nothing;

  update public.subscription_usage_counters counter
  set order_count = counter.order_count + 1, updated_at = now()
  where counter.subscription_id = v_subscription_id
    and counter.period_start = v_period_start
    and counter.order_count < v_order_limit
  returning counter.order_count into v_new_count;

  if v_new_count is null then raise exception 'ORDER_LIMIT_REACHED' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'allowed', true, 'subscription_id', v_subscription_id,
    'used', v_new_count, 'limit', v_order_limit,
    'remaining', greatest(v_order_limit - v_new_count, 0),
    'period_start', v_period_start, 'period_end', v_period_end
  );
end;
$$;

revoke all on function public.consume_order_capacity_v1(uuid) from public, anon;
grant execute on function public.consume_order_capacity_v1(uuid) to authenticated, service_role;

commit;
