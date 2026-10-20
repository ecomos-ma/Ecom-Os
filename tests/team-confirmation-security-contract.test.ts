import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20261019020000_team_confirmation_phase1_security.sql";

test("payroll engines and team trigger helpers are not browser-callable", () => {
  const migration = read(migrationPath);
  const protectedFunctions = [
    "notify_agent_payroll_event_v1\\(\\)",
    "enforce_separated_confirmation_recipient_v1\\(\\)",
    "capture_confirmation_event_v1\\(\\)",
    "materialize_agent_earnings_for_order_v1\\(uuid, uuid\\)",
    "sync_agent_order_earnings_v1\\(\\)",
    "sync_agent_event_earnings_v1\\(\\)",
    "generate_agent_payroll_invoices_internal_v1\\(uuid, timestamptz, timestamptz, uuid\\)",
    "log_confirmation_activity_for_team\\(\\)",
    "sync_order_assignment_for_team\\(\\)",
    "log_team_order_change\\(\\)",
    "run_due_agent_payroll_schedules_v1\\(\\)",
  ];

  for (const signature of protectedFunctions) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`, "i"),
      `missing browser-role revoke for ${signature}`,
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature} to service_role`, "i"),
      `missing service-role grant for ${signature}`,
    );
  }
});

test("orders enforce management, support, or current-assignee row boundaries", () => {
  const migration = read(migrationPath);

  assert.match(migration, /orders_membership_read_boundary[\s\S]*as restrictive[\s\S]*for select/i);
  assert.match(migration, /orders_scoped_update_boundary[\s\S]*as restrictive[\s\S]*for update/i);
  assert.match(migration, /orders_management_insert_boundary[\s\S]*as restrictive[\s\S]*for insert/i);
  assert.match(migration, /orders_management_delete_boundary[\s\S]*as restrictive[\s\S]*for delete/i);
  assert.match(migration, /can_manage_workspace_team\(workspace_id\)/);
  assert.match(migration, /has_active_support_session_for_workspace\(workspace_id, true\)/);
  assert.match(migration, /assigned_to = \(select auth\.uid\(\)\)/);
  assert.match(migration, /is_active_workspace_member\(workspace_id\)/);
  assert.match(migration, /array\['Orders', 'Confirmation', 'Shipping'\]/);
  assert.doesNotMatch(
    migration.match(/orders_management_insert_boundary[\s\S]*?;\s*\n\s*drop policy/i)?.[0] ?? "",
    /assigned_to =/,
  );
  assert.doesNotMatch(
    migration.match(/orders_management_delete_boundary[\s\S]*?;\s*\n\s*--/i)?.[0] ?? "",
    /assigned_to =/,
  );
});

test("assignment history drops legacy public writes and scopes reads", () => {
  const migration = read(migrationPath);

  assert.match(migration, /drop policy if exists "Workspace isolation for order_assignments"/i);
  assert.match(migration, /drop policy if exists oa_workspace/i);
  assert.match(migration, /order_assignments_manager_all[\s\S]*for all[\s\S]*to authenticated/i);
  assert.match(migration, /order_assignments_assignee_select[\s\S]*for select[\s\S]*assigned_to = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /order_assignments_read_boundary[\s\S]*as restrictive[\s\S]*for select/i);
  assert.match(migration, /revoke all on table public\.order_assignments from anon/i);
  assert.match(migration, /order_assignments_workspace_assignee_latest_idx/);
});

test("products, expenses, and transactions require a manager or explicit section", () => {
  const migration = read("supabase/migrations/20261019021000_operational_section_rls.sql");

  assert.match(migration, /create or replace function public\.can_access_workspace_section/);
  assert.match(migration, /membership\.profile_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /profile\.allowed_sections/);
  assert.match(migration, /products_section_select_boundary[\s\S]*as restrictive for select/i);
  assert.match(migration, /can_access_workspace_section\(workspace_id, 'Products'\)/);
  assert.match(migration, /can_access_workspace_section\(workspace_id, 'Inventory'\)/);
  assert.match(migration, /expenses_section_select_boundary[\s\S]*as restrictive for select/i);
  assert.match(migration, /can_access_workspace_section\(workspace_id, 'Expenses'\)/);
  assert.match(migration, /transactions_management_select_boundary[\s\S]*can_manage_workspace_team\(workspace_id\)/i);
  assert.doesNotMatch(
    migration.match(/transactions_management_select_boundary[\s\S]*?;\s*\n\s*drop policy/i)?.[0] ?? "",
    /can_access_workspace_section/,
  );
  assert.match(migration, /revoke all on table public\.products, public\.expenses, public\.transactions from anon/i);
});

test("delivery status default is corrected without silently rewriting old orders", () => {
  const migration = read("supabase/migrations/20261019023000_fix_order_delivery_status_default.sql");
  const preview = read("supabase/data-fixes/20261019_delivery_status_literal_pending_preview.sql");
  const apply = read("supabase/data-fixes/20261019_delivery_status_literal_pending_apply.sql");
  const rollback = read("supabase/data-fixes/20261019_delivery_status_literal_pending_rollback.sql");

  assert.match(migration, /alter column delivery_status set default 'pending'/i);
  assert.doesNotMatch(migration, /update public\.orders/i);
  assert.match(preview, /where delivery_status = '''pending''::text'/);
  assert.doesNotMatch(preview, /\b(update|insert|delete|alter|drop)\b/i);
  assert.match(apply, /DO NOT RUN WITHOUT EXPLICIT OWNER APPROVAL/);
  assert.match(apply, /order_delivery_status_repairs/);
  assert.match(apply, /DELIVERY_STATUS_BACKUP_COUNT_MISMATCH/);
  assert.match(apply, /set delivery_status = 'pending'/);
  assert.match(apply, /disable trigger %I/);
  assert.match(apply, /enable trigger %I/);
  assert.match(apply, /z_sync_agent_order_earnings/);
  assert.match(rollback, /SET_EXACT_REPAIR_BATCH_BEFORE_ROLLBACK/);
  assert.match(rollback, /disable trigger %I/);
  assert.match(rollback, /enable trigger %I/);
  assert.match(rollback, /z_sync_agent_order_earnings/);
});
