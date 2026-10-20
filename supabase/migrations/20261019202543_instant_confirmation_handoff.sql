begin;

-- Save & Next reads only actionable rows. These partial indexes keep the
-- selection path bounded as a workspace queue grows.
create index if not exists orders_confirmation_handoff_workspace_idx
  on public.orders (workspace_id, created_at desc, "Order ID")
  where lower(trim(coalesce(status, 'pending'))) in (
    'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable',
    'wrong_number', 'review', 'in_progress'
  );

create index if not exists orders_confirmation_handoff_agent_idx
  on public.orders (workspace_id, assigned_to, created_at desc, "Order ID")
  where lower(trim(coalesce(status, 'pending'))) in (
    'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable',
    'wrong_number', 'review', 'in_progress'
  );

create index if not exists confirmation_callbacks_due_order_idx
  on public.confirmation_callbacks (workspace_id, order_id, scheduled_at)
  where status = 'scheduled';

-- Keep server authorization and lease acquisition atomic, while choosing the
-- same newest-first order shown by the browser queue. This makes the displayed
-- "Next" order and the server-authorized next order agree and avoids a second
-- multi-request order lookup during every handoff.
create or replace function public.save_confirmation_order_with_lease_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_lease_token uuid,
  p_expected_updated_at timestamptz default null,
  p_status text default null,
  p_is_upsell boolean default null,
  p_total numeric default null,
  p_claim_next boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_lease public.confirmation_work_leases%rowtype;
  v_normalized_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_new_total numeric;
  v_new_variant_price numeric;
  v_next_order_id uuid;
  v_next_lease jsonb;
  v_is_manager boolean;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  v_is_manager := public.can_manage_workspace_team(p_workspace_id);

  select order_row.* into v_order
  from public.orders order_row
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;

  select lease.* into v_lease
  from public.confirmation_work_leases lease
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.lease_token = p_lease_token and lease.agent_id = v_actor_id
    and lease.released_at is null and lease.expires_at > now()
  for update;
  if not found then raise exception using errcode = '55P03', message = 'VALID_WORK_LEASE_REQUIRED'; end if;

  if not v_is_manager and (
    v_order.assigned_to is distinct from v_actor_id
    or not public.confirmation_agent_is_eligible_v1(p_workspace_id, v_actor_id, false, 120)
  ) then raise exception using errcode = '42501', message = 'ORDER_NOT_ASSIGNED_TO_AGENT'; end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'STALE_ORDER_VERSION';
  end if;
  if v_normalized_status is not null and v_normalized_status not in (
    'new', 'pending', 'confirmed', 'scheduled', 'no_answer', 'unreachable',
    'wrong_number', 'busy', 'cancelled', 'refused', 'out_of_stock',
    'blacklisted', 'duplicate', 'review', 'in_progress'
  ) then raise exception using errcode = '22023', message = 'INVALID_CONFIRMATION_STATUS'; end if;
  if p_total is not null and (p_total <= 0 or p_total > 10000000) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TOTAL';
  end if;
  if coalesce(p_is_upsell, false) and p_total is null then
    raise exception using errcode = '22023', message = 'UPSELL_TOTAL_REQUIRED';
  end if;

  v_new_total := coalesce(p_total, v_order.total);
  v_new_variant_price := case when p_total is null then v_order.variant_price
    else round(v_new_total / greatest(coalesce(v_order.quantity, 1), 1)::numeric, 2) end;

  update public.orders order_row
  set status = coalesce(v_normalized_status, order_row.status),
      confirmed_at = case
        when v_normalized_status = 'confirmed' and lower(coalesce(order_row.status, '')) <> 'confirmed' then now()
        else order_row.confirmed_at end,
      confirmation_method = case when v_normalized_status = 'confirmed' then 'call' else order_row.confirmation_method end,
      confirmation_source = case when v_normalized_status = 'confirmed' then 'human' else order_row.confirmation_source end,
      confirmed_by_user_id = case when v_normalized_status = 'confirmed' then v_actor_id else order_row.confirmed_by_user_id end,
      cancelled_at = case
        when v_normalized_status in ('cancelled', 'refused') and lower(coalesce(order_row.status, '')) not in ('cancelled', 'refused') then now()
        else order_row.cancelled_at end,
      is_upsell = coalesce(p_is_upsell, order_row.is_upsell),
      upsell_value = case when p_is_upsell is true then v_new_total when p_is_upsell is false then null else order_row.upsell_value end,
      upsell_at = case when p_is_upsell is true then now() when p_is_upsell is false then null else order_row.upsell_at end,
      upsell_by_user_id = case when p_is_upsell is true then v_actor_id when p_is_upsell is false then null else order_row.upsell_by_user_id end,
      total = v_new_total,
      variant_price = v_new_variant_price,
      updated_at = now()
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  returning order_row.* into v_order;

  insert into public.confirmation_work_lease_events (
    workspace_id, order_id, lease_id, actor_id, event_type, metadata
  ) values (
    p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'ORDER_SAVED',
    jsonb_build_object('status', v_normalized_status, 'claim_next', p_claim_next)
  );

  if p_claim_next or v_normalized_status in ('confirmed', 'cancelled', 'refused', 'out_of_stock', 'blacklisted', 'duplicate') then
    update public.confirmation_work_leases lease
    set released_at = now(), release_reason = case when p_claim_next then 'save_and_next' else 'terminal_outcome' end, updated_at = now()
    where lease.id = v_lease.id;
    insert into public.confirmation_work_lease_events (
      workspace_id, order_id, lease_id, actor_id, event_type, reason
    ) values (
      p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'LEASE_RELEASED',
      case when p_claim_next then 'save_and_next' else 'terminal_outcome' end
    );
  else
    update public.confirmation_work_leases lease
    set heartbeat_at = now(), expires_at = greatest(lease.expires_at, now() + interval '60 seconds'), updated_at = now()
    where lease.id = v_lease.id;
  end if;

  if p_claim_next then
    select next_order."Order ID" into v_next_order_id
    from public.orders next_order
    where next_order.workspace_id = p_workspace_id
      and next_order."Order ID" <> p_order_id
      and (v_is_manager or next_order.assigned_to = v_actor_id)
      and lower(trim(coalesce(next_order.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      )
      and not exists (
        select 1 from public.confirmation_work_leases active_lease
        where active_lease.workspace_id = next_order.workspace_id
          and active_lease.order_id = next_order."Order ID"
          and active_lease.released_at is null and active_lease.expires_at > now()
      )
    order by (
      select min(callback.scheduled_at)
      from public.confirmation_callbacks callback
      where callback.workspace_id = next_order.workspace_id
        and callback.order_id = next_order."Order ID"
        and callback.status = 'scheduled' and callback.scheduled_at <= now()
    ) asc nulls last, next_order.created_at desc, next_order."Order ID"
    limit 1
    for update of next_order skip locked;

    if v_next_order_id is not null then
      v_next_lease := public.acquire_confirmation_work_v1(p_workspace_id, v_next_order_id, 'open', null);
      insert into public.confirmation_work_lease_events (
        workspace_id, order_id, lease_id, actor_id, event_type, metadata
      ) values (
        p_workspace_id, v_next_order_id, (v_next_lease ->> 'lease_id')::uuid,
        v_actor_id, 'NEXT_ORDER_CLAIMED', jsonb_build_object('previous_order_id', p_order_id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id', v_order."Order ID", 'status', v_order.status, 'total', v_order.total,
    'variant_price', v_order.variant_price, 'is_upsell', v_order.is_upsell,
    'upsell_value', v_order.upsell_value, 'upsell_at', v_order.upsell_at,
    'updated_at', v_order.updated_at, 'next_order_id', v_next_order_id,
    'next_lease', v_next_lease
  );
end;
$$;

revoke all on function public.save_confirmation_order_with_lease_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.save_confirmation_order_with_lease_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean) to authenticated;

commit;
