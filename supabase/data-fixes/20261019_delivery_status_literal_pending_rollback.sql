-- DATA FIX ROLLBACK — requires the exact repair_batch selected by an owner.
-- Replace the UUID below only after inspecting order_delivery_status_repairs.

begin;

do $$
declare
  v_repair_batch constant uuid := '00000000-0000-0000-0000-000000000000';
  v_trigger text;
begin
  if v_repair_batch = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'SET_EXACT_REPAIR_BATCH_BEFORE_ROLLBACK';
  end if;

  -- This rollback is also a textual repair, not a new carrier transition.
  -- Suppress the same downstream business triggers used by the apply script so
  -- rollback cannot fabricate sync jobs, notifications, events, or earnings.
  foreach v_trigger in array array[
    'enqueue_shopify_status_sync_trg',
    'enqueue_youcan_status_sync_trg',
    'mark_tiktok_cod_payment',
    'notification_order_update',
    'order_event_on_change',
    'queue_tiktok_order_events',
    'trg_orders_team_activity',
    'whatsapp_automation_v2_orders',
    'z_sync_agent_order_earnings'
  ]
  loop
    if exists (
      select 1
      from pg_trigger trigger_row
      join pg_class table_row on table_row.oid = trigger_row.tgrelid
      join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public'
        and table_row.relname = 'orders'
        and trigger_row.tgname = v_trigger
        and not trigger_row.tgisinternal
    ) then
      execute format('alter table public.orders disable trigger %I', v_trigger);
    end if;
  end loop;

  update public.orders order_row
  set delivery_status = repair.previous_delivery_status
  from public.order_delivery_status_repairs repair
  where repair.repair_batch = v_repair_batch
    and repair.workspace_id = order_row.workspace_id
    and repair.order_id = order_row."Order ID"
    and order_row.delivery_status = repair.repaired_delivery_status;

  foreach v_trigger in array array[
    'enqueue_shopify_status_sync_trg',
    'enqueue_youcan_status_sync_trg',
    'mark_tiktok_cod_payment',
    'notification_order_update',
    'order_event_on_change',
    'queue_tiktok_order_events',
    'trg_orders_team_activity',
    'whatsapp_automation_v2_orders',
    'z_sync_agent_order_earnings'
  ]
  loop
    if exists (
      select 1
      from pg_trigger trigger_row
      join pg_class table_row on table_row.oid = trigger_row.tgrelid
      join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public'
        and table_row.relname = 'orders'
        and trigger_row.tgname = v_trigger
        and not trigger_row.tgisinternal
    ) then
      execute format('alter table public.orders enable trigger %I', v_trigger);
    end if;
  end loop;
end;
$$;

commit;
