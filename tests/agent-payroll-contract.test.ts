import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("exclusive recipient assignments are atomic and preserve shared mode", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");
  const team = read("src/pages/Team.tsx");

  assert.match(migration, /workspace_confirmation_assignment_settings/);
  assert.match(migration, /order_confirmation_recipients/);
  assert.match(migration, /recipient_type in \('agent', 'whatsapp_automation'\)/);
  assert.match(migration, /one_current_idx/);
  assert.match(migration, /for update of o skip locked/);
  assert.match(migration, /ASSIGNMENT_RECONCILIATION_REQUIRED/);
  assert.match(migration, /WHATSAPP_RECIPIENT_MISMATCH/);
  assert.match(migration, /AGENT_RECIPIENT_MISMATCH/);
  assert.match(team, /Normal \/ Shared/);
  assert.match(team, /WhatsApp Automation/);
  assert.match(team, /assignConfirmationOrders/);
});

test("commission attribution is immutable, human-only, and ledger-deduplicated", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");

  assert.match(migration, /order_confirmation_events/);
  assert.match(migration, /source in \('agent_call', 'whatsapp_automation', 'manual_review'\)/);
  assert.match(migration, /Ambiguous imported history is intentionally left for founder review/);
  assert.match(migration, /source = 'agent_call'/);
  assert.match(migration, /agent_earnings/);
  assert.match(migration, /unique \(workspace_id, earning_key\)/);
  assert.match(migration, /materialize_agent_earnings_for_order_v1/);
  assert.match(migration, /on conflict \(workspace_id, earning_key\) do nothing/);
});

test("payroll and payments use invoice, allocation, proof, and acknowledgment ledgers", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");
  const finance = read("src/pages/AgentInvoices.tsx");
  const service = read("src/services/agentPayrollService.ts");

  assert.match(migration, /agent_payment_rule_versions/);
  assert.match(migration, /generate_agent_payroll_invoices_internal_v1/);
  assert.match(migration, /unique \(workspace_id, agent_id, payroll_period_id\)/);
  assert.match(migration, /agent_payment_allocations/);
  assert.match(migration, /ALLOCATION_EXCEEDS_INVOICE_BALANCE/);
  assert.match(migration, /agent-payment-proofs/);
  assert.match(migration, /agent_payment_acknowledgments/);
  assert.match(migration, /agent_payment_disputes/);
  assert.match(finance, /Agent payments/);
  assert.match(finance, /Record payment/);
  assert.match(finance, /Received/);
  assert.match(service, /attachPaymentProof/);
  assert.match(service, /record_agent_payment_v1/);
});

test("missing payroll tables are shown as a setup state instead of a raw database error", () => {
  const finance = read("src/pages/AgentInvoices.tsx");
  const service = read("src/services/agentPayrollService.ts");

  assert.match(service, /PayrollSchemaUnavailableError/);
  assert.match(service, /PGRST205/);
  assert.match(finance, /Agent payroll needs a database update/);
  assert.match(finance, /20260922120000_agent_payroll_and_exclusive_assignment\.sql/);
});

test("payroll storage and acknowledgment remain scoped and immutable", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");
  const finance = read("src/pages/AgentInvoices.tsx");

  assert.match(migration, /create or replace function public\.can_manage_workspace_payroll/);
  assert.match(migration, /has_workspace_role\(p_workspace_id, array\['owner'\]::text\[\]\)/);
  assert.match(migration, /agent_payment_proof_read_scoped/);
  assert.match(migration, /agent_payment_proof_orphan_owner_delete/);
  assert.match(migration, /PAYMENT_PROOF_UPLOAD_NOT_FOUND/);
  assert.match(migration, /PAYMENT_ALREADY_ACKNOWLEDGED/);
  assert.match(finance, /Reconnect to record this transfer/);
  assert.match(finance, /payment\.status === "reversed"/);
  assert.match(finance, /for \(const line of lines\)/);
});

test("invited agents read only their assigned orders through membership-scoped RLS", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");
  assert.match(migration, /orders_assigned_member_read/);
  assert.match(migration, /orders_membership_read_boundary.*as restrictive for select/s);
  assert.match(migration, /assigned_to = \(select auth\.uid\(\)\)/);
  assert.match(migration, /public\.is_active_workspace_member\(workspace_id\)/);
});

test("notification catalog entries are standalone SQL inserts without escaped event keys", () => {
  const migration = read("supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql");
  const catalogBlock = migration.split("-- Reuse the established in-app notification pipeline")[1]?.split("create or replace function public.notify_agent_payroll_event_v1")[0] ?? "";
  assert.equal((catalogBlock.match(/insert into public\.notification_event_catalog/g) ?? []).length, 5);
  assert.equal((catalogBlock.match(/on conflict \(event_key\) do update/g) ?? []).length, 5);
  assert.doesNotMatch(catalogBlock, /\\_/);
  for (const key of ["agent_payroll.invoice_issued", "agent_payroll.payment_recorded", "agent_payroll.payment_disputed", "agent_payroll.proof_uploaded", "confirmation.callback_due"]) {
    assert.ok(catalogBlock.includes(`'${key}'`));
  }
});

test("payroll periods, rule versions, and invoice totals are server-enforced", () => {
  const migration = read("supabase/migrations/20261019022000_agent_payroll_integrity.sql");

  assert.match(migration, /prevent_agent_payroll_period_overlap_v1/);
  assert.match(migration, /PAYROLL_PERIOD_OVERLAP/);
  assert.match(migration, /tstzrange\(existing\.starts_at, existing\.ends_at, '\[\)'\)/);
  assert.match(migration, /prevent_agent_payment_rule_overlap_v1/);
  assert.match(migration, /PAYMENT_RULE_EFFECTIVE_PERIOD_OVERLAP/);
  assert.match(migration, /PAYMENT_RULE_EFFECTIVE_DATE_MUST_ADVANCE/);
  assert.match(migration, /set effective_to = v_effective_from - 1/);
  assert.match(migration, /sync_agent_invoice_totals_v1/);
  assert.match(migration, /coalesce\(sum\(line\.amount\), 0\) as total/);
});

test("invoice generation is locked, idempotent, and carries late earnings forward", () => {
  const migration = read("supabase/migrations/20261019022000_agent_payroll_integrity.sql");

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_period_status = 'generated'/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /earning\.status = 'accrued'[\s\S]*earning\.earned_at < p_ends_at/);
  assert.doesNotMatch(migration, /earning\.earned_at >= p_starts_at[\s\S]*earning\.earned_at < p_ends_at/);
  assert.match(migration, /'carried_forward_earnings'/);
  assert.match(migration, /on conflict \(invoice_id, earning_id\) do nothing/);
  assert.match(migration, /revoke all on function public\.generate_agent_payroll_invoices_internal_v1[\s\S]*from public, anon, authenticated/);
});

test("payment corrections preserve ledger history and derive invoice balances", () => {
  const migration = read("supabase/migrations/20261019026000_agent_payment_reversal_and_disputes.sql");
  const finance = read("src/pages/AgentInvoices.tsx");
  const service = read("src/services/agentPayrollService.ts");

  assert.match(migration, /refresh_agent_invoice_payment_status_v1/);
  assert.match(migration, /payment\.status = 'recorded'/);
  assert.match(migration, /when v_has_open_dispute then 'disputed'/);
  assert.match(migration, /reverse_agent_payment_v1/);
  assert.match(migration, /set status = 'reversed'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.agent_(payments|payment_allocations)/i);
  assert.match(migration, /payment_reversed/);
  assert.match(migration, /resolve_agent_payment_dispute_v1/);
  assert.match(migration, /payment_dispute_resolved/);
  assert.match(migration, /revoke all on function public\.refresh_agent_invoice_payment_status_v1[\s\S]*authenticated/);
  assert.match(service, /reverseAgentPayment/);
  assert.match(service, /resolveAgentPaymentDispute/);
  assert.match(finance, /Recorded transfers are never deleted/);
  assert.match(finance, /Resolve & reverse/);
});

test("agent compensation editor uses separate intents and never activates unverified upsell math", () => {
  const editor = read("src/pages/team/AgentCompensationEditor.tsx");
  const migration = read("supabase/migrations/20261020160000_agent_compensation_editor_v2.sql");

  assert.match(editor, /per_confirmed_order: "Confirmed order"/);
  assert.match(editor, /per_delivered_order: "Delivered order"/);
  assert.match(editor, /fixed_salary: "Base salary"/);
  assert.match(editor, /awaiting verified incremental order value/);
  assert.match(editor, /save_agent_compensation_rule_v2/);
  assert.match(editor, /p_rule_id: current\?\.id \?\? null/);
  assert.match(migration, /PAYMENT_RULE_EFFECTIVE_DATE_MUST_ADVANCE/);
  assert.match(migration, /DUPLICATE_ACTIVE_PAYMENT_INTENT/);
  assert.match(migration, /amount_type = 'percentage'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.agent_(?:payment_rules|earnings|invoices)/i);
});
