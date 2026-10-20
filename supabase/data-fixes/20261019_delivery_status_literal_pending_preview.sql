-- READ ONLY. Safe preview for the malformed delivery_status default repair.

select
  count(*)::integer as affected_orders,
  count(distinct workspace_id)::integer as affected_workspaces,
  min(created_at) as oldest_affected_order,
  max(created_at) as newest_affected_order
from public.orders
where delivery_status = '''pending''::text';

select
  workspace_id,
  count(*)::integer as affected_orders
from public.orders
where delivery_status = '''pending''::text'
group by workspace_id
order by affected_orders desc, workspace_id;

select
  count(*)::integer as already_canonical_pending
from public.orders
where delivery_status = 'pending';
