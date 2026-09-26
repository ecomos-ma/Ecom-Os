import { supabase } from "../lib/supabase";

export type AssignmentMode = "shared" | "separated";
export type AssignmentRecipient = "agent" | "whatsapp_automation";

export interface PayrollInvoice {
  id: string;
  workspace_id: string;
  agent_id: string;
  invoice_number: string;
  issued_at: string;
  due_at: string | null;
  total_earned: number;
  adjustment_total: number;
  total_amount: number;
  status: "draft" | "issued" | "partially_paid" | "paid" | "disputed" | "void";
  payroll_period_id: string;
}

export interface PayrollPayment {
  id: string;
  workspace_id: string;
  agent_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string | null;
  paid_at: string;
  status: "recorded" | "reversed";
}

export interface PaymentAllocation { payment_id: string; invoice_id: string; amount: number; }
export interface PayrollInvoiceLine { id: string; invoice_id: string; line_type: string; description: string; quantity: number; unit_amount: number; amount: number; }
export interface PayrollPeriod { id: string; starts_at: string; ends_at: string; }
export interface PayrollSummary {
  invoices: PayrollInvoice[];
  periods: PayrollPeriod[];
  payments: PayrollPayment[];
  allocations: PaymentAllocation[];
  acknowledgments: Array<{ payment_id: string; outcome: string; actual_amount: number | null }>;
  disputes: Array<{ payment_id: string; status: string }>;
  proofs: Array<{ id: string; payment_id: string; storage_path: string; file_name: string }>;
  rules: Array<Record<string, unknown>>;
  bankAccounts: Array<Record<string, unknown>>;
}

export class PayrollSchemaUnavailableError extends Error {
  readonly name = "PayrollSchemaUnavailableError";

  constructor() {
    super("Agent payroll needs a database update before it can be used.");
  }
}

function isSchemaUnavailable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST205"
    || error?.code === "42P01"
    || message.includes("schema cache")
    || message.includes("could not find the table")
    || message.includes("relation \"") && message.includes("does not exist");
}

function raise(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (isSchemaUnavailable(error)) throw new PayrollSchemaUnavailableError();
  throw new Error(error.message || "The payroll service could not complete that action.");
}

export async function loadPayrollSummary(workspaceId: string): Promise<PayrollSummary> {
  const [invoices, periods, payments, allocations, acknowledgments, disputes, proofs, rules, bankAccounts] = await Promise.all([
    supabase.from("agent_invoices").select("id,workspace_id,agent_id,invoice_number,issued_at,due_at,total_earned,adjustment_total,total_amount,status,payroll_period_id").eq("workspace_id", workspaceId).order("issued_at", { ascending: false }),
    supabase.from("agent_payroll_periods").select("id,starts_at,ends_at").eq("workspace_id", workspaceId),
    supabase.from("agent_payments").select("id,workspace_id,agent_id,amount,currency,payment_method,transaction_reference,paid_at,status").eq("workspace_id", workspaceId).order("paid_at", { ascending: false }),
    supabase.from("agent_payment_allocations").select("payment_id,invoice_id,amount").eq("workspace_id", workspaceId),
    supabase.from("agent_payment_acknowledgments").select("payment_id,outcome,actual_amount").eq("workspace_id", workspaceId),
    supabase.from("agent_payment_disputes").select("payment_id,status").eq("workspace_id", workspaceId),
    supabase.from("agent_payment_proofs").select("id,payment_id,storage_path,file_name").eq("workspace_id", workspaceId),
    supabase.from("agent_payment_rules").select("id,agent_id,name,enabled,created_at").eq("workspace_id", workspaceId),
    supabase.from("agent_bank_accounts").select("id,agent_id,account_holder,bank_name,rib_iban,swift,currency,payment_notes,is_default").eq("workspace_id", workspaceId),
  ]);
  raise(invoices.error); raise(periods.error); raise(payments.error); raise(allocations.error); raise(acknowledgments.error); raise(disputes.error); raise(proofs.error); raise(rules.error); raise(bankAccounts.error);
  return {
    invoices: (invoices.data ?? []) as PayrollInvoice[],
    periods: (periods.data ?? []) as PayrollPeriod[],
    payments: (payments.data ?? []) as PayrollPayment[],
    allocations: (allocations.data ?? []) as PaymentAllocation[],
    acknowledgments: (acknowledgments.data ?? []) as PayrollSummary["acknowledgments"],
    disputes: (disputes.data ?? []) as PayrollSummary["disputes"],
    proofs: (proofs.data ?? []) as PayrollSummary["proofs"],
    rules: (rules.data ?? []) as Array<Record<string, unknown>>,
    bankAccounts: (bankAccounts.data ?? []) as Array<Record<string, unknown>>,
  };
}

export async function loadInvoiceLines(invoiceId: string): Promise<PayrollInvoiceLine[]> {
  const { data, error } = await supabase.from("agent_invoice_lines")
    .select("id,invoice_id,line_type,description,quantity,unit_amount,amount")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  raise(error);
  return (data ?? []) as PayrollInvoiceLine[];
}

export async function getAgentPaymentProofUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("agent-payment-proofs").createSignedUrl(storagePath, 60);
  raise(error);
  if (!data?.signedUrl) throw new Error("Payment proof is unavailable.");
  return data.signedUrl;
}

export async function loadAssignmentMode(workspaceId: string): Promise<AssignmentMode> {
  const { data, error } = await supabase.from("workspace_confirmation_assignment_settings").select("assignment_mode").eq("workspace_id", workspaceId).maybeSingle();
  raise(error);
  return data?.assignment_mode === "separated" ? "separated" : "shared";
}

export async function setAssignmentMode(workspaceId: string, mode: AssignmentMode) {
  const { error } = await supabase.rpc("set_confirmation_assignment_mode_v1", { p_workspace_id: workspaceId, p_assignment_mode: mode });
  raise(error);
}

export async function reconcileSeparatedAssignments(workspaceId: string) {
  const { data, error } = await supabase.rpc("reconcile_separated_confirmation_assignments_v1", { p_workspace_id: workspaceId });
  raise(error); return Number(data ?? 0);
}

export async function assignConfirmationOrders(workspaceId: string, recipientType: AssignmentRecipient, agentId: string | null, quantity: number, orderIds?: string[], reassign = false) {
  const { data, error } = await supabase.rpc("assign_confirmation_orders_v2", {
    p_workspace_id: workspaceId,
    p_recipient_type: recipientType,
    p_agent_id: agentId,
    p_quantity: quantity,
    p_order_ids: orderIds?.length ? orderIds : null,
    p_reassign: reassign,
  });
  raise(error);
  return (data ?? {}) as { requested_count: number; assigned_count: number; assignment_mode: AssignmentMode };
}

export async function savePaymentRule(workspaceId: string, agentId: string, ruleId: string | null, name: string, enabled: boolean, version: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_agent_payment_rule_v1", {
    p_workspace_id: workspaceId, p_agent_id: agentId, p_rule_id: ruleId, p_name: name, p_enabled: enabled, p_version: version,
  });
  raise(error); return data as string;
}

export async function generatePayroll(workspaceId: string, startsAt: string, endsAt: string) {
  const { data, error } = await supabase.rpc("generate_agent_payroll_invoices_v1", { p_workspace_id: workspaceId, p_starts_at: startsAt, p_ends_at: endsAt });
  raise(error); return data as { period_id: string; invoice_count: number };
}

export async function recordAgentPayment(workspaceId: string, agentId: string, amount: number, allocations: PaymentAllocation[], detail: { paymentMethod: string; reference?: string; paidAt?: string; notes?: string }) {
  const { data, error } = await supabase.rpc("record_agent_payment_v1", {
    p_workspace_id: workspaceId, p_agent_id: agentId, p_amount: amount, p_payment_method: detail.paymentMethod,
    p_transaction_reference: detail.reference ?? null, p_paid_at: detail.paidAt ?? new Date().toISOString(), p_notes: detail.notes ?? null,
    p_allocations: allocations.map(({ invoice_id, amount: allocationAmount }) => ({ invoice_id, amount: allocationAmount })),
  });
  raise(error); return data as string;
}

export async function attachPaymentProof(workspaceId: string, paymentId: string, file: File) {
  const supported = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  if (!supported.includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use a PDF, PNG, JPEG, or WebP proof smaller than 10 MB.");
  const path = `${workspaceId}/${paymentId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("agent-payment-proofs").upload(path, file, { contentType: file.type, upsert: false });
  raise(uploadError);
  const { error: attachError } = await supabase.rpc("attach_agent_payment_proof_v1", {
    p_workspace_id: workspaceId, p_payment_id: paymentId, p_storage_path: path, p_file_name: file.name, p_mime_type: file.type, p_file_size: file.size,
  });
  if (attachError) { await supabase.storage.from("agent-payment-proofs").remove([path]); raise(attachError); }
}

export async function acknowledgePayment(paymentId: string, outcome: "received_full" | "not_received" | "received_different", actualAmount?: number, explanation?: string) {
  const { error } = await supabase.rpc("acknowledge_agent_payment_v1", { p_payment_id: paymentId, p_outcome: outcome, p_actual_amount: actualAmount ?? null, p_explanation: explanation ?? null });
  raise(error);
}
