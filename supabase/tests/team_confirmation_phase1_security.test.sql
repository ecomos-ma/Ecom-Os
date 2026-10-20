begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

select has_function(
  'public',
  'can_access_workspace_section',
  array['uuid', 'text'],
  'Canonical section authorization helper exists'
);

select is(
  (
    select count(*)::integer
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.proname = any(array[
        'notify_agent_payroll_event_v1',
        'enforce_separated_confirmation_recipient_v1',
        'capture_confirmation_event_v1',
        'materialize_agent_earnings_for_order_v1',
        'sync_agent_order_earnings_v1',
        'sync_agent_event_earnings_v1',
        'generate_agent_payroll_invoices_internal_v1',
        'log_confirmation_activity_for_team',
        'sync_order_assignment_for_team',
        'log_team_order_change',
        'run_due_agent_payroll_schedules_v1'
      ])
      and (
        has_function_privilege('anon', function_row.oid, 'EXECUTE')
        or has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      )
  ),
  0,
  'Internal team and payroll functions are not executable by browser roles'
);

select is(
  (
    select count(*)::integer
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.proname = any(array[
        'notify_agent_payroll_event_v1',
        'enforce_separated_confirmation_recipient_v1',
        'capture_confirmation_event_v1',
        'materialize_agent_earnings_for_order_v1',
        'sync_agent_order_earnings_v1',
        'sync_agent_event_earnings_v1',
        'generate_agent_payroll_invoices_internal_v1',
        'log_confirmation_activity_for_team',
        'sync_order_assignment_for_team',
        'log_team_order_change',
        'run_due_agent_payroll_schedules_v1'
      ])
      and has_function_privilege('service_role', function_row.oid, 'EXECUTE')
  ),
  11,
  'Service role retains every required internal function'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_assignments'
      and policyname in ('Workspace isolation for order_assignments', 'oa_workspace')
  ),
  0,
  'Legacy assignment ALL policies are removed'
);

select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'order_assignments' and policyname = 'order_assignments_read_boundary'),
  'RESTRICTIVE',
  'Assignment reads have a restrictive boundary'
);

select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_membership_read_boundary'),
  'RESTRICTIVE',
  'Order reads have a restrictive boundary'
);

select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_scoped_update_boundary'),
  'RESTRICTIVE',
  'Order updates have a restrictive boundary'
);

select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_management_insert_boundary'),
  'RESTRICTIVE',
  'Order inserts are management-scoped'
);

select is(
  (select permissive from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_management_delete_boundary'),
  'RESTRICTIVE',
  'Order deletes are management-scoped'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'products' and permissive = 'RESTRICTIVE' and policyname like 'products_section_%_boundary'),
  4,
  'Products have section-aware boundaries for every operation'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'expenses' and permissive = 'RESTRICTIVE' and policyname like 'expenses_section_%_boundary'),
  4,
  'Expenses have section-aware boundaries for every operation'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'transactions' and permissive = 'RESTRICTIVE' and policyname like 'transactions_management_%_boundary'),
  4,
  'Transactions have management boundaries for every operation'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('order_assignments', 'products', 'expenses', 'transactions')
      and grantee = 'anon'
  ),
  0,
  'Anonymous role has no grants on hardened operational tables'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_assignments', 'products', 'expenses', 'transactions')
      and permissive = 'RESTRICTIVE'
  ),
  17,
  'All seventeen Phase 1 restrictive boundaries are installed'
);

select * from finish();
rollback;
