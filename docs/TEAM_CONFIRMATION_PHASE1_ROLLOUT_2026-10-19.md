# Team / Confirmation Phase 1 security rollout

Status: **implemented locally, contract-tested, not deployed**.

This rollout covers the first security slice of the Team, Confirmation, assignment, and payroll program. It does not backfill or rewrite orders, assignments, earnings, invoices, payments, stock, or statuses.

## Migrations

Apply in timestamp order only after the existing migration history has been reconciled in staging:

1. `20261018171517_online_confirmation_assignment.sql`
2. `20261019020000_team_confirmation_phase1_security.sql`
3. `20261019021000_operational_section_rls.sql`
4. `20261019022000_agent_payroll_integrity.sql`
5. `20261019023000_fix_order_delivery_status_default.sql`
6. `20261019024000_workspace_scoped_team_permissions.sql`
7. `20261019025000_confirmation_assignment_modes_and_work_leases.sql`
8. `20261019026000_agent_payment_reversal_and_disputes.sql`

The live project snapshot on 2026-10-19 did not report `20261018171517_online_confirmation_assignment.sql` in its applied migration history. Do not mark online assignment deployed until the migration list and runtime functions/triggers both prove it.

## What changes

- Removes browser execution of internal payroll engines and Team/Confirmation trigger helpers.
- Keeps approved payroll wrappers available and preserves service-role scheduler/trigger behavior.
- Removes two legacy `order_assignments` `ALL` policies.
- Limits assignment history to managers, active support sessions, or the assigned agent.
- Limits direct order reads and updates to managers/support or the active assigned agent with an operational section.
- Limits direct order creation/deletion to managers/support.
- Requires explicit Products/Inventory or Expenses section access for those operational tables.
- Keeps raw `transactions` manager/support-only because no agent Finance section exists in the current permission catalog.
- Removes anonymous table grants from the hardened tables.
- Prevents new overlapping payroll periods and effective rule versions without rewriting historical paid data.
- Makes invoice headers derive from their immutable lines and carries late accrued earnings into a later invoice.
- Stores Team section permissions per workspace while preserving the legacy profile fallback until each membership is edited.
- Adds distinct Manual, Automatic Equal, and Automatic Smart human distribution settings.
- Adds short-lived exclusive work leases, optimistic timestamp checks, audited supervisor takeover, and a server-selected Save & Next path.
- Adds correction-safe payment reversal and dispute resolution. Payment/allocation history is retained, while invoice status and balance derive only from active recorded allocations.
- Fixes the malformed delivery-status default for future rows only. The 679-row historical cleanup remains a separate owner-approved data fix.

## Pre-deployment read-only snapshot

Run these checks in staging and save the results before applying migrations:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 20;

select tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'order_assignments', 'products', 'expenses', 'transactions')
order by tablename, policyname;

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generate_agent_payroll_invoices_internal_v1',
    'materialize_agent_earnings_for_order_v1',
    'sync_agent_order_earnings_v1',
    'sync_agent_event_earnings_v1',
    'run_due_agent_payroll_schedules_v1'
  )
order by p.proname;
```

## Staging verification

1. Apply the migrations to an isolated staging database.
2. Run `supabase test db` so `team_confirmation_phase1_security.test.sql` validates actual grants and policies.
3. Run `npm run test:team`, `npm run typecheck`, and `npm run build`.
4. Test with four real JWT roles: Owner, Supervisor/Manager, assigned Confirmation agent, and a second agent in the same workspace.
5. Repeat the agent calls with a user from a second workspace.

Expected matrix:

| Operation | Owner/manager | Assigned authorized agent | Other agent | Other workspace |
|---|---:|---:|---:|---:|
| Read assigned order | Allow | Allow | Deny | Deny |
| Save assigned confirmation via RPC | Allow | Allow | Deny | Deny |
| Acquire/renew own active work lease | Allow | Allow | Deny | Deny |
| Take over another active lease with reason | Allow | Deny | Deny | Deny |
| Reassign order | Allow | Deny | Deny | Deny |
| Delete order | Allow | Deny | Deny | Deny |
| Read assignment history | Allow | Own only | Deny | Deny |
| Product operation | Allow | Only Products/Inventory permission | Deny | Deny |
| Expense operation | Allow | Only Expenses permission | Deny | Deny |
| Raw transaction operation | Allow | Deny | Deny | Deny |
| Call internal payroll generator | Deny through browser role | Deny | Deny | Deny |

Also verify that service-role imports, shipping webhooks, payroll scheduler execution, the public payroll wrapper, active support sessions, and the existing order assignment UI still work.

Assignment-mode staging cases:

1. Manual: import an eligible order and prove it remains unassigned until an owner assigns it.
2. Equal: heartbeat one, two, then four non-owner Confirmation agents and verify approximately 100%, 50/50%, then 25% each without moving manual/callback/open work.
3. Smart: set batch size 3, heartbeat three agents, add nine eligible orders, and verify three each. Complete one genuine terminal outcome and verify only the completing agent is refilled.
4. Open an order in two agent sessions. The second session must be read-only; expiry must recover; manager takeover must require and retain a reason.
5. Save & Next must persist the first outcome before returning a server-authorized next order and lease.
6. Record a partial payment, open a dispute, resolve/dismiss it, then reverse the payment. Confirm the transfer/allocation/proof rows remain, the payment is marked `reversed`, invoice status/balance is recalculated, and both actions appear in the payroll audit log.

## Rollback strategy

Prefer fixing a failed policy in a forward migration. If staging reveals an access regression, disable only the newly added restrictive policy for the affected command, verify the exact caller, and add the narrow missing authorization path. Do not restore the legacy public `order_assignments` `ALL` policies.

Emergency policy removal (staging only, followed immediately by a corrected migration):

```sql
drop policy if exists orders_scoped_update_boundary on public.orders;
drop policy if exists orders_management_insert_boundary on public.orders;
drop policy if exists orders_management_delete_boundary on public.orders;
drop policy if exists products_section_select_boundary on public.products;
drop policy if exists products_section_insert_boundary on public.products;
drop policy if exists products_section_update_boundary on public.products;
drop policy if exists products_section_delete_boundary on public.products;
drop policy if exists expenses_section_select_boundary on public.expenses;
drop policy if exists expenses_section_insert_boundary on public.expenses;
drop policy if exists expenses_section_update_boundary on public.expenses;
drop policy if exists expenses_section_delete_boundary on public.expenses;
drop policy if exists transactions_management_select_boundary on public.transactions;
drop policy if exists transactions_management_insert_boundary on public.transactions;
drop policy if exists transactions_management_update_boundary on public.transactions;
drop policy if exists transactions_management_delete_boundary on public.transactions;
```

Function EXECUTE grants must not be restored to `PUBLIC`, `anon`, or `authenticated`. If an approved workflow unexpectedly depended on an internal function, expose a checked wrapper instead.

For `20261019025000_confirmation_assignment_modes_and_work_leases.sql`, rollback with a forward migration:

- set every workspace `distribution_mode` to `manual` first;
- remove the two new assignment triggers only after queues are stable;
- restore authenticated execution of `save_confirmation_order_v1` only if the old frontend must be temporarily restored;
- keep lease/event rows for audit rather than deleting them;
- do not delete assignment history or rewrite `orders.assigned_to` during rollback.

For `20261019026000_agent_payment_reversal_and_disputes.sql`, rollback with a forward migration:

- remove the two synchronization triggers only after invoice balances have been reconciled;
- revoke the two authenticated correction wrappers if the UI must be disabled;
- keep all reversed payments, disputes, allocations, proofs, acknowledgments, and audit rows;
- never “roll back” by deleting payment history or changing allocations.

## Production gate

Production deployment requires explicit owner approval after staging role-matrix checks pass. No bulk status normalization, inventory reconciliation, payroll backfill, or invoice rewrite is part of this security rollout.

The optional historical status repair is split into preview/apply/rollback scripts under `supabase/data-fixes`. Run the preview first. The apply and rollback scripts both suppress downstream business triggers transactionally so a textual cleanup cannot create false carrier events, WhatsApp jobs, inventory changes, or commissions.
