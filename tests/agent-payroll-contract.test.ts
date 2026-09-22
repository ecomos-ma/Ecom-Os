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
