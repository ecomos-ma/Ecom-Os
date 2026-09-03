import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import {
  founderAdmin,
  type OfficialPlan,
  type PlatformPaymentRequest,
  type PlatformSubscription,
} from "../../../lib/founderAdmin";
import { supabase } from "../../../lib/supabase";
import { PaymentReceiptCard } from "../../../components/PaymentReceiptCard";
import { downloadPaymentReceiptPdf, type PaymentReceiptData } from "../../../lib/paymentReceipt";
import { FOUNDER_EMAIL } from "../../../lib/rbac";
import {
  currency,
  dateTime,
  EmptyState,
  errorMessage,
  PageHeading,
  RefreshButton,
  StatusBadge,
  PlanBadge as SharedPlanBadge,
} from "./shared";
const PAGE_SIZE = 25;
type ReferralAuditRow = { id: string; referrer_email: string; referred_email: string; status: string; reward_status: string; created_at: string; activated_at: string | null };
function normalizePlanCode(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z][a-z0-9-]{1,62}$/.test(normalized) ? normalized : null;
}

function isFounderSubscription(item: PlatformSubscription) {
  return String(item.plan_code ?? "").trim().toLowerCase() === "founder"
    || String(item.plan_name ?? "").trim().toLowerCase() === "founder"
    || String(item.migration_state ?? "").trim().toLowerCase() === "founder_bypass"
    || String(item.seller_email ?? "").trim().toLowerCase() === FOUNDER_EMAIL;
}

function isFounderPayment(item: PlatformPaymentRequest) {
  return String(item.requested_plan ?? "").trim().toLowerCase() === "founder"
    || String(item.current_plan ?? "").trim().toLowerCase() === "founder"
    || String(item.seller_email ?? "").trim().toLowerCase() === FOUNDER_EMAIL;
}

function positiveLimit(value: number | null) {
  return value == null || !Number.isFinite(value) || value <= 0 ? null : Math.floor(value);
}

function parseJsonField(value: string, label: string, fallback: unknown) {
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function draftPlanCode(plan?: Partial<OfficialPlan> | null) {
  const existing = normalizePlanCode(plan?.code);
  if (existing) return existing;
  if (plan?.id) {
    return normalizePlanCode(`${plan.name || "plan"}-${plan.id.slice(0, 8)}`) ?? `plan-${plan.id.slice(0, 8)}`;
  }
  return `new-plan-${Date.now().toString().slice(-6)}`;
}

export function BillingPage() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin/payments")) return <PaymentsPage />;
  if (pathname.startsWith("/admin/plans")) return <PlansPage />;
  return <SubscriptionsPage />;
}
function PaymentsPage() {
  const { can } = usePlatformAdmin();
  const [rows, setRows] = useState<PlatformPaymentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [requestType, setRequestType] = useState("");
  const [selected, setSelected] = useState<PlatformPaymentRequest | null>(null);
  const [action, setAction] = useState<{ payment: PlatformPaymentRequest; decision: "approve" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await founderAdmin.paymentRequests({
        page: page + 1,
        pageSize: PAGE_SIZE,
        query,
        status,
        requestType,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, query, requestType, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8">
      <PageHeading
        eyebrow="Billing"
        title="Payment receipt archive"
        description="Every customer proof submission is archived under its permanent ECOM ticket. Review the private proof, download the customer receipt and activate the correct plan."
        action={<RefreshButton onClick={() => void load()} loading={loading} />}
      />
      <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 md:grid-cols-[1fr_180px_180px]">
        <SearchBox
          value={query}
          setValue={(value) => {
            setPage(0);
            setQuery(value);
          }}
          placeholder="Reference, seller, or email…"
        />
        <select
          value={status}
          onChange={(event) => {
            setPage(0);
            setStatus(event.target.value);
          }}
          aria-label="Payment status"
          className="field"
        >
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="submitted">Submitted</option>
          <option value="reviewing">Reviewing</option>
          <option value="paid">Paid</option>
          <option value="rejected">Rejected</option>
          <option value="waived">Waived</option>
        </select>
        <select
          value={requestType}
          onChange={(event) => {
            setPage(0);
            setRequestType(event.target.value);
          }}
          aria-label="Request type"
          className="field"
        >
          <option value="">All request types</option>
          <option value="initial_activation">Initial</option>
          <option value="renewal">Renewal</option>
          <option value="upgrade">Upgrade</option>
          <option value="downgrade">Downgrade</option>
          <option value="billing_cycle_change">Cycle change</option>
        </select>
      </div>
      {error ? (
        <EmptyState title="Could not load payment requests" copy={error} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm">
          <div className="border-b border-base-border px-4 py-3 text-sm font-semibold">
            {total.toLocaleString()} requests
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left text-sm">
              <thead className="bg-base-raised text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-4 py-3">Receipt ticket</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Proof</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviewer</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRow columns={12} />
                ) : rows.length ? (
                  rows.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-base-border hover:bg-base-raised/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold">{item.reference}</p>
                        {item.submitted_at && <button type="button" onClick={() => void downloadPaymentReceiptPdf(toPaymentReceipt(item))} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-brand-accent hover:underline"><Download size={11} />Receipt PDF</button>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {item.seller_name || "Unnamed seller"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {item.seller_email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <SharedPlanBadge plan={isFounderPayment(item) ? "founder" : item.requested_plan} />
                          <p className="text-xs text-ink-muted">
                            from {item.current_plan || "none"} · {item.billing_cycle}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {item.request_type.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {currency.format(Number(item.expected_amount_mad))}
                      </td>
                      <td className="px-4 py-3">
                        {item.amount_received_mad == null
                          ? "—"
                          : currency.format(Number(item.amount_received_mad))}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {item.submitted_at
                          ? dateTime.format(new Date(item.submitted_at))
                          : "Not submitted"}
                      </td>
                      <td className="px-4 py-3">
                        {item.proof_path ? (
                          <span className="text-emerald-600">Attached</span>
                        ) : (
                          <span className="text-ink-faint">Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={isFounderPayment(item) ? "founder" : item.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {isFounderPayment(item) ? "Platform access" : (item.reviewer_email || "—")}
                      </td>
                      <td className="px-4 py-3">
                        {!isFounderPayment(item) && ["submitted", "reviewing"].includes(item.status) ? (
                          <button
                            onClick={() => {
                              setAction({ payment: item, decision: "approve" });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            aria-label={`Approve ${item.reference}`}
                          >
                            <Check size={13} />
                            Approve
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(item)}
                          className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent"
                          aria-label={`Review ${item.reference}`}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12}>
                      <EmptyState
                        title="No payment requests"
                        copy="New proof submissions will appear here."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            pages={pages}
            loading={loading}
            setPage={setPage}
          />
        </section>
      )}
      {selected && (
        <PaymentDrawer
          payment={selected}
          canApprove={can("billing.approve")}
          onClose={() => setSelected(null)}
          onReviewed={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}
      {action && (
        <ReviewDialog
          payment={action.payment}
          decision={action.decision}
          onClose={() => setAction(null)}
          onReviewed={async () => {
            setAction(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
function PaymentDrawer({
  payment,
  canApprove,
  onClose,
  onReviewed,
}: {
  payment: PlatformPaymentRequest;
  canApprove: boolean;
  onClose: () => void;
  onReviewed: () => Promise<void>;
}) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState("");
  const [action, setAction] = useState<"approve" | null>(null);
  useEffect(() => {
    let active = true;
    if (!payment.proof_path) return;
    void supabase.storage
      .from("subscription-proofs")
      .createSignedUrl(payment.proof_path, 300)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setProofError(error.message);
        else setProofUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [payment.proof_path]);
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
    >
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close payment"
      />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-base-border bg-base p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-accent">
              Payment review
            </p>
            <h2 className="mt-1 text-xl font-bold">{payment.reference}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {payment.seller_name || payment.seller_email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-base-border p-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Info
            label="Requested plan"
            value={`${payment.requested_plan} · ${payment.billing_cycle}`}
          />
          <Info
            label="Request type"
            value={payment.request_type.replace(/_/g, " ")}
          />
          <Info
            label="Expected"
            value={currency.format(Number(payment.expected_amount_mad))}
          />
          <Info
            label="Transaction"
            value={payment.transaction_reference || "Not provided"}
          />
          <Info
            label="Method"
            value={payment.payment_method || "Not provided"}
          />
          <Info label="Status" value={payment.status} />
        </div>
        {payment.submitted_at && <section className="mt-5"><h3 className="mb-3 font-bold">Archived customer receipt</h3><PaymentReceiptCard receipt={toPaymentReceipt(payment)} compact /></section>}
        {payment.user_note && (
          <section className="mt-5 rounded-xl border border-base-border bg-base-surface p-4">
            <p className="text-xs font-bold uppercase text-ink-faint">
              Seller note
            </p>
            <p className="mt-2 text-sm">{payment.user_note}</p>
          </section>
        )}
        <section className="mt-5">
          <h3 className="font-bold">Private payment proof</h3>
          <div className="mt-3 grid min-h-56 place-items-center overflow-hidden rounded-xl border border-base-border bg-base-surface">
            {proofError ? (
              <p className="p-4 text-sm text-danger">{proofError}</p>
            ) : proofUrl ? (
              payment.proof_mime_type === "application/pdf" ? (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white"
                >
                  Open signed PDF
                </a>
              ) : (
                <img
                  src={proofUrl}
                  alt={`Payment proof ${payment.reference}`}
                  className="max-h-[520px] w-full object-contain"
                />
              )
            ) : (
              <p className="text-sm text-ink-muted">
                {payment.proof_path
                  ? "Creating a short-lived signed link…"
                  : "No proof attached."}
              </p>
            )}
          </div>
        </section>
        {canApprove && ["submitted", "reviewing"].includes(payment.status) && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setAction("approve")}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
            >
              <Check size={16} />
              Approve & activate selected plan
            </button>
          </div>
        )}
        {action && (
          <ReviewDialog
            payment={payment}
            decision="approve"
            onClose={() => setAction(null)}
            onReviewed={onReviewed}
          />
        )}
      </aside>
    </div>
  );
}
function ReviewDialog({
  payment,
  decision,
  onClose,
  onReviewed,
}: {
  payment: PlatformPaymentRequest;
  decision: "approve";
  onClose: () => void;
  onReviewed: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            await founderAdmin.reviewPaymentRequest(
              payment.id,
              decision,
              null,
            );
            await onReviewed();
          } catch (saveError) {
            setError(errorMessage(saveError));
          } finally {
            setSaving(false);
          }
        }}
        className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"
      >
        <h3 className="text-lg font-bold">Approve payment</h3>
        <p className="mt-1 text-sm text-ink-muted">
          The server locks {payment.reference} and applies this decision once.
        </p>
        {error && (
          <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Approving…" : "Approve payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
function SubscriptionsPage() {
  const { can } = usePlatformAdmin();
  const [rows, setRows] = useState<PlatformSubscription[]>([]);
  const [plans, setPlans] = useState<OfficialPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [migration, setMigration] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PlatformSubscription | null>(null);
  const [referralRows, setReferralRows] = useState<ReferralAuditRow[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, officialPlans, referrals] = await Promise.all([
        founderAdmin.subscriptions({
          page: page + 1,
          pageSize: PAGE_SIZE,
          query,
          status,
          plan,
          migrationState: migration,
        }),
        founderAdmin.officialPlans(),
        supabase.rpc("platform_list_referrals_v1"),
      ]);
      setRows(result.rows || []);
      setTotal(result.total || 0);
      setPlans(officialPlans || []);
      if (!referrals.error) setReferralRows((referrals.data || []) as ReferralAuditRow[]);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [migration, page, plan, query, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8">
      <PageHeading
        eyebrow="Billing"
        title="Subscriptions"
        description="Owner-level plans shared across owned workspaces. Legacy access is explicit and never presented as a paid plan."
        action={<RefreshButton onClick={() => void load()} loading={loading} />}
      />
      <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 md:grid-cols-[1fr_160px_150px_210px]">
        <SearchBox
          value={query}
          setValue={(value) => {
            setPage(0);
            setQuery(value);
          }}
          placeholder="Seller or email…"
        />
        <Select
          value={status}
          setValue={(value) => {
            setPage(0);
            setStatus(value);
          }}
          label="Status"
          options={[
            "pending_payment",
            "under_review",
            "active",
            "grace",
            "expired",
            "suspended",
            "cancelled",
          ]}
        />
        <Select
          value={plan}
          setValue={(value) => {
            setPage(0);
            setPlan(value);
          }}
          label="Plan"
          options={["starter", "growth", "pro", "scale"]}
        />
        <select
          value={migration}
          onChange={(event) => {
            setPage(0);
            setMigration(event.target.value);
          }}
          aria-label="Migration state"
          className="field"
        >
          <option value="">All migration states</option>
          <option value="assigned">Assigned</option>
          <option value="needs_plan_assignment">Needs plan assignment</option>
          <option value="legacy_access">Legacy access</option>
        </select>
      </div>
      {error ? (
        <EmptyState title="Could not load subscriptions" copy={error} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm">
          <div className="border-b border-base-border px-4 py-3 text-sm font-semibold">
            {total.toLocaleString()} owner subscriptions
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-base-raised text-[11px] uppercase text-ink-faint">
                <tr>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Workspaces</th>
                  <th className="px-4 py-3">Orders usage</th>
                  <th className="px-4 py-3">Period ends</th>
                  <th className="px-4 py-3">Migration</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRow columns={9} />
                ) : rows.length ? (
                  rows.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-base-border hover:bg-base-raised/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {item.seller_name || "Unnamed seller"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {item.seller_email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold capitalize">
                          {isFounderSubscription(item) ? "Founder" : (item.plan_name || "No plan assigned")}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {isFounderSubscription(item) ? "Unlimited access" : (item.billing_cycle || "No billing cycle")}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={isFounderSubscription(item) ? "founder" : item.payment_status} />
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {item.workspace_count}
                      </td>
                      <td className="px-4 py-3">{usageCopy(item)}</td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {item.current_period_end
                          ? dateTime.format(new Date(item.current_period_end))
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={item.migration_state} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {can("billing.manage") && (
                          <button
                            onClick={() => setSelected(item)}
                            className="rounded-lg border border-base-border px-3 py-2 text-xs font-bold text-brand-accent"
                          >
                            Manage
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        title="No subscriptions match"
                        copy="Clear a filter or search another seller."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            pages={pages}
            loading={loading}
            setPage={setPage}
          />
        </section>
      )}
      <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm">
        <div className="border-b border-base-border px-4 py-3"><p className="text-sm font-semibold">Referral audit</p><p className="mt-0.5 text-xs text-ink-muted">Immutable seller referral relationships and reward state.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-base-raised text-[11px] uppercase text-ink-faint"><tr><th className="px-4 py-3">Referred by</th><th className="px-4 py-3">Referred seller</th><th className="px-4 py-3">Signup status</th><th className="px-4 py-3">Reward / discount</th><th className="px-4 py-3">Created</th></tr></thead><tbody>{referralRows.length ? referralRows.map((item) => <tr key={item.id} className="border-t border-base-border"><td className="px-4 py-3 font-semibold">{item.referrer_email}</td><td className="px-4 py-3">{item.referred_email}</td><td className="px-4 py-3"><StatusBadge value={item.status} /></td><td className="px-4 py-3"><StatusBadge value={item.reward_status} /></td><td className="px-4 py-3 text-xs text-ink-muted">{dateTime.format(new Date(item.created_at))}</td></tr>) : <tr><td colSpan={5}><p className="p-6 text-center text-sm text-ink-muted">No referrals yet.</p></td></tr>}</tbody></table></div>
      </section>
      {selected && (
        <ManageSubscriptionDialog
          subscription={selected}
          plans={plans}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
function ManageSubscriptionDialog({
  subscription,
  plans,
  onClose,
  onSaved,
}: {
  subscription: PlatformSubscription;
  plans: OfficialPlan[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"assign" | "grace">("assign");
  const [plan, setPlan] = useState(
    (subscription.plan_code || "growth") as OfficialPlan["code"],
  );
  const [cycle, setCycle] = useState<"monthly" | "annual">(
    (subscription.billing_cycle as "monthly" | "annual") || "monthly",
  );
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(
    addMonths(new Date(), cycle === "annual" ? 12 : 1),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setEnd(
      addMonths(new Date(`${start}T00:00:00`), cycle === "annual" ? 12 : 1),
    );
  }, [cycle, start]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            if (mode === "assign")
              await founderAdmin.assignSubscription(
                subscription.owner_user_id,
                plan,
                cycle,
                new Date(`${start}T00:00:00`).toISOString(),
                new Date(`${end}T00:00:00`).toISOString(),
                reason,
              );
            else
              await founderAdmin.grantSubscriptionGrace(
                subscription.owner_user_id,
                new Date(`${end}T23:59:59`).toISOString(),
                reason,
              );
            await onSaved();
          } catch (saveError) {
            setError(errorMessage(saveError));
          } finally {
            setSaving(false);
          }
        }}
        className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Manage subscription</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {subscription.seller_name || subscription.seller_email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base-border p-2"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-base-raised p-1">
          <button
            type="button"
            onClick={() => setMode("assign")}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "assign" ? "bg-base-surface shadow-sm" : "text-ink-muted"}`}
          >
            Assign / activate
          </button>
          <button
            type="button"
            onClick={() => setMode("grace")}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "grace" ? "bg-base-surface shadow-sm" : "text-ink-muted"}`}
          >
            Grant grace
          </button>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {mode === "assign" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Plan
              <select
                value={plan}
                onChange={(event) =>
                  setPlan(event.target.value as OfficialPlan["code"])
                }
                className="mt-2 field w-full"
              >
                {plans.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Billing cycle
              <select
                value={cycle}
                onChange={(event) =>
                  setCycle(event.target.value as "monthly" | "annual")
                }
                className="mt-2 field w-full"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Period start
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className="mt-2 field w-full"
              />
            </label>
            <label className="text-sm font-semibold">
              Period end
              <input
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className="mt-2 field w-full"
              />
            </label>
          </div>
        )}
        {mode === "grace" && (
          <label className="mt-4 block text-sm font-semibold">
            Grace until
            <input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="mt-2 field w-full"
            />
          </label>
        )}
        <label className="mt-4 block text-sm font-semibold">
          Audit reason
          <textarea
            required
            minLength={8}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm"
          />
        </label>
        <p className="mt-3 text-xs text-ink-muted">
          Manual activation is explicitly recorded as waived; it is never
          represented as a paid transfer.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={saving || reason.trim().length < 8}
            className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : mode === "assign"
                ? "Assign subscription"
                : "Grant grace"}
          </button>
        </div>
      </form>
    </div>
  );
}
function PlansPage() {
  const [plans, setPlans] = useState<OfficialPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlanId, setEditorPlanId] = useState<string | null>(null);
  const [menuPlanId, setMenuPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultDraft = useCallback((plan?: Partial<OfficialPlan> | null): PlanDraft => {
    const defaultCustomLimits = '{\n  "ai_messages": {"name": "AI Messages", "value": 10000, "unit": "messages"}\n}';
    const defaultCustomBenefits = JSON.stringify([
      { name: "Priority onboarding", enabled: true, category: "support", display_order: 1 },
    ], null, 2);

    const toJsonString = (value: unknown, fallback: string) => {
      if (typeof value === "string") return value;
      if (value == null) return fallback;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return fallback;
      }
    };

    return {
      id: plan?.id ?? null,
      code: draftPlanCode(plan),
      name: plan?.name ?? "Growth",
      description: plan?.description ?? "",
      monthly_price_mad: Number(plan?.monthly_price_mad ?? 999),
      annual_price_mad: Number(plan?.annual_price_mad ?? 9990),
      order_limit: plan?.order_limit == null ? null : Number(plan.order_limit),
      order_period: (plan?.order_period as "day" | "month") ?? "month",
      workspace_limit: plan?.workspace_limit ?? 10,
      team_member_limit: plan?.team_member_limit == null ? null : Number(plan.team_member_limit),
      integration_limit: plan?.integration_limit ?? null,
      is_popular: Boolean(plan?.is_popular ?? false),
      is_active: Boolean(plan?.is_active ?? true),
      is_public: Boolean(plan?.is_public ?? true),
      display_order: Number(plan?.display_order ?? 100),
      badge_text: plan?.badge_text ?? (plan?.is_popular ? "Most popular" : ""),
      cta_text: plan?.cta_text ?? `Start with ${plan?.name ?? "Business"}`,
      monthly_billing_enabled: plan?.monthly_billing_enabled ?? true,
      annual_billing_enabled: plan?.annual_billing_enabled ?? true,
      mobile_app: Boolean(plan?.entitlements?.mobile_app ?? false),
      whatsapp_automation: Boolean(plan?.entitlements?.whatsapp_automation ?? false),
      ai_whatsapp_confirmation_agent: Boolean(plan?.entitlements?.ai_whatsapp_confirmation_agent ?? false),
      sawty_os: Boolean(plan?.entitlements?.sawty_os ?? false),
      landing_page_os: Boolean(plan?.entitlements?.landing_page_os ?? false),
      premium_support: Boolean(plan?.entitlements?.premium_support ?? false),
      custom_limits: toJsonString(plan?.custom_limits, defaultCustomLimits),
      custom_benefits: toJsonString(plan?.custom_benefits, defaultCustomBenefits),
    };
  }, []);

  const [draft, setDraft] = useState<PlanDraft>(() => defaultDraft());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("display_order", { ascending: true });
      if (loadError) throw loadError;
      const rows = (data ?? []) as OfficialPlan[];
      const normalized = rows.map((plan) => ({
        ...plan,
        entitlements: {
          mobile_app: Boolean((plan as any).mobile_app),
          whatsapp_automation: Boolean((plan as any).whatsapp_automation),
          ai_whatsapp_confirmation_agent: Boolean((plan as any).ai_whatsapp_confirmation_agent),
          sawty_os: Boolean((plan as any).sawty_os),
          landing_page_os: Boolean((plan as any).landing_page_os),
          premium_support: Boolean((plan as any).premium_support),
        },
        is_public: Boolean((plan as any).is_public ?? true),
        is_active: Boolean((plan as any).is_active ?? true),
        is_popular: Boolean((plan as any).is_popular ?? false),
        monthly_billing_enabled: (plan as any).monthly_billing_enabled ?? true,
        annual_billing_enabled: (plan as any).annual_billing_enabled ?? true,
        display_order: Number((plan as any).display_order ?? 100),
      }));
      setPlans(normalized);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditorPlanId(null);
    setDraft(defaultDraft());
    setEditorOpen(true);
  }, [defaultDraft]);

  const openEdit = useCallback((plan: OfficialPlan) => {
    setEditorPlanId(plan.id ?? null);
    setDraft(defaultDraft(plan));
    setEditorOpen(true);
  }, [defaultDraft]);

  const savePlan = useCallback(async () => {
    if (!draft.name.trim()) {
      setError("Plan name is required.");
      return;
    }
    const normalizedCode = normalizePlanCode(draft.code);
    if (!normalizedCode) {
      setError("Plan code must start with a letter and use 2–63 lowercase letters, numbers, or hyphens.");
      return;
    }
    if (!draft.monthly_billing_enabled && !draft.annual_billing_enabled) {
      setError("Enable at least one billing cycle before saving this plan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        id: draft.id ?? undefined,
        code: normalizedCode,
        name: draft.name.trim(),
        description: draft.description.trim(),
        monthly_price_mad: Number(draft.monthly_price_mad || 0),
        annual_price_mad: Number(draft.annual_price_mad || 0),
        order_limit: positiveLimit(draft.order_limit),
        order_period: draft.order_period,
        workspace_limit: draft.workspace_limit == null || Number.isNaN(Number(draft.workspace_limit)) ? null : Number(draft.workspace_limit),
        team_member_limit: positiveLimit(draft.team_member_limit),
        integration_limit: positiveLimit(draft.integration_limit),
        mobile_app: Boolean(draft.mobile_app),
        whatsapp_automation: Boolean(draft.whatsapp_automation),
        ai_whatsapp_confirmation_agent: Boolean(draft.ai_whatsapp_confirmation_agent),
        sawty_os: Boolean(draft.sawty_os),
        landing_page_os: Boolean(draft.landing_page_os),
        premium_support: Boolean(draft.premium_support),
        is_popular: Boolean(draft.is_popular),
        is_active: Boolean(draft.is_active),
        is_public: Boolean(draft.is_public),
        is_official: true,
        display_order: Number(draft.display_order || 100),
        badge_text: draft.badge_text?.trim() || null,
        cta_text: draft.cta_text?.trim() || null,
        monthly_billing_enabled: Boolean(draft.monthly_billing_enabled),
        annual_billing_enabled: Boolean(draft.annual_billing_enabled),
        custom_limits: parseJsonField(draft.custom_limits, "Custom limits", {}),
        custom_benefits: parseJsonField(draft.custom_benefits, "Custom benefits", []),
      };

      if (draft.is_popular) {
        await supabase
          .from("subscription_plans")
          .update({ is_popular: false })
          .neq("id", draft.id ?? "__none__");
      }

      const { data: savedPlan, error: saveError } = draft.id
        ? await supabase.from("subscription_plans").update(payload).eq("id", draft.id).select("*").single()
        : await supabase.from("subscription_plans").insert(payload).select("*").single();

      if (saveError) throw saveError;

      if (draft.id && savedPlan) {
        await supabase.from("subscription_plans").update({ is_popular: Boolean(draft.is_popular) }).eq("id", savedPlan.id);
      }

      setEditorOpen(false);
      setMenuPlanId(null);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const handleDuplicate = useCallback(async (plan: OfficialPlan) => {
    if (!plan.id) return;
    try {
      const { data: source, error: sourceError } = await supabase.from("subscription_plans").select("*").eq("id", plan.id).single();
      if (sourceError) throw sourceError;
      const copyName = `${source.name} Copy`;
      const stamp = Date.now().toString().slice(-4);
      const sourceCode = String(source.code || "plan").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 53);
      const generatedCode = normalizePlanCode(`${sourceCode}-copy-${stamp}`);
      if (!generatedCode) throw new Error("Could not create a valid code for this plan copy.");
      const { error: insertError } = await supabase.from("subscription_plans").insert({
        ...source,
        id: undefined,
        name: copyName,
        code: generatedCode,
        is_public: false,
        is_active: false,
        is_popular: false,
        display_order: Number(source.display_order ?? 100) + 10,
        badge_text: "",
        cta_text: "Start with copy",
        archived_at: null,
        created_at: undefined,
        updated_at: undefined,
      });
      if (insertError) throw insertError;
      setMenuPlanId(null);
      await load();
    } catch (dupError) {
      setError(errorMessage(dupError));
    }
  }, [load]);

  const handleToggle = useCallback(async (plan: OfficialPlan, field: "is_public" | "is_active") => {
    if (!plan.id) return;
    const nextValue = !(field === "is_public" ? plan.is_public : plan.is_active);
    const { error } = await supabase.from("subscription_plans").update({ [field]: nextValue }).eq("id", plan.id);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    setMenuPlanId(null);
    await load();
  }, [load]);

  const handleArchive = useCallback(async (plan: OfficialPlan) => {
    if (!plan.id) return;
    const { error } = await supabase.from("subscription_plans").update({ archived_at: new Date().toISOString(), is_active: false, is_public: false }).eq("id", plan.id);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    setMenuPlanId(null);
    await load();
  }, [load]);

  const handleDelete = useCallback(async (plan: OfficialPlan) => {
    if (!plan.id) return;
    const accepted = window.confirm(
      `Delete ${plan.name}? Existing sellers and payment history will be kept, but this plan will be unassigned from them.`,
    );
    if (!accepted) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", plan.id);
    if (error) {
      const message = errorMessage(error);
      setError(/foreign key|still referenced|violates/i.test(message)
        ? `Cannot delete ${plan.name} because it is assigned to one or more sellers. Archive or disable it instead.`
        : message);
      return;
    }
    setMenuPlanId(null);
    await load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6 lg:p-8">
      <PageHeading
        eyebrow="Billing"
        title="Official plans"
        description="Manage the Ecom OS public plan catalog directly from the database. Every change flows to the homepage, checkout, entitlement checks, and customer-facing limits."
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={openCreate} className="rounded-xl bg-brand-accent px-3 py-2 text-sm font-bold text-white hover:bg-brand-accent/90">+ Add Plan</button>
            <RefreshButton onClick={() => void load()} loading={loading} />
          </div>
        }
      />
      {error ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {loading ? (
        <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.id ?? plan.code} className={`relative overflow-hidden rounded-2xl border bg-base-surface p-5 shadow-sm ${planCardClass(plan.code, Boolean(plan.is_popular))}`}>
              <div className={`absolute inset-x-0 top-0 h-1 ${planStripeClass(plan.code)}`} />
              {plan.is_popular && (
                <span className="absolute right-3 top-3 rounded-full bg-pink-600 px-3 py-1 text-[10px] font-bold uppercase text-white">Most popular</span>
              )}
              {!plan.is_public && (
                <span className="absolute left-3 top-3 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">Hidden</span>
              )}
              {!plan.is_active && (
                <span className="absolute left-3 top-11 rounded-full bg-amber-200 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">Disabled</span>
              )}
              <PlanBadge code={plan.code} label={plan.name} />
              <p className="mt-3 min-h-10 text-sm text-ink-muted">{plan.description || "No description yet."}</p>
              <p className="mt-5 text-3xl font-bold">{currency.format(Number(plan.monthly_price_mad || 0))}<span className="text-sm font-medium text-ink-muted">/mo</span></p>
              <p className="mt-1 text-xs text-ink-muted">{currency.format(Number(plan.annual_price_mad || 0))} annually</p>
              <div className="mt-5 space-y-2 text-sm">
                <PlanLine label="Orders" value={plan.order_limit == null ? "Unlimited" : `${Number(plan.order_limit).toLocaleString()} / ${plan.order_period ?? "month"}`} />
                <PlanLine label="Workspaces" value={limitCopy(plan.workspace_limit)} />
                <PlanLine label="Team members" value={limitCopy(plan.team_member_limit)} />
                <PlanLine label="Integrations" value={limitCopy(plan.integration_limit)} />
              </div>
              <div className="mt-5 border-t border-base-border pt-4">
                <p className="text-xs font-bold uppercase text-ink-faint">Premium modules</p>
                {Object.entries(plan.entitlements || {}).map(([key, enabled]) => (
                  <div key={key} className={`mt-2 flex items-center gap-2 text-xs ${enabled ? "text-ink" : "text-ink-faint"}`}>
                    {enabled ? <Check size={13} className="text-emerald-600" /> : <X size={13} />}
                    <span>{key.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(plan)} className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-base-surface">Edit</button>
                <button type="button" onClick={() => void handleDuplicate(plan)} className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-base-surface">Duplicate</button>
                <button type="button" onClick={() => setMenuPlanId(menuPlanId === plan.id ? null : plan.id ?? null)} className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-base-surface">More</button>
              </div>
              {menuPlanId === (plan.id ?? null) && (
                <div className="mt-3 rounded-xl border border-base-border bg-base-raised p-2">
                  <div className="grid gap-2">
                    <button type="button" onClick={() => void handleToggle(plan, "is_public")} className="rounded-lg bg-base-surface px-2 py-1.5 text-left text-xs font-medium hover:bg-base-surface/80">{plan.is_public ? "Hide from public" : "Show publicly"}</button>
                    <button type="button" onClick={() => void handleToggle(plan, "is_active")} className="rounded-lg bg-base-surface px-2 py-1.5 text-left text-xs font-medium hover:bg-base-surface/80">{plan.is_active ? "Disable plan" : "Enable plan"}</button>
                    <button type="button" onClick={() => void handleArchive(plan)} className="rounded-lg bg-base-surface px-2 py-1.5 text-left text-xs font-medium hover:bg-base-surface/80">Close / archive plan</button>
                    <button type="button" onClick={() => void handleDelete(plan)} className="rounded-lg bg-red-50 px-2 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-100">Delete plan</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050816]/75 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-base-border bg-base-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-base-border pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint">Plan editor</p>
                <h3 className="mt-1 text-2xl font-bold">{editorPlanId ? "Edit plan" : "Create plan"}</h3>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-base-border px-3 py-2 text-sm font-medium hover:bg-base-raised">Close</button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Plan name</label>
                  <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="field w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Plan code</label>
                  <input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} className="field w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Description</label>
                  <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="field min-h-[110px] w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Badge text</label>
                  <input value={draft.badge_text} onChange={(event) => setDraft((current) => ({ ...current, badge_text: event.target.value }))} className="field w-full" placeholder="Most popular" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">CTA text</label>
                  <input value={draft.cta_text} onChange={(event) => setDraft((current) => ({ ...current, cta_text: event.target.value }))} className="field w-full" placeholder="Start with Business" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm"><span>Public</span><input type="checkbox" checked={draft.is_public} onChange={(event) => setDraft((current) => ({ ...current, is_public: event.target.checked }))} /></label>
                  <label className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm"><span>Active</span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>
                  <label className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm"><span>Most popular</span><input type="checkbox" checked={draft.is_popular} onChange={(event) => setDraft((current) => ({ ...current, is_popular: event.target.checked }))} /></label>
                  <label className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm"><span>Monthly billing</span><input type="checkbox" checked={draft.monthly_billing_enabled} onChange={(event) => setDraft((current) => ({ ...current, monthly_billing_enabled: event.target.checked }))} /></label>
                  <label className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm"><span>Annual billing</span><input type="checkbox" checked={draft.annual_billing_enabled} onChange={(event) => setDraft((current) => ({ ...current, annual_billing_enabled: event.target.checked }))} /></label>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Monthly price (MAD)</label>
                    <input type="number" value={draft.monthly_price_mad} onChange={(event) => setDraft((current) => ({ ...current, monthly_price_mad: Number(event.target.value || 0) }))} className="field w-full" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Annual price (MAD)</label>
                    <input type="number" value={draft.annual_price_mad} onChange={(event) => setDraft((current) => ({ ...current, annual_price_mad: Number(event.target.value || 0) }))} className="field w-full" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Order limit</label>
                    <input type="number" min="1" value={draft.order_limit ?? ""} onChange={(event) => setDraft((current) => ({ ...current, order_limit: event.target.value === "" ? null : Number(event.target.value) }))} className="field w-full" placeholder="Unlimited" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Order period</label>
                    <select value={draft.order_period} onChange={(event) => setDraft((current) => ({ ...current, order_period: event.target.value as "day" | "month" }))} className="field w-full">
                      <option value="month">month</option>
                      <option value="day">day</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Workspaces</label>
                    <input type="number" min="1" value={draft.workspace_limit ?? ""} onChange={(event) => setDraft((current) => ({ ...current, workspace_limit: event.target.value === "" ? null : Number(event.target.value) }))} className="field w-full" placeholder="Unlimited" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Team members</label>
                    <input type="number" min="1" value={draft.team_member_limit ?? ""} onChange={(event) => setDraft((current) => ({ ...current, team_member_limit: event.target.value === "" ? null : Number(event.target.value) }))} className="field w-full" placeholder="Unlimited" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Integrations</label>
                    <input type="number" min="1" value={draft.integration_limit ?? ""} onChange={(event) => setDraft((current) => ({ ...current, integration_limit: event.target.value === "" ? null : Number(event.target.value) }))} className="field w-full" placeholder="Unlimited" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Display order</label>
                  <input type="number" value={draft.display_order} onChange={(event) => setDraft((current) => ({ ...current, display_order: Number(event.target.value || 100) }))} className="field w-full" />
                </div>
                <div className="rounded-xl border border-base-border bg-base-raised p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Entitlements</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ["mobile_app", "Mobile App"],
                      ["whatsapp_automation", "WhatsApp Automation"],
                      ["ai_whatsapp_confirmation_agent", "AI WhatsApp Agent"],
                      ["sawty_os", "Sawty.OS"],
                      ["landing_page_os", "Landing Page.OS"],
                      ["premium_support", "Premium Support"],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm"> 
                        <span>{label}</span>
                        <input type="checkbox" checked={(draft as any)[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))} />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-base-border bg-base-raised p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Custom limits (JSON)</p>
                  <textarea value={draft.custom_limits} onChange={(event) => setDraft((current) => ({ ...current, custom_limits: event.target.value }))} className="mt-2 min-h-[110px] w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-xs" />
                </div>
                <div className="rounded-xl border border-base-border bg-base-raised p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Custom benefits (JSON)</p>
                  <textarea value={draft.custom_benefits} onChange={(event) => setDraft((current) => ({ ...current, custom_benefits: event.target.value }))} className="mt-2 min-h-[110px] w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-xs" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-base-border pt-4">
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-xl border border-base-border px-4 py-2 text-sm font-medium">Cancel</button>
              <button type="button" onClick={() => void savePlan()} disabled={saving} className="rounded-xl bg-brand-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : editorPlanId ? "Save changes" : "Create plan"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type PlanDraft = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  monthly_price_mad: number;
  annual_price_mad: number;
  order_limit: number | null;
  order_period: "day" | "month";
  workspace_limit: number | null;
  team_member_limit: number | null;
  integration_limit: number | null;
  is_popular: boolean;
  is_active: boolean;
  is_public: boolean;
  display_order: number;
  badge_text: string;
  cta_text: string;
  monthly_billing_enabled: boolean;
  annual_billing_enabled: boolean;
  mobile_app: boolean;
  whatsapp_automation: boolean;
  ai_whatsapp_confirmation_agent: boolean;
  sawty_os: boolean;
  landing_page_os: boolean;
  premium_support: boolean;
  custom_limits: string;
  custom_benefits: string;
};
function SearchBox({
  value,
  setValue,
  placeholder,
}: {
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-base-border bg-base-raised px-3">
      <Search size={16} className="text-ink-faint" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
      />
    </label>
  );
}
function Select({
  value,
  setValue,
  label,
  options,
}: {
  value: string;
  setValue: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => setValue(event.target.value)}
      aria-label={label}
      className="field"
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((item) => (
        <option key={item} value={item}>
          {item.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
function Pager({
  page,
  pages,
  loading,
  setPage,
}: {
  page: number;
  pages: number;
  loading: boolean;
  setPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-base-border px-4 py-3">
      <p className="text-sm text-ink-muted">
        Page {Math.min(page + 1, pages)} of {pages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="rounded-lg border border-base-border p-2 disabled:opacity-40"
        >
          <ChevronLeft size={17} />
        </button>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page + 1 >= pages || loading}
          className="rounded-lg border border-base-border p-2 disabled:opacity-40"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function LoadingRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="p-10">
        <Loader2 className="mx-auto animate-spin text-brand-accent" />
      </td>
    </tr>
  );
}
function toPaymentReceipt(payment: PlatformPaymentRequest): PaymentReceiptData {
  return {
    id: payment.id,
    receiptNumber: payment.reference,
    customerName: payment.seller_name || payment.seller_email || "EcomOS customer",
    customerEmail: payment.seller_email || "Not provided",
    planName: payment.requested_plan,
    billingCycle: payment.billing_cycle === "annual" ? "Annual" : "Monthly",
    amountMad: Number(payment.expected_amount_mad || 0),
    currency: payment.currency || "MAD",
    paymentMethod: payment.payment_method ? payment.payment_method.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Bank transfer",
    transactionReference: payment.transaction_reference || "Not provided",
    submittedAt: payment.submitted_at || payment.created_at,
    status: payment.status,
  };
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-base-raised p-3">
      <p className="text-xs uppercase text-ink-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
function PlanBadge({ code, label }: { code: string | null; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset ${planBadgeClass(code)}`}
    >
      {label}
    </span>
  );
}
function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
function planBadgeClass(code: string | null) {
  switch (code) {
    case "starter":
      return "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600";
    case "growth":
      return "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:ring-pink-800";
    case "pro":
      return "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800";
    case "scale":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800";
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800";
  }
}
function planStripeClass(code: string) {
  switch (code) {
    case "starter":
      return "bg-slate-400";
    case "growth":
      return "bg-gradient-to-r from-pink-500 to-rose-500";
    case "pro":
      return "bg-gradient-to-r from-violet-500 to-indigo-500";
    case "scale":
      return "bg-gradient-to-r from-cyan-500 to-blue-500";
    default:
      return "bg-brand-accent";
  }
}
function planCardClass(code: string, popular: boolean) {
  if (popular)
    return "border-pink-400 shadow-[0_14px_45px_rgba(236,72,153,0.14)]";
  switch (code) {
    case "starter":
      return "border-slate-200 dark:border-slate-700";
    case "pro":
      return "border-violet-200 dark:border-violet-900";
    case "scale":
      return "border-cyan-200 dark:border-cyan-900";
    default:
      return "border-base-border";
  }
}
function limitCopy(value: number | null) {
  return value == null ? "Unlimited" : value.toLocaleString();
}
function usageCopy(item: PlatformSubscription) {
  const used = Number(item.effective.usage?.orders || 0);
  const limit = item.effective.limits?.orders;
  return limit == null
    ? `${used.toLocaleString()} / Unlimited`
    : `${used.toLocaleString()} / ${Number(limit).toLocaleString()}`;
}
function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy.toISOString().slice(0, 10);
}
