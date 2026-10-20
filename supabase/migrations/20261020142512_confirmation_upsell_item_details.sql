-- Per-order commercial edits never modify the shared product catalog.
alter table public.order_items
  add column if not exists agent_name_override text,
  add column if not exists agent_color text,
  add column if not exists agent_note text;

-- The existing lease-aware save remains the single authority for assignment,
-- status, price, and next-order claiming. This wrapper adds item edits inside
-- the same transaction, so an invalid item rolls the entire save back.
create or replace function public.save_confirmation_order_with_items_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_lease_token uuid,
  p_expected_updated_at timestamptz default null,
  p_status text default null,
  p_is_upsell boolean default null,
  p_total numeric default null,
  p_claim_next boolean default false,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_seen uuid[] := '{}';
  v_name text;
  v_color text;
  v_note text;
  v_quantity integer;
  v_total_quantity integer;
  v_updated_at timestamptz;
  v_lease_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20
     or p_is_upsell is distinct from true then
    raise exception using errcode = '22023', message = 'INVALID_UPSELL_ITEMS';
  end if;

  -- This call checks the signed-in actor, active lease, assignment, status,
  -- optimistic version, and price; it also makes Save & Next atomic.
  v_result := public.save_confirmation_order_with_lease_v1(
    p_workspace_id, p_order_id, p_lease_token, p_expected_updated_at,
    p_status, p_is_upsell, p_total, p_claim_next
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]{1,3}$' then
      raise exception using errcode = '22023', message = 'INVALID_UPSELL_ITEM';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
    v_color := nullif(btrim(coalesce(v_item->>'color', '')), '');
    v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
    if v_quantity < 1 or v_quantity > 999 or v_name is null
       or length(v_name) > 160 or length(coalesce(v_color, '')) > 120
       or length(coalesce(v_note, '')) > 500 then
      raise exception using errcode = '22023', message = 'INVALID_UPSELL_ITEM';
    end if;
    v_item_id := nullif(v_item->>'item_id', '')::uuid;
    if v_item_id is not null then
      if v_item_id = any(v_seen) then
        raise exception using errcode = '22023', message = 'DUPLICATE_UPSELL_ITEM';
      end if;
      v_seen := array_append(v_seen, v_item_id);
      update public.order_items item
      set quantity = v_quantity,
          agent_name_override = v_name,
          agent_color = v_color,
          agent_note = v_note
      where item.id = v_item_id and item.order_id = p_order_id
        and item.workspace_id = p_workspace_id;
      if not found then
        raise exception using errcode = 'P0002', message = 'ORDER_ITEM_NOT_FOUND';
      end if;
    else
      -- Imported legacy orders can have one product on the order row but no
      -- order_items row. Materialize that snapshot only for this order.
      if jsonb_array_length(p_items) <> 1 or exists (
        select 1 from public.order_items item
        where item.order_id = p_order_id and item.workspace_id = p_workspace_id
      ) then
        raise exception using errcode = '22023', message = 'ORDER_ITEM_ID_REQUIRED';
      end if;
      insert into public.order_items (
        workspace_id, order_id, quantity, unit_price,
        agent_name_override, agent_color, agent_note
      ) values (
        p_workspace_id, p_order_id, v_quantity,
        round((v_result->>'total')::numeric / v_quantity, 2),
        v_name, v_color, v_note
      );
    end if;
  end loop;

  select coalesce(sum(item.quantity), 0)::integer into v_total_quantity
  from public.order_items item
  where item.workspace_id = p_workspace_id and item.order_id = p_order_id;

  update public.orders order_row
  set quantity = v_total_quantity,
      variant_price = round(order_row.total / greatest(v_total_quantity, 1)::numeric, 2),
      updated_at = clock_timestamp()
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  returning order_row.updated_at into v_updated_at;

  select lease.id into v_lease_id from public.confirmation_work_leases lease
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.lease_token = p_lease_token;
  insert into public.confirmation_work_lease_events (
    workspace_id, order_id, lease_id, actor_id, event_type, metadata
  ) values (
    p_workspace_id, p_order_id, v_lease_id, (select auth.uid()), 'ORDER_SAVED',
    jsonb_build_object('upsell_items_updated', jsonb_array_length(p_items), 'quantity', v_total_quantity)
  );

  return v_result || jsonb_build_object('updated_at', v_updated_at, 'quantity', v_total_quantity);
end;
$$;

revoke all on function public.save_confirmation_order_with_items_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean, jsonb) from public, anon;
grant execute on function public.save_confirmation_order_with_items_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean, jsonb) to authenticated;
notify pgrst, 'reload schema';
