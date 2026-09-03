import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowUpRight, Building2, Clock, CreditCard, Eye,
  Gauge, Info, RefreshCw, ShieldAlert, Sparkles, Users, XCircle,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import {
  fetchBillingOverview,
  type BillingOverview,
} from "../../../services/billingService";
import {
  billingCycleLabel, daysUntil, deriveDisplayStatus, formatMad, TONE_BADGE_CLASSES,
  TONE_DOT_CLASSES, type DisplayStatus,
} from "./billingShared";
import { PaymentDetailsDrawer, toDrawerData, type PaymentDrawerData } from "./PaymentDetailsDrawer";
import { PaymentHistory } from "./PaymentHistory";
import { reportError } from "../../../lib/errorHandling";
import { isFounder } from "../../../lib/rbac";

type Banner =
  | { kind: "expired" }
  | { kind: "expiring"; days: number }
  | { kind: "grace"; until: string | null }
  | { kind: "awaiting"; reference: string; planName: string | null; submitted: boolean }
  | { kind: "draft"; planName: string | null }
  | { kind: "rejected"; reason: string | null; planName: string | null };

export default function BillingCenter() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [drawerPayment, setDrawerPayment] = useState<PaymentDrawerData | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const isBillingOwner = ["owner", "founder", "super_admin"].includes(String(profile?.role ?? ""));

  useEffect(() => {
    if (!isBillingOwner) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    fetchBillingOverview()
      .then((data) => {
        console.log("[BillingCenter] Billing overview loaded successfully:", data);
        if (active) setOverview(data);
      })
      .catch(async (loadError) => {
        console.error("[BillingCenter] Failed to load billing overview - FULL ERROR:", {
          message: loadError?.message,
          code: (loadError as any)?.code,
          details: (loadError as any)?.details,
          hint: (loadError as any)?.hint,
          stack: (loadError as any)?.stack,
        });
        const safe = await reportError(loadError, "billing.load", { action: "load_billing_overview" });
        if (active) setError(safe.userMessage);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isBillingOwner, nonce, session?.user.id]);

  // Realtime: admin approvals/rejections, subscription and plan changes refresh
  // the page in place — no hard browser reload.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid || !isBillingOwner) return;
    const schedule = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => setNonce((value) => value + 1), 400);
    };
    const channel = supabase
      .channel(`billing-center-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_subscriptions", filter: `owner_user_id=eq.${uid}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_payment_requests", filter: `owner_user_id=eq.${uid}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, schedule)
      .subscribe();
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id, isBillingOwner]);

  const isFounderAccount = isFounder(profile?.role, session?.user.email);
  // The founder is a platform-level account, not a seller subscription. Keep
  // a first-class display plan so Billing never shows “No plan selected” or a
  // pending payment state for the account that owns the platform.
  const founderPlan = isFounderAccount ? {
    id: "founder-plan",
    code: "founder",
    name: "Founder",
    description: "Unlimited EcomOS platform access and administration.",
    monthlyPriceMad: 0,
    annualPriceMad: 0,
    orderLimit: null,
    orderPeriod: "month" as const,
    workspaceLimit: null,
    teamMemberLimit: null,
    integrationLimit: null,
    monthlyBillingEnabled: false,
    annualBillingEnabled: false,
  } : null;
  const founderSubscription = isFounderAccount ? {
    owner_user_id: session?.user.id || "founder",
    subscription_id: "founder-access",
    plan: { id: "founder-plan", code: "founder", name: "Founder" },
    billing_cycle: null,
    status: "active",
    payment_status: "waived",
    migration_state: "founder_bypass",
    current_period_start: null,
    current_period_end: null,
    grace_until: null,
    operational_access: true,
    access_reason: "founder_access",
    limits: { orders: null, orderPeriod: "month" as const, workspaces: null, teamMembers: null, integrations: null },
    usage: { periodStart: null, periodEnd: null, orders: 0, ordersRemaining: null, ordersPercent: null, workspaces: 0, teamMembers: 0, integrations: 0 },
  } : null;
  const subscription = founderSubscription ?? overview?.subscription ?? null;
  const plan = founderPlan ?? overview?.plan ?? null;
  const status: DisplayStatus = useMemo(() => deriveDisplayStatus(subscription), [subscription]);
  // Founder access is platform-owned and permanently waived. Ignore any
  // legacy payment request that may still exist for the account so it can
  // never send the founder back to checkout or show a stale draft banner.
  const openRequest = isFounderAccount ? null : overview?.open_payment_request ?? null;
  const latestRequest = isFounderAccount ? null : overview?.latest_payment_request ?? null;

  const isAnnual = subscription?.billing_cycle === "annual";
  const currentPrice = isAnnual ? plan?.annualPriceMad : plan?.monthlyPriceMad;
  const isFreePlan = !!plan && (currentPrice ?? 0) <= 0;

  const renewHref = useMemo(() => {
    const params = new URLSearchParams({ intent: "renew" });
    if (plan?.code) { params.set("plan", plan.code); }
    if (isAnnual) params.set("cycle", "annual");
    return `/payment?${params.toString()}`;
  }, [plan?.code, isAnnual]);

  const banners = useMemo<Banner[]>(() => {
    const list: Banner[] = [];
    if (status.key === "expired") list.push({ kind: "expired" });
    else if (status.key === "expiring") {
      const days = daysUntil(subscription?.current_period_end);
      list.push({ kind: "expiring", days: days ?? 0 });
    } else if (status.key === "grace") list.push({ kind: "grace", until: subscription?.grace_until ?? null });

    if (openRequest && ["submitted", "reviewing"].includes(openRequest.status)) {
      list.push({ kind: "awaiting", reference: openRequest.reference, planName: openRequest.requested_plan_name, submitted: true });
    } else if (openRequest && openRequest.status === "unpaid") {
      list.push({ kind: "draft", planName: openRequest.requested_plan_name });
    } else if (!openRequest && latestRequest?.status === "rejected" && subscription?.payment_status === "rejected") {
      list.push({ kind: "rejected", reason: latestRequest.rejection_reason, planName: latestRequest.requested_plan_name });
    }
    return list;
  }, [status.key, subscription, openRequest, latestRequest]);

  const openDrawerFromOverview = useCallback(() => {
    if (!openRequest) {
      console.warn("[BillingCenter] Attempted to open drawer but no open request exists");
      return;
    }
    const paymentData = toDrawerData({
      id: openRequest.id,
      reference: openRequest.reference,
      request_type: openRequest.request_type,
      requested_plan_name: openRequest.requested_plan_name,
      billing_cycle: openRequest.billing_cycle,
      expected_amount_mad: openRequest.expected_amount_mad,
      amount_received_mad: null,
      currency: openRequest.currency,
      payment_method: openRequest.payment_method,
      transaction_reference: openRequest.transaction_reference,
      proof_path: openRequest.proof_path,
      proof_mime_type: openRequest.proof_mime_type,
      proof_size_bytes: null,
      status: openRequest.status,
      submitted_at: openRequest.submitted_at,
      reviewed_at: null,
      created_at: openRequest.created_at,
      rejection_reason: null,
    });
    console.log("[BillingCenter] Opening payment details drawer with data:", paymentData);
    setDrawerPayment(paymentData);
  }, [openRequest]);

  if (!isBillingOwner) {
    return (
      <div className="rounded-xl border border-base-border bg-base-surface p-6 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-base-raised text-ink-muted"><ShieldAlert size={17} /></div>
          <div>
            <div className="text-[14px] font-semibold text-ink">Billing is managed by the workspace owner</div>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">Only the workspace owner can view and manage the subscription and payments for this workspace.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-10">
      {banners.map((banner) => <StatusBanner key={banner.kind} banner={banner} renewHref={renewHref} onViewPayment={openDrawerFromOverview} />)}

      {error && !loading ? (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-6 shadow-card">
          <div className="flex items-start gap-3">
            <XCircle size={18} className="mt-0.5 flex-none text-danger" />
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-ink">We couldn't load your billing information.</div>
              <p className="mt-1 text-[12.5px] text-ink-muted">Please try again. If the problem persists, contact support.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-accentHover"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : loading ? (
        <BillingSkeleton />
      ) : (
        <>
          <CurrentPlanCard
            plan={plan}
            subscription={subscription}
            status={status}
            isAnnual={isAnnual}
            currentPrice={currentPrice}
            isFreePlan={isFreePlan}
            hasOpenRequest={!!openRequest}
            renewHref={renewHref}
            onViewPayment={openDrawerFromOverview}
          />

          <PlanUsageCard subscription={subscription} plan={plan} />

          <PaymentHistory refreshKey={nonce} onSelect={setDrawerPayment} founderAccess={isFounderAccount} />
        </>
      )}

      <PaymentDetailsDrawer payment={drawerPayment} onClose={() => {
        console.log("[BillingCenter] Payment details drawer closed, clearing selected payment");
        setDrawerPayment(null);
      }} />
    </div>
  );
}

// ─── Status banners ───────────────────────────────────────────────────────────

function StatusBanner({ banner, renewHref, onViewPayment }: { banner: Banner; renewHref: string; onViewPayment: () => void }) {
  switch (banner.kind) {
    case "expired":
      return (
        <BannerShell tone="danger" icon={<AlertTriangle size={16} />}>
          <span className="font-semibold">Your subscription has expired.</span> Renew to restore full access.
          <BannerAction href={renewHref}>Renew Subscription</BannerAction>
        </BannerShell>
      );
    case "expiring":
      return (
        <BannerShell tone="warning" icon={<Clock size={16} />}>
          <span className="font-semibold">Your plan expires in {banner.days} {banner.days === 1 ? "day" : "days"}.</span> Renew now to keep uninterrupted access.
          <BannerAction href={renewHref}>Renew Plan</BannerAction>
        </BannerShell>
      );
    case "grace":
      return (
        <BannerShell tone="warning" icon={<Clock size={16} />}>
          Your subscription is in a grace period{banner.until ? <> until <span className="font-semibold">{new Date(banner.until).toLocaleDateString()}</span></> : null}. Submit a payment to secure your access.
          <BannerAction href={renewHref}>Renew Plan</BannerAction>
        </BannerShell>
      );
    case "awaiting":
      return (
        <BannerShell tone="info" icon={<Info size={16} />}>
          <span className="font-semibold">Payment awaiting approval.</span> Your payment is waiting for Admin approval. Billing updates automatically once it is reviewed.
          <BannerAction onClick={onViewPayment}>View Payment</BannerAction>
        </BannerShell>
      );
    case "draft":
      return (
        <BannerShell tone="info" icon={<Info size={16} />}>
          <span className="font-semibold">Payment started.</span> Complete your payment by uploading your transfer receipt.
          <BannerAction href="/payment?intent=renew">Complete Payment</BannerAction>
        </BannerShell>
      );
    case "rejected":
      return (
        <BannerShell tone="danger" icon={<AlertTriangle size={16} />}>
          <span className="font-semibold">Your last payment was rejected.</span>
          {banner.reason ? <span className="block">Reason: {banner.reason}</span> : null}
          <BannerAction href="/payment?intent=renew">Submit New Payment</BannerAction>
        </BannerShell>
      );
  }
}

function BannerShell({ tone, icon, children }: { tone: "danger" | "warning" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  const tones = {
    danger: "border-danger/25 bg-danger/5 text-danger",
    warning: "border-warn/25 bg-warn/5 text-warn",
    info: "border-info/25 bg-info/5 text-info",
  } as const;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-4 text-[13px] sm:flex-row sm:items-center sm:justify-between ${tones[tone]}`}>
      <div className="flex items-start gap-2.5 sm:items-center">
        <span className="mt-0.5 flex-none sm:mt-0">{icon}</span>
        <div className="min-w-0 text-ink">{children}</div>
      </div>
    </div>
  );
}

function BannerAction({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const className = "inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-accentHover max-sm:w-full max-sm:justify-center";
  if (href) return <Link to={href} className={className}>{children}<ArrowUpRight size={12} /></Link>;
  return <button type="button" onClick={onClick} className={className}>{children}</button>;
}

// ─── Current plan card ────────────────────────────────────────────────────────

function CurrentPlanCard({
  plan, subscription, status, isAnnual, currentPrice, isFreePlan, hasOpenRequest, renewHref, onViewPayment,
}: {
  plan: BillingOverview["plan"];
  subscription: BillingOverview["subscription"];
  status: DisplayStatus;
  isAnnual: boolean;
  currentPrice: number | null | undefined;
  isFreePlan: boolean;
  hasOpenRequest: boolean;
  renewHref: string;
  onViewPayment: () => void;
}) {
  const daysLeft = daysUntil(subscription?.current_period_end);
  const expired = status.key === "expired";

  return (
    <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
      <div className="flex flex-col gap-4 border-b border-base-border bg-gradient-to-r from-brand-accent/10 via-base-surface to-base-surface p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-[18px] font-bold tracking-tight text-ink">{plan?.name ?? "No plan selected"}</h2>
            <StatusBadge status={status} />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            {plan ? (
                plan.code === "founder" ? (
                  <span className="text-[26px] font-black tracking-tight text-ink">Unlimited</span>
                ) : isFreePlan ? (
                <span className="text-[26px] font-black tracking-tight text-ink">Free</span>
              ) : (
                <>
                  <span className="text-[26px] font-black tracking-tight text-ink">{formatMad(currentPrice)}</span>
                  <span className="text-[13px] font-medium text-ink-muted">/ {isAnnual ? "year" : "month"}</span>
                </>
              )
            ) : (
              <span className="text-[13px] text-ink-muted">Choose a plan to activate your workspace.</span>
            )}
          </div>
          {plan?.description ? <p className="mt-1.5 max-w-lg text-[12.5px] leading-5 text-ink-muted">{plan.description}</p> : null}
        </div>
        <div className="flex flex-none flex-row gap-2 max-sm:w-full">
          {hasOpenRequest ? (
            <button type="button" onClick={onViewPayment} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-[12.5px] font-semibold text-info sm:flex-none">
              <Eye size={14} /> View Payment
            </button>
          ) : plan && !isFreePlan ? (
            <Link
              to={renewHref}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-brand-accentHover sm:flex-none"
            >
              <CreditCard size={14} /> {expired ? "Renew Subscription" : "Renew Plan"}
            </Link>
          ) : !plan ? (
            <Link
              to="/payment?intent=renew"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-brand-accentHover sm:flex-none"
            >
              <Sparkles size={14} /> Choose your plan
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 md:grid-cols-5">
        <MetaItem label="Status" value={status.label} />
        <MetaItem label="Started" value={formatDateSafe(subscription?.current_period_start)} />
        <MetaItem label={expired ? "Expired on" : "Expires"} value={formatDateSafe(subscription?.current_period_end)} />
        <MetaItem
          label="Days remaining"
          value={
            status.key === "active" || status.key === "expiring"
              ? `${Math.max(daysLeft ?? 0, 0)} ${daysLeft === 1 ? "day" : "days"}`
              : status.key === "grace"
                ? `${Math.max(daysUntil(subscription?.grace_until) ?? 0, 0)} (grace)`
                : "—"
          }
        />
        <MetaItem label="Billing cycle" value={subscription?.billing_cycle ? billingCycleLabel(subscription.billing_cycle) : "—"} />
      </dl>
    </section>
  );
}

function formatDateSafe(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 truncate text-[13.5px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_BADGE_CLASSES[status.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[status.tone]}`} />
      {status.label}
    </span>
  );
}

// ─── Plan usage ───────────────────────────────────────────────────────────────

function PlanUsageCard({ subscription, plan }: { subscription: BillingOverview["subscription"]; plan: BillingOverview["plan"] }) {
  if (!subscription) return null;
  const { limits, usage } = subscription;

  const ordersLabel = limits.orderPeriod === "day" ? "Orders today" : "Orders this month";
  const ordersPercent = usage.ordersPercent ?? (limits.orders ? Math.min(Math.round((usage.orders / limits.orders) * 100), 100) : null);

  const rows: { key: string; icon: React.ReactNode; label: string; used: number | null; limit: number | null | 'unlimited'; percent: number | null; hint?: string }[] = [
    {
      key: "orders",
      icon: <Gauge size={15} />,
      label: ordersLabel,
      used: usage.orders,
      limit: limits.orders,
      percent: ordersPercent,
      hint: ordersPercent !== null && ordersPercent >= 85
        ? `You have used ${ordersPercent}% of your ${limits.orderPeriod === "day" ? "daily" : "monthly"} order limit.`
        : undefined,
    },
    { key: "team", icon: <Users size={15} />, label: "Team members", used: usage.teamMembers, limit: limits.teamMembers, percent: percentOf(usage.teamMembers, limits.teamMembers) },
    { key: "workspaces", icon: <Building2 size={15} />, label: "Workspaces", used: usage.workspaces, limit: limits.workspaces, percent: percentOf(usage.workspaces, limits.workspaces) },
    { key: "integrations", icon: <CreditCard size={15} />, label: "Integrations", used: usage.integrations, limit: limits.integrations, percent: percentOf(usage.integrations, limits.integrations) },
  ];

  const showCard = rows.some((row) => {
    const hasLimit = row.limit !== null && row.limit !== 'unlimited';
    const hasUsage = (row.used ?? 0) > 0;
    return hasLimit || hasUsage;
  });
  if (!showCard && !plan) return null;

  return (
    <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent"><Gauge size={15} /></div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Plan usage</h3>
          <p className="text-[12px] text-ink-muted">Live usage for your current plan.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <UsageRow key={row.key} icon={row.icon} label={row.label} used={row.used} limit={row.limit} percent={row.percent} hint={row.hint} />
        ))}
      </div>
    </section>
  );
}

function percentOf(used: number | null, limit: number | null | 'unlimited'): number | null {
  if (limit === null || limit === undefined || limit === 'unlimited' || limit <= 0) return null;
  return Math.min(Math.round(((used ?? 0) / Number(limit)) * 100), 100);
}

function UsageRow({ icon, label, used, limit, percent, hint }: { icon: React.ReactNode; label: string; used: number | null; limit: number | null | 'unlimited'; percent: number | null; hint?: string }) {
  const numericLimit = limit === 'unlimited' ? null : limit;
  const reached = numericLimit !== null && (used ?? 0) >= numericLimit;
  const near = !reached && percent !== null && percent >= 85;
  const stateTone = reached ? "text-danger" : near ? "text-warn" : "text-ink-muted";
  const barTone = reached ? "bg-danger" : near ? "bg-warn" : "bg-brand-accent";

  return (
    <div className="rounded-lg border border-base-border bg-base-raised/40 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-ink-muted">
          {icon}
          <span className="truncate text-[12.5px] font-medium text-ink">{label}</span>
        </div>
        <span className={`flex-none text-[12.5px] font-bold ${stateTone}`}>
          {limit === null || limit === 'unlimited' ? "Unlimited" : `${(used ?? 0).toLocaleString()} / ${numericLimit?.toLocaleString() ?? '0'}`}
        </span>
      </div>
      {numericLimit !== null ? (
        <>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-base-border/60">
            <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${percent ?? 0}%` }} />
          </div>
          {hint ? <p className={`mt-2 text-[11.5px] font-medium ${reached ? "text-danger" : "text-warn"}`}>{hint}</p> : null}
        </>
      ) : null}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full space-y-3">
            <div className="h-6 w-40 animate-pulse rounded-lg bg-base-raised" />
            <div className="h-9 w-48 animate-pulse rounded-lg bg-base-raised" />
            <div className="h-4 w-64 animate-pulse rounded-lg bg-base-raised" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-lg bg-base-raised" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-base-raised" />)}
        </div>
      </div>
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="mb-4 h-5 w-32 animate-pulse rounded-lg bg-base-raised" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-base-raised" />)}
        </div>
      </div>
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="mb-4 h-5 w-40 animate-pulse rounded-lg bg-base-raised" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-base-raised" />)}
        </div>
      </div>
    </div>
  );
}
