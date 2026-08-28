import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import { founderAdmin, type OfficialPlan, type PlatformPaymentRequest, type PlatformSubscription, } from "../../../lib/founderAdmin";
import { BankTransferSettings } from "./BankTransferSettings";
import { supabase } from "../../../lib/supabase";
import { currency, dateTime, EmptyState, errorMessage, PageHeading, RefreshButton, StatusBadge } from "./shared";
const PAGE_SIZE = 25;
export function BillingPage() {
    const { pathname } = useLocation();
    if (pathname.startsWith("/admin/payments"))
        return <PaymentsPage />;
    if (pathname.startsWith("/admin/plans"))
        return <><BankTransferSettings /><PlansPage /></>;
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const result = await founderAdmin.paymentRequests({ page: page + 1, pageSize: PAGE_SIZE, query, status, requestType });
            setRows(result.rows || []);
            setTotal(result.total || 0);
        }
        catch (loadError) {
            setError(errorMessage(loadError));
        }
        finally {
            setLoading(false);
        }
    }, [page, query, requestType, status]);
    useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Billing" title="Payments" description="Private proof review and atomic subscription activation. Expected prices are server snapshots from the official MAD plan catalog." action={<RefreshButton onClick={() => void load()} loading={loading}/>}/>
    <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 md:grid-cols-[1fr_180px_180px]">
      <SearchBox value={query} setValue={(value) => { setPage(0); setQuery(value); }} placeholder="Reference, seller, or email…"/>
      <select value={status} onChange={(event) => { setPage(0); setStatus(event.target.value); }} aria-label="Payment status" className="field"><option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="waived">Waived</option></select>
      <select value={requestType} onChange={(event) => { setPage(0); setRequestType(event.target.value); }} aria-label="Request type" className="field"><option value="">All request types</option><option value="initial_activation">Initial</option><option value="renewal">Renewal</option><option value="upgrade">Upgrade</option><option value="downgrade">Downgrade</option><option value="billing_cycle_change">Cycle change</option></select>
    </div>
    {error ? <EmptyState title="Could not load payment requests" copy={error}/> : <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm"><div className="border-b border-base-border px-4 py-3 text-sm font-semibold">{total.toLocaleString()} requests</div><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-base-raised text-[11px] uppercase tracking-wide text-ink-faint"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Seller</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Proof</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reviewer</th><th className="px-4 py-3"></th></tr></thead><tbody>{loading ? <LoadingRow columns={11}/> : rows.length ? rows.map((item) => <tr key={item.id} className="border-t border-base-border hover:bg-base-raised/50"><td className="px-4 py-3 font-mono text-xs font-semibold">{item.reference}</td><td className="px-4 py-3"><p className="font-semibold">{item.seller_name || "Unnamed seller"}</p><p className="text-xs text-ink-muted">{item.seller_email}</p></td><td className="px-4 py-3"><p className="font-semibold capitalize">{item.requested_plan}</p><p className="text-xs text-ink-muted">from {item.current_plan || "none"} · {item.billing_cycle}</p></td><td className="px-4 py-3 capitalize">{item.request_type.replace(/_/g, " ")}</td><td className="px-4 py-3 font-semibold">{currency.format(Number(item.expected_amount_mad))}</td><td className="px-4 py-3">{item.amount_received_mad == null ? "—" : currency.format(Number(item.amount_received_mad))}</td><td className="px-4 py-3 text-xs text-ink-muted">{item.submitted_at ? dateTime.format(new Date(item.submitted_at)) : "Not submitted"}</td><td className="px-4 py-3">{item.proof_path ? <span className="text-emerald-600">Attached</span> : <span className="text-ink-faint">Missing</span>}</td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3 text-xs text-ink-muted">{item.reviewer_email || "—"}</td><td className="px-4 py-3 text-right"><button onClick={() => setSelected(item)} className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent" aria-label={`Review ${item.reference}`}><Eye size={15}/></button></td></tr>) : <tr><td colSpan={11}><EmptyState title="No payment requests" copy="New proof submissions will appear here."/></td></tr>}</tbody></table></div><Pager page={page} pages={pages} loading={loading} setPage={setPage}/></section>}
    {selected && <PaymentDrawer payment={selected} canApprove={can("billing.approve")} onClose={() => setSelected(null)} onReviewed={async () => { setSelected(null); await load(); }}/>}
  </div>;
}
function PaymentDrawer({ payment, canApprove, onClose, onReviewed }: {
    payment: PlatformPaymentRequest;
    canApprove: boolean;
    onClose: () => void;
    onReviewed: () => Promise<void>;
}) {
    const [proofUrl, setProofUrl] = useState<string | null>(null);
    const [proofError, setProofError] = useState("");
    const [action, setAction] = useState<"approve" | "reject" | "waive" | null>(null);
    useEffect(() => {
        let active = true;
        if (!payment.proof_path)
            return;
        void supabase.storage.from("subscription-proofs").createSignedUrl(payment.proof_path, 300).then(({ data, error }) => {
            if (!active)
                return;
            if (error)
                setProofError(error.message);
            else
                setProofUrl(data.signedUrl);
        });
        return () => { active = false; };
    }, [payment.proof_path]);
    return <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40" role="dialog" aria-modal="true"><button className="absolute inset-0" onClick={onClose} aria-label="Close payment"/><aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-base-border bg-base p-5 shadow-2xl md:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-accent">Payment review</p><h2 className="mt-1 text-xl font-bold">{payment.reference}</h2><p className="mt-1 text-sm text-ink-muted">{payment.seller_name || payment.seller_email}</p></div><button onClick={onClose} className="rounded-lg border border-base-border p-2"><X size={18}/></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Requested plan" value={`${payment.requested_plan} · ${payment.billing_cycle}`}/><Info label="Request type" value={payment.request_type.replace(/_/g, " ")}/><Info label="Expected" value={currency.format(Number(payment.expected_amount_mad))}/><Info label="Transaction" value={payment.transaction_reference || "Not provided"}/><Info label="Method" value={payment.payment_method || "Not provided"}/><Info label="Status" value={payment.status}/></div>{payment.user_note && <section className="mt-5 rounded-xl border border-base-border bg-base-surface p-4"><p className="text-xs font-bold uppercase text-ink-faint">Seller note</p><p className="mt-2 text-sm">{payment.user_note}</p></section>}<section className="mt-5"><h3 className="font-bold">Private payment proof</h3><div className="mt-3 grid min-h-56 place-items-center overflow-hidden rounded-xl border border-base-border bg-base-surface">{proofError ? <p className="p-4 text-sm text-danger">{proofError}</p> : proofUrl ? payment.proof_mime_type === "application/pdf" ? <a href={proofUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white">Open signed PDF</a> : <img src={proofUrl} alt={`Payment proof ${payment.reference}`} className="max-h-[520px] w-full object-contain"/> : <p className="text-sm text-ink-muted">{payment.proof_path ? "Creating a short-lived signed link…" : "No proof attached."}</p>}</div></section>{canApprove && ["submitted", "reviewing"].includes(payment.status) && <div className="mt-6 flex flex-wrap justify-end gap-2"><button onClick={() => setAction("reject")} className="rounded-lg border border-danger/30 px-3 py-2 text-sm font-bold text-danger">Reject</button><button onClick={() => setAction("waive")} className="rounded-lg border border-base-border px-3 py-2 text-sm font-bold">Waive</button><button onClick={() => setAction("approve")} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><Check size={16}/>Approve & activate</button></div>}{action && <ReviewDialog payment={payment} decision={action} onClose={() => setAction(null)} onReviewed={onReviewed}/>}</aside></div>;
}
function ReviewDialog({ payment, decision, onClose, onReviewed }: {
    payment: PlatformPaymentRequest;
    decision: "approve" | "reject" | "waive";
    onClose: () => void;
    onReviewed: () => Promise<void>;
}) {
    const [amount, setAmount] = useState(String(payment.expected_amount_mad));
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try {
        await founderAdmin.reviewPaymentRequest(payment.id, decision, decision === "waive" ? 0 : Number(amount), note);
        await onReviewed();
    }
    catch (saveError) {
        setError(errorMessage(saveError));
    }
    finally {
        setSaving(false);
    } }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><h3 className="text-lg font-bold capitalize">{decision} payment</h3><p className="mt-1 text-sm text-ink-muted">The server locks {payment.reference} and applies this decision once.</p>{error && <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}{decision !== "waive" && <label className="mt-5 block text-sm font-semibold">Amount received (MAD)<input required min={0} step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 field w-full"/></label>}<label className="mt-4 block text-sm font-semibold">Internal review note<textarea required={decision === "reject"} minLength={decision === "reject" ? 8 : 0} value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm"/></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving || (decision === "reject" && note.trim().length < 8)} className={`rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${decision === "reject" ? "bg-danger" : "bg-emerald-600"}`}>{saving ? "Applying…" : `Confirm ${decision}`}</button></div></form></div>;
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
    const load = useCallback(async () => { setLoading(true); setError(""); try {
        const [result, officialPlans] = await Promise.all([founderAdmin.subscriptions({ page: page + 1, pageSize: PAGE_SIZE, query, status, plan, migrationState: migration }), founderAdmin.officialPlans()]);
        setRows(result.rows || []);
        setTotal(result.total || 0);
        setPlans(officialPlans || []);
    }
    catch (loadError) {
        setError(errorMessage(loadError));
    }
    finally {
        setLoading(false);
    } }, [migration, page, plan, query, status]);
    useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8"><PageHeading eyebrow="Billing" title="Subscriptions" description="Owner-level plans shared across owned workspaces. Legacy access is explicit and never presented as a paid plan." action={<RefreshButton onClick={() => void load()} loading={loading}/>}/><div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 md:grid-cols-[1fr_160px_150px_210px]"><SearchBox value={query} setValue={(value) => { setPage(0); setQuery(value); }} placeholder="Seller or email…"/><Select value={status} setValue={(value) => { setPage(0); setStatus(value); }} label="Status" options={["pending_payment", "under_review", "active", "grace", "expired", "suspended", "cancelled"]}/><Select value={plan} setValue={(value) => { setPage(0); setPlan(value); }} label="Plan" options={["starter", "growth", "pro", "scale"]}/><select value={migration} onChange={(event) => { setPage(0); setMigration(event.target.value); }} aria-label="Migration state" className="field"><option value="">All migration states</option><option value="assigned">Assigned</option><option value="needs_plan_assignment">Needs plan assignment</option><option value="legacy_access">Legacy access</option></select></div>{error ? <EmptyState title="Could not load subscriptions" copy={error}/> : <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm"><div className="border-b border-base-border px-4 py-3 text-sm font-semibold">{total.toLocaleString()} owner subscriptions</div><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-base-raised text-[11px] uppercase text-ink-faint"><tr><th className="px-4 py-3">Seller</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Workspaces</th><th className="px-4 py-3">Orders usage</th><th className="px-4 py-3">Period ends</th><th className="px-4 py-3">Migration</th><th className="px-4 py-3"></th></tr></thead><tbody>{loading ? <LoadingRow columns={9}/> : rows.length ? rows.map((item) => <tr key={item.id} className="border-t border-base-border hover:bg-base-raised/50"><td className="px-4 py-3"><p className="font-semibold">{item.seller_name || "Unnamed seller"}</p><p className="text-xs text-ink-muted">{item.seller_email}</p></td><td className="px-4 py-3"><p className="font-semibold capitalize">{item.plan_name || "No plan assigned"}</p><p className="text-xs text-ink-muted">{item.billing_cycle || "No billing cycle"}</p></td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3"><StatusBadge value={item.payment_status}/></td><td className="px-4 py-3 font-semibold">{item.workspace_count}</td><td className="px-4 py-3">{usageCopy(item)}</td><td className="px-4 py-3 text-xs text-ink-muted">{item.current_period_end ? dateTime.format(new Date(item.current_period_end)) : "—"}</td><td className="px-4 py-3"><StatusBadge value={item.migration_state}/></td><td className="px-4 py-3 text-right">{can("billing.manage") && <button onClick={() => setSelected(item)} className="rounded-lg border border-base-border px-3 py-2 text-xs font-bold text-brand-accent">Manage</button>}</td></tr>) : <tr><td colSpan={9}><EmptyState title="No subscriptions match" copy="Clear a filter or search another seller."/></td></tr>}</tbody></table></div><Pager page={page} pages={pages} loading={loading} setPage={setPage}/></section>}{selected && <ManageSubscriptionDialog subscription={selected} plans={plans} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); await load(); }}/>}</div>;
}
function ManageSubscriptionDialog({ subscription, plans, onClose, onSaved }: {
    subscription: PlatformSubscription;
    plans: OfficialPlan[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [mode, setMode] = useState<"assign" | "grace">("assign");
    const [plan, setPlan] = useState((subscription.plan_code || "growth") as OfficialPlan["code"]);
    const [cycle, setCycle] = useState<"monthly" | "annual">((subscription.billing_cycle as "monthly" | "annual") || "monthly");
    const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
    const [end, setEnd] = useState(addMonths(new Date(), cycle === "annual" ? 12 : 1));
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { setEnd(addMonths(new Date(`${start}T00:00:00`), cycle === "annual" ? 12 : 1)); }, [cycle, start]);
    return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try {
        if (mode === "assign")
            await founderAdmin.assignSubscription(subscription.owner_user_id, plan, cycle, new Date(`${start}T00:00:00`).toISOString(), new Date(`${end}T00:00:00`).toISOString(), reason);
        else
            await founderAdmin.grantSubscriptionGrace(subscription.owner_user_id, new Date(`${end}T23:59:59`).toISOString(), reason);
        await onSaved();
    }
    catch (saveError) {
        setError(errorMessage(saveError));
    }
    finally {
        setSaving(false);
    } }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold">Manage subscription</h3><p className="mt-1 text-sm text-ink-muted">{subscription.seller_name || subscription.seller_email}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-base-border p-2"><X size={17}/></button></div><div className="mt-5 grid grid-cols-2 rounded-lg bg-base-raised p-1"><button type="button" onClick={() => setMode("assign")} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "assign" ? "bg-base-surface shadow-sm" : "text-ink-muted"}`}>Assign / activate</button><button type="button" onClick={() => setMode("grace")} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "grace" ? "bg-base-surface shadow-sm" : "text-ink-muted"}`}>Grant grace</button></div>{error && <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}{mode === "assign" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Plan<select value={plan} onChange={(event) => setPlan(event.target.value as OfficialPlan["code"])} className="mt-2 field w-full">{plans.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="text-sm font-semibold">Billing cycle<select value={cycle} onChange={(event) => setCycle(event.target.value as "monthly" | "annual")} className="mt-2 field w-full"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><label className="text-sm font-semibold">Period start<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 field w-full"/></label><label className="text-sm font-semibold">Period end<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 field w-full"/></label></div>}{mode === "grace" && <label className="mt-4 block text-sm font-semibold">Grace until<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 field w-full"/></label>}<label className="mt-4 block text-sm font-semibold">Audit reason<textarea required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm"/></label><p className="mt-3 text-xs text-ink-muted">Manual activation is explicitly recorded as waived; it is never represented as a paid transfer.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving || reason.trim().length < 8} className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : mode === "assign" ? "Assign subscription" : "Grant grace"}</button></div></form></div>;
}
function PlansPage() {
    const [plans, setPlans] = useState<OfficialPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async () => { setLoading(true); setError(""); try {
        setPlans(await founderAdmin.officialPlans());
    }
    catch (loadError) {
        setError(errorMessage(loadError));
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    return <div className="mx-auto max-w-[1400px] p-4 md:p-6 lg:p-8"><PageHeading eyebrow="Billing" title="Official plans" description="The authoritative MAD catalog used by payment requests and effective limits. Null capacity means Unlimited; annual billing never multiplies operational quotas." action={<RefreshButton onClick={() => void load()} loading={loading}/>}/>{error ? <EmptyState title="Could not load official plans" copy={error}/> : loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-brand-accent"/></div> : <div className="grid gap-4 lg:grid-cols-4">{plans.map((plan) => <article key={plan.code} className={`relative overflow-hidden rounded-2xl border bg-base-surface p-5 shadow-sm ${planCardClass(plan.code, plan.is_popular)}`}><div className={`absolute inset-x-0 top-0 h-1 ${planStripeClass(plan.code)}`}/>{plan.is_popular && <span className="absolute right-3 top-3 rounded-full bg-pink-600 px-3 py-1 text-[10px] font-bold uppercase text-white">Most popular</span>}<PlanBadge code={plan.code} label={plan.name}/><p className="mt-3 min-h-10 text-sm text-ink-muted">{plan.description}</p><p className="mt-5 text-3xl font-bold">{currency.format(plan.monthly_price_mad)}<span className="text-sm font-medium text-ink-muted">/mo</span></p><p className="mt-1 text-xs text-ink-muted">{currency.format(plan.annual_price_mad)} annually</p><div className="mt-5 space-y-2 text-sm"><PlanLine label="Orders" value={`${plan.order_limit.toLocaleString()} / ${plan.order_period}`}/><PlanLine label="Workspaces" value={limitCopy(plan.workspace_limit)}/><PlanLine label="Team members" value={limitCopy(plan.team_member_limit)}/><PlanLine label="Integrations" value={limitCopy(plan.integration_limit)}/></div><div className="mt-5 border-t border-base-border pt-4"><p className="text-xs font-bold uppercase text-ink-faint">Premium modules</p>{Object.entries(plan.entitlements).map(([key, enabled]) => <div key={key} className={`mt-2 flex items-center gap-2 text-xs ${enabled ? "text-ink" : "text-ink-faint"}`}>{enabled ? <Check size={13} className="text-emerald-600"/> : <X size={13}/>}<span>{key.replace(/_/g, " ")}</span></div>)}</div></article>)}</div>}</div>;
}
function SearchBox({ value, setValue, placeholder }: {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
}) { return <label className="flex items-center gap-2 rounded-lg border border-base-border bg-base-raised px-3"><Search size={16} className="text-ink-faint"/><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></label>; }
function Select({ value, setValue, label, options }: {
    value: string;
    setValue: (value: string) => void;
    label: string;
    options: string[];
}) { return <select value={value} onChange={(event) => setValue(event.target.value)} aria-label={label} className="field"><option value="">All {label.toLowerCase()}s</option>{options.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select>; }
function Pager({ page, pages, loading, setPage }: {
    page: number;
    pages: number;
    loading: boolean;
    setPage: (page: number) => void;
}) { return <div className="flex items-center justify-between border-t border-base-border px-4 py-3"><p className="text-sm text-ink-muted">Page {Math.min(page + 1, pages)} of {pages}</p><div className="flex gap-2"><button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronLeft size={17}/></button><button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronRight size={17}/></button></div></div>; }
function LoadingRow({ columns }: {
    columns: number;
}) { return <tr><td colSpan={columns} className="p-10"><Loader2 className="mx-auto animate-spin text-brand-accent"/></td></tr>; }
function Info({ label, value }: {
    label: string;
    value: string;
}) { return <div className="rounded-lg bg-base-raised p-3"><p className="text-xs uppercase text-ink-faint">{label}</p><p className="mt-1 text-sm font-semibold capitalize">{value}</p></div>; }
function PlanBadge({ code, label }: { code: string | null; label: string }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset ${planBadgeClass(code)}`}>{label}</span>; }
function PlanLine({ label, value }: {
    label: string;
    value: string;
}) { return <div className="flex items-center justify-between gap-3"><span className="text-ink-muted">{label}</span><span className="font-semibold">{value}</span></div>; }
function planBadgeClass(code: string | null) { switch (code) { case "starter": return "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"; case "growth": return "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:ring-pink-800"; case "pro": return "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800"; case "scale": return "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800"; default: return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"; } }
function planStripeClass(code: string) { switch (code) { case "starter": return "bg-slate-400"; case "growth": return "bg-gradient-to-r from-pink-500 to-rose-500"; case "pro": return "bg-gradient-to-r from-violet-500 to-indigo-500"; case "scale": return "bg-gradient-to-r from-cyan-500 to-blue-500"; default: return "bg-brand-accent"; } }
function planCardClass(code: string, popular: boolean) { if (popular) return "border-pink-400 shadow-[0_14px_45px_rgba(236,72,153,0.14)]"; switch (code) { case "starter": return "border-slate-200 dark:border-slate-700"; case "pro": return "border-violet-200 dark:border-violet-900"; case "scale": return "border-cyan-200 dark:border-cyan-900"; default: return "border-base-border"; } }
function limitCopy(value: number | null) { return value == null ? "Unlimited" : value.toLocaleString(); }
function usageCopy(item: PlatformSubscription) { const used = Number(item.effective.usage?.orders || 0); const limit = item.effective.limits?.orders; return limit == null ? `${used.toLocaleString()} / Unlimited` : `${used.toLocaleString()} / ${Number(limit).toLocaleString()}`; }
function addMonths(date: Date, months: number) { const copy = new Date(date); copy.setUTCMonth(copy.getUTCMonth() + months); return copy.toISOString().slice(0, 10); }
