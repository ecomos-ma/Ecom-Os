import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillingPlanDetails {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  monthlyPriceMad: number | null;
  annualPriceMad: number | null;
  orderLimit: number | null;
  orderPeriod: "day" | "month" | null;
  workspaceLimit: number | null;
  teamMemberLimit: number | null;
  integrationLimit: number | null;
  monthlyBillingEnabled: boolean;
  annualBillingEnabled: boolean;
}

export interface BillingLimits {
  orders: number | null;
  orderPeriod: "day" | "month" | null;
  workspaces: number | null;
  teamMembers: number | null;
  integrations: number | null;
}

export interface BillingUsage {
  periodStart: string | null;
  periodEnd: string | null;
  orders: number;
  ordersRemaining: number | null;
  ordersPercent: number | null;
  workspaces: number;
  teamMembers: number;
  integrations: number;
}

export interface EffectiveSubscriptionView {
  owner_user_id: string;
  subscription_id: string;
  plan: { id: string; code: string; name: string } | null;
  billing_cycle: "monthly" | "annual" | null;
  status: string;
  payment_status: string;
  migration_state: string;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  operational_access: boolean;
  access_reason: string;
  limits: BillingLimits;
  usage: BillingUsage;
}

export interface OpenPaymentRequestView {
  id: string;
  reference: string;
  request_type: string;
  billing_cycle: "monthly" | "annual";
  expected_amount_mad: number;
  currency: string;
  payment_method: string | null;
  transaction_reference: string | null;
  proof_path: string | null;
  proof_mime_type: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  requested_plan_code: string | null;
  requested_plan_name: string | null;
}

export interface LatestPaymentRequestView {
  id: string;
  reference: string;
  request_type: string;
  billing_cycle: string;
  expected_amount_mad: number;
  currency: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  requested_plan_name: string | null;
  rejection_reason: string | null;
}

export interface BillingOverview {
  subscription: EffectiveSubscriptionView | null;
  plan: BillingPlanDetails | null;
  open_payment_request: OpenPaymentRequestView | null;
  latest_payment_request: LatestPaymentRequestView | null;
}

export interface PaymentRecord {
  id: string;
  reference: string;
  request_type: string;
  requested_plan: string | null;
  requested_plan_name: string | null;
  current_plan: string | null;
  billing_cycle: string;
  expected_amount_mad: number;
  amount_received_mad: number | null;
  currency: string;
  payment_method: string | null;
  transaction_reference: string | null;
  proof_path: string | null;
  proof_mime_type: string | null;
  proof_size_bytes: number | null;
  status: string;
  user_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  rejection_reason: string | null;
}

export interface PaymentHistoryPage {
  rows: PaymentRecord[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPlan(raw: Record<string, any> | null | undefined): BillingPlanDetails | null {
  if (!raw || !raw.id) {
    console.warn("[billingService] mapPlan: Missing plan id, returning null");
    return null;
  }
  
  const result = {
    id: String(raw.id),
    code: raw.code ?? null,
    name: String(raw.name ?? raw.code ?? "Plan"),
    description: raw.description ?? null,
    monthlyPriceMad: num(raw.monthly_price_mad),
    annualPriceMad: num(raw.annual_price_mad),
    orderLimit: num(raw.order_limit),
    orderPeriod: raw.order_period === "day" ? "day" : raw.order_period === "month" ? "month" : null as "day" | "month" | null,
    workspaceLimit: num(raw.workspace_limit),
    teamMemberLimit: num(raw.team_member_limit),
    integrationLimit: num(raw.integration_limit),
    monthlyBillingEnabled: raw.monthly_billing_enabled !== false,
    annualBillingEnabled: raw.annual_billing_enabled !== false,
  };
  
  console.log("[billingService] Mapped plan:", result);
  return result;
}

function mapSubscription(raw: Record<string, any> | null | undefined): EffectiveSubscriptionView | null {
  if (!raw || !raw.subscription_id) {
    console.warn("[billingService] mapSubscription: Missing subscription_id, returning null");
    return null;
  }
  
  const limits = (raw.limits && typeof raw.limits === "object" ? raw.limits : {}) as Record<string, any>;
  const usage = (raw.usage && typeof raw.usage === "object" ? raw.usage : {}) as Record<string, any>;
  
  const result = {
    owner_user_id: String(raw.owner_user_id ?? ""),
    subscription_id: String(raw.subscription_id),
    plan: raw.plan && raw.plan.id ? { id: String(raw.plan.id), code: String(raw.plan.code ?? ""), name: String(raw.plan.name ?? "") } : null,
    billing_cycle: raw.billing_cycle === "annual" ? "annual" : raw.billing_cycle === "monthly" ? "monthly" : null as "monthly" | "annual" | null,
    status: String(raw.status ?? "unknown"),
    payment_status: String(raw.payment_status ?? "unpaid"),
    migration_state: String(raw.migration_state ?? "assigned"),
    current_period_start: raw.current_period_start ?? null,
    current_period_end: raw.current_period_end ?? null,
    grace_until: raw.grace_until ?? null,
    operational_access: Boolean(raw.operational_access),
    access_reason: String(raw.access_reason ?? ""),
    limits: {
      orders: num(limits.orders),
      orderPeriod: limits.order_period === "day" ? "day" : limits.order_period === "month" ? "month" : null as "day" | "month" | null,
      workspaces: num(limits.workspaces),
      teamMembers: num(limits.team_members),
      integrations: num(limits.integrations),
    },
    usage: {
      periodStart: usage.period_start ?? null,
      periodEnd: usage.period_end ?? null,
      orders: num(usage.orders) ?? 0,
      ordersRemaining: num(usage.orders_remaining),
      ordersPercent: num(usage.orders_percent),
      workspaces: num(usage.workspaces) ?? 0,
      teamMembers: num(usage.team_members) ?? 0,
      integrations: num(usage.integrations) ?? 0,
    },
  };
  
  console.log("[billingService] Mapped subscription:", result);
  return result;
}

function mapRequest(raw: Record<string, any> | null | undefined): OpenPaymentRequestView | null {
  if (!raw || !raw.id) {
    console.warn("[billingService] mapRequest: Missing request id, returning null");
    return null;
  }
  
  const result = {
    id: String(raw.id),
    reference: String(raw.reference ?? ""),
    request_type: String(raw.request_type ?? "initial_activation"),
    billing_cycle: raw.billing_cycle === "annual" ? "annual" : "monthly" as "monthly" | "annual",
    expected_amount_mad: num(raw.expected_amount_mad) ?? 0,
    currency: String(raw.currency ?? "MAD"),
    payment_method: raw.payment_method ?? null,
    transaction_reference: raw.transaction_reference ?? null,
    proof_path: raw.proof_path ?? null,
    proof_mime_type: raw.proof_mime_type ?? null,
    status: String(raw.status ?? "unpaid"),
    submitted_at: raw.submitted_at ?? null,
    created_at: String(raw.created_at ?? ""),
    requested_plan_code: raw.requested_plan_code ?? null,
    requested_plan_name: raw.requested_plan_name ?? null,
  };
  
  console.log("[billingService] Mapped request:", result);
  return result;
}

/** Canonical billing state for the signed-in owner: subscription + plan + open/latest payment. */
export async function fetchBillingOverview(): Promise<BillingOverview> {
  console.log("[billingService] Calling get_my_billing_overview_v1 RPC");
  const { data, error } = await supabase.rpc("get_my_billing_overview_v1");
  
  if (error) {
    console.error("[billingService] RPC call failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  
  console.log("[billingService] RPC response data:", data);
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, any>;
  
  console.log("[billingService] Mapping subscription:", raw.subscription);
  console.log("[billingService] Mapping plan:", raw.plan);
  console.log("[billingService] Mapping open request:", raw.open_payment_request);
  
  return {
    subscription: mapSubscription(raw.subscription),
    plan: mapPlan(raw.plan),
    open_payment_request: mapRequest(raw.open_payment_request),
    latest_payment_request: (raw.latest_payment_request ?? null) as LatestPaymentRequestView | null,
  };
}

/** Seller payment history, latest first. Historical amounts are stored per request. */
export async function fetchPaymentHistory(page = 1, pageSize = 10): Promise<PaymentHistoryPage> {
  const { data, error } = await supabase.rpc("list_my_subscription_payment_requests_v1", {
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, any>;
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  return {
    rows: rows.map((item: Record<string, any>) => ({
      id: String(item.id),
      reference: String(item.reference ?? ""),
      request_type: String(item.request_type ?? ""),
      requested_plan: item.requested_plan ?? null,
      requested_plan_name: item.requested_plan_name ?? null,
      current_plan: item.current_plan ?? null,
      billing_cycle: String(item.billing_cycle ?? "monthly"),
      expected_amount_mad: num(item.expected_amount_mad) ?? 0,
      amount_received_mad: num(item.amount_received_mad),
      currency: String(item.currency ?? "MAD"),
      payment_method: item.payment_method ?? null,
      transaction_reference: item.transaction_reference ?? null,
      proof_path: item.proof_path ?? null,
      proof_mime_type: item.proof_mime_type ?? null,
      proof_size_bytes: num(item.proof_size_bytes),
      status: String(item.status ?? ""),
      user_note: item.user_note ?? null,
      submitted_at: item.submitted_at ?? null,
      reviewed_at: item.reviewed_at ?? null,
      created_at: String(item.created_at ?? ""),
      rejection_reason: item.rejection_reason ?? null,
    })),
    total: num(raw.total) ?? rows.length,
    page: num(raw.page) ?? page,
    page_size: num(raw.page_size) ?? pageSize,
  };
}

/** Short-lived signed URL for a payment proof in the private `subscription-proofs` bucket. */
export async function fetchProofSignedUrl(proofPath: string): Promise<{ url: string; isPdf: boolean }> {
  const { data, error } = await supabase.storage
    .from("subscription-proofs")
    .createSignedUrl(proofPath, 300);
  if (error) throw error;
  const isPdf = proofPath.toLowerCase().endsWith(".pdf");
  return { url: data?.signedUrl ?? "", isPdf };
}
