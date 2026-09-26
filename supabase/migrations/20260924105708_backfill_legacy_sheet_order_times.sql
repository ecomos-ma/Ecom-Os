-- Previous Sheets sync interpreted timezone-free YYYY-MM-DD HH:MI:SS cells
-- as UTC and used insertion time for created_at. Only unprocessed legacy
-- Sheets rows are eligible; synced_at preserves when they reached EcomOS.
with corrected as (
  select o."Order ID" as order_id,
         o.workspace_id,
         (o.order_date at time zone 'UTC') at time zone 'Africa/Casablanca' as actual_order_time,
         o.created_at as original_import_time
  from public.orders o
  where o.source = 'sheets'
    and o.order_date is not null
    and o.order_received_at is null
)
update public.orders as o
set order_date = corrected.actual_order_time,
    order_received_at = corrected.actual_order_time,
    created_at = corrected.actual_order_time,
    synced_at = coalesce(o.synced_at, corrected.original_import_time)
from corrected
where o."Order ID" = corrected.order_id
  and o.workspace_id = corrected.workspace_id;
