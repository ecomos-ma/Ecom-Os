-- Confirmation agents must be able to complete only the orders assigned to
-- them, even when a legacy orders RLS policy is still keyed to an old profile
-- workspace. The function is the authorization boundary; it deliberately does
-- not grant agents general UPDATE access to public.orders.

create or replace function public.save_confirmation_order_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_status text default null,
  p_is_upsell boolean default null,
  p_total numeric default null
)
returns table (
  order_id uuid,
  status text,
  total numeric,
  variant_price numeric,
  is_upsell boolean,
  upsell_value numeric,
  upsell_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_is_manager boolean := false;
  v_has_confirmation_permission boolean := false;
  v_current_assignee uuid;
  v_normalized_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_new_total numeric;
  v_new_variant_price numeric;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  -- Membership is checked directly rather than through subscription access:
  -- agents consume their owner's plan and must never be sent to payment.
  if not exists (
    select 1
    from public.profile_workspaces membership
    where membership.workspace_id = p_workspace_id
      and membership.profile_id = v_actor_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'WORKSPACE_MEMBERSHIP_REQUIRED';
  end if;

  v_is_manager := public.can_manage_workspace_team(p_workspace_id);

  select coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
    into v_has_confirmation_permission
  from public.profiles profile
  where profile.id = v_actor_id
    and coalesce(profile.is_active, true);

  if not coalesce(v_is_manager, false) and not coalesce(v_has_confirmation_permission, false) then
    raise exception using errcode = '42501', message = 'CONFIRMATION_PERMISSION_REQUIRED';
  end if;

  if v_normalized_status is not null
     and v_normalized_status not in (
       'new', 'pending', 'confirmed', 'scheduled', 'no_answer', 'unreachable',
       'wrong_number', 'busy', 'cancelled', 'refused', 'out_of_stock',
       'blacklisted', 'duplicate'
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CONFIRMATION_STATUS';
  end if;

  if p_total is not null and (p_total <= 0 or p_total > 10000000) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TOTAL';
  end if;

  if coalesce(p_is_upsell, false) and p_total is null then
    raise exception using errcode = '22023', message = 'UPSELL_TOTAL_REQUIRED';
  end if;

  select order_row.*
    into v_order
  from public.orders order_row
  where order_row.workspace_id = p_workspace_id
    and order_row."Order ID" = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  select assignment.assigned_to
    into v_current_assignee
  from public.order_assignments assignment
  where assignment.workspace_id = p_workspace_id
    and assignment.order_id = p_order_id
  order by assignment.assigned_at desc, assignment.created_at desc, assignment.id desc
  limit 1;

  if not coalesce(v_is_manager, false)
     and coalesce(v_order.assigned_to, v_current_assignee) is distinct from v_actor_id then
    raise exception using errcode = '42501', message = 'ORDER_NOT_ASSIGNED_TO_AGENT';
  end if;

  v_new_total := coalesce(p_total, v_order.total);
  v_new_variant_price := case
    when p_total is null then v_order.variant_price
    else round(v_new_total / greatest(coalesce(v_order.quantity, 1), 1)::numeric, 2)
  end;

  update public.orders order_row
  set status = coalesce(v_normalized_status, order_row.status),
      confirmed_at = case when v_normalized_status = 'confirmed' then now() else order_row.confirmed_at end,
      confirmation_method = case when v_normalized_status = 'confirmed' then 'call' else order_row.confirmation_method end,
      confirmation_source = case when v_normalized_status = 'confirmed' then 'human' else order_row.confirmation_source end,
      confirmed_by_user_id = case when v_normalized_status = 'confirmed' then v_actor_id else order_row.confirmed_by_user_id end,
      cancelled_at = case when v_normalized_status = 'cancelled' then now() else order_row.cancelled_at end,
      is_upsell = coalesce(p_is_upsell, order_row.is_upsell),
      upsell_value = case
        when p_is_upsell is true then v_new_total
        when p_is_upsell is false then null
        else order_row.upsell_value
      end,
      upsell_at = case
        when p_is_upsell is true then now()
        when p_is_upsell is false then null
        else order_row.upsell_at
      end,
      upsell_by_user_id = case
        when p_is_upsell is true then v_actor_id
        when p_is_upsell is false then null
        else order_row.upsell_by_user_id
      end,
      total = v_new_total,
      variant_price = v_new_variant_price,
      updated_at = now()
  where order_row.workspace_id = p_workspace_id
    and order_row."Order ID" = p_order_id
  returning order_row."Order ID", order_row.status, order_row.total,
    order_row.variant_price, order_row.is_upsell, order_row.upsell_value,
    order_row.upsell_at
  into order_id, status, total, variant_price, is_upsell, upsell_value, upsell_at;

  return next;
end;
$$;

revoke all on function public.save_confirmation_order_v1(uuid, uuid, text, boolean, numeric) from public, anon;
grant execute on function public.save_confirmation_order_v1(uuid, uuid, text, boolean, numeric) to authenticated, service_role;

comment on function public.save_confirmation_order_v1(uuid, uuid, text, boolean, numeric)
  is 'Safely saves confirmation status, upsell flag, and adjusted total for an assigned workspace agent.';
