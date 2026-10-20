-- DATA FIX — DO NOT RUN WITHOUT EXPLICIT OWNER APPROVAL.
--
-- This repairs only the exact malformed literal produced by the old database
-- default. It does not infer carrier outcomes and cannot create a delivered,
-- returned, refused, or paid state.

begin;

create table if not exists public.order_delivery_status_repairs (
  id bigint generated always as identity primary key,
  repair_batch uuid not null,
  workspace_id uuid not null,
  order_id uuid not null,
  previous_delivery_status text,
  repaired_delivery_status text not null,
  repaired_at timestamptz not null default now(),
  unique (repair_batch, workspace_id, order_id)
);

do $$
declare
  v_batch uuid := gen_random_uuid();
  v_affected integer;
  v_backed_up integer;
  v_trigger text;
begin
  select count(*)::integer into v_affected
  from public.orders
  where delivery_status = '''pending''::text';

  insert into public.order_delivery_status_repairs (
    repair_batch,
    workspace_id,
    order_id,
    previous_delivery_status,
    repaired_delivery_status
  )
  select
    v_batch,
    workspace_id,
    "Order ID",
    delivery_status,
    'pending'
  from public.orders
  where delivery_status = '''pending''::text'
  on conflict do nothing;

  get diagnostics v_backed_up = row_count;
  if v_backed_up <> v_affected then
    raise exception 'DELIVERY_STATUS_BACKUP_COUNT_MISMATCH';
  end if;

  -- This is a textual default repair, not a carrier transition. Disable only
  -- the downstream order-event/sync triggers that would otherwise create 679
  -- false carrier events, WhatsApp jobs, notifications, or commission checks.
  -- Trigger DDL is transactional: any exception rolls the complete transaction
  -- back, including trigger state.
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

  update public.orders
  set delivery_status = 'pending'
  where delivery_status = '''pending''::text';

  if found and exists (
    select 1 from public.orders where delivery_status = '''pending''::text'
  ) then
    raise exception 'DELIVERY_STATUS_REPAIR_INCOMPLETE';
  end if;

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

-- Post-commit verification (read only):
select count(*)::integer as malformed_rows_remaining
from public.orders
where delivery_status = '''pending''::text';
