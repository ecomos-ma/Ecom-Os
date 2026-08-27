import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CircleHelp, ShoppingCart, Users, UserRoundCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { founderAdmin, type PlatformBillingSummary, type PlatformCommandCenter } from "../../../lib/founderAdmin";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import { currency, EmptyState, LoadingState, MetricCard, PageHeading, RefreshButton, StatusBadge, errorMessage } from "./shared";

type RangePreset = "today" | "yesterday" | "last_7" | "last_30" | "this_month" | "previous_month" | "custom";

export function CommandCenter() {
  const { can } = usePlatformAdmin();
  const [data, setData] = useState<PlatformCommandCenter | null>(null);
  const [billing, setBilling] = useState<PlatformBillingSummary | null>(null);
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customStart, setCustomStart] = useState(moroccoToday());
  const [customEnd, setCustomEnd] = useState(moroccoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => rangeForPreset(preset, customStart, customEnd), [customEnd, customStart, preset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [commandCenter, billingSummary] = await Promise.all([
        founderAdmin.commandCenter(range.start, range.end),
        can("billing.read") ? founderAdmin.billingSummary() : Promise.resolve(null),
      ]);
      setData(commandCenter);
      setBilling(billingSummary);
    }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [can, range.end, range.start]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <div className="p-6"><EmptyState title="Command Center is unavailable" copy={error} /></div>;
  if (!data) return null;

  return <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8">
    <PageHeading
      eyebrow="Platform pulse"
      title="Command Center"
      description={`Real cross-tenant operations for ${data.range.start_date} to ${data.range.end_date}, calculated on ${data.range.timezone} boundaries. Unmeasured services remain Unknown.`}
      action={<div className="flex flex-wrap gap-2"><RangeControl preset={preset} setPreset={setPreset} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} /><RefreshButton onClick={() => void load()} loading={loading} /></div>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {data.sellers && <MetricCard label="Sellers" value={data.sellers.total.toLocaleString()} detail={`${data.sellers.active} active · ${data.sellers.suspended} suspended`} icon={UserRoundCheck} />}
      {data.users && <MetricCard label="Users" value={data.users.total.toLocaleString()} detail={`${data.users.active_today} active today · ${data.users.registered_in_range} new`} icon={Users} tone="violet" />}
      {data.workspaces && <MetricCard label="Workspaces" value={data.workspaces.total.toLocaleString()} detail={`${data.workspaces.active} active · ${data.workspaces.onboarding} onboarding`} icon={Building2} tone="violet" />}
      {data.orders && <MetricCard label="Orders in range" value={data.orders.total.toLocaleString()} detail={`${data.orders.delivered} delivered · ${data.orders.pending_confirmation} pending`} icon={ShoppingCart} tone="green" />}
      {data.support && <MetricCard label="Open support" value={data.support.open_count.toLocaleString()} detail={`${data.support.urgent_count} urgent · ${data.support.waiting_count} waiting`} icon={CircleHelp} tone={data.support.urgent_count ? "amber" : "green"} />}
    </section>

    {data.business_volume && <section className="mt-6 rounded-xl border border-base-border bg-base-surface p-5 shadow-sm">
      <div><p className="font-bold">Business volume</p><p className="mt-1 text-sm text-ink-muted">Gross order value, confirmed order value and delivered revenue are intentionally separate.</p></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ValueCard label="Gross order value" value={currency.format(Number(data.business_volume.gross_order_value || 0))} copy="All order value created in the selected range." />
        <ValueCard label="Confirmed order value" value={currency.format(Number(data.business_volume.confirmed_order_value || 0))} copy="Confirmed, shipped, delivered and coming-back order value." />
        <ValueCard label="Delivered revenue" value={currency.format(Number(data.business_volume.delivered_revenue || 0))} copy="Only orders normalized as delivered." emphasis />
      </div>
    </section>}

    <section className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        {data.orders && <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><p className="font-bold">Order outcomes</p><p className="mt-1 text-sm text-ink-muted">Canonical status buckets for this date range.</p></div><Link to="/admin/orders" className="text-sm font-semibold text-brand-accent">Open all orders</Link></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Outcome label="Pending" value={data.orders.pending_confirmation} /><Outcome label="Confirmed" value={data.orders.confirmed} /><Outcome label="Shipped" value={data.orders.shipped} /><Outcome label="Delivered" value={data.orders.delivered} /><Outcome label="Refused" value={data.orders.refused} /><Outcome label="Returned" value={data.orders.returned} /><Outcome label="Cancelled" value={data.orders.cancelled} /><Outcome label="Total" value={data.orders.total} /></div>
        </article>}
        {data.rates && <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><p className="font-bold">Platform rates</p><p className="mt-1 text-sm text-ink-muted">Confirmation uses total orders; delivery uses the confirmed chain.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5"><Rate label="Confirmation" value={data.rates.confirmation_rate} /><Rate label="Delivery" value={data.rates.delivery_rate} /><Rate label="Cancellation" value={data.rates.cancellation_rate} /><Rate label="Refusal" value={data.rates.refusal_rate} /><Rate label="Return" value={data.rates.return_rate} /></div></article>}
        {billing ? <OfficialBillingPulse data={billing} /> : data.subscriptions && <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="font-bold">Legacy subscription pulse</p><p className="mt-1 text-sm text-ink-muted">Legacy workspace records remain visible until the owner billing service is installed.</p></div><StatusBadge value="migration pending" /></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Outcome label="Active" value={data.subscriptions.active_count} /><Outcome label="Pending payment" value={data.subscriptions.pending_payment_count} /><Outcome label="Under review" value={data.subscriptions.under_review_count} /><Outcome label="Grace" value={data.subscriptions.grace_count} /><Outcome label="Expiring" value={data.subscriptions.expiring_count} /><Outcome label="Expired" value={data.subscriptions.expired_count} /><Outcome label="Suspended" value={data.subscriptions.suspended_count} /></div></article>}
      </div>

      <div className="space-y-4">
        <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /><p className="font-bold">Attention center</p></div>
          <p className="mt-1 text-sm text-ink-muted">Real unresolved records, ordered by operational priority.</p>
          <div className="mt-4 space-y-2">{data.attention.length ? data.attention.map((item) => <Link key={`${item.kind}-${item.id}`} to={item.href} className="block rounded-lg border border-base-border p-3 hover:border-brand-accent/40"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 truncate text-xs text-ink-muted">{item.detail}</p></Link>) : <p className="rounded-lg bg-base-raised p-4 text-center text-sm text-ink-muted">No current attention items from implemented sources.</p>}</div>
        </article>
        {data.system && <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><p className="font-bold">Measured system state</p><p className="mt-1 text-sm text-ink-muted">{data.system.note}</p><div className="mt-4 grid grid-cols-2 gap-2"><SystemState label="Database" value={data.system.database} /><SystemState label="Application" value={data.system.application} /><SystemState label="Auth" value={data.system.auth} /><SystemState label="Realtime" value={data.system.realtime} /><SystemState label="Storage" value={data.system.storage} /><SystemState label="Workers" value={data.system.workers} /></div></article>}
      </div>
    </section>
  </div>;
}

function RangeControl({ preset, setPreset, customStart, customEnd, setCustomStart, setCustomEnd }: { preset: RangePreset; setPreset: (value: RangePreset) => void; customStart: string; customEnd: string; setCustomStart: (value: string) => void; setCustomEnd: (value: string) => void }) {
  return <div className="flex flex-wrap gap-2"><select aria-label="Analytics date range" value={preset} onChange={(event) => setPreset(event.target.value as RangePreset)} className="field"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7">Last 7 days</option><option value="last_30">Last 30 days</option><option value="this_month">This month</option><option value="previous_month">Previous month</option><option value="custom">Custom</option></select>{preset === "custom" && <><input aria-label="Range start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="field" /><input aria-label="Range end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="field" /></>}</div>;
}

function ValueCard({ label, value, copy, emphasis = false }: { label: string; value: string; copy: string; emphasis?: boolean }) { return <div className={`rounded-xl border p-4 ${emphasis ? "border-emerald-500/25 bg-emerald-500/8" : "border-base-border bg-base-raised"}`}><p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{copy}</p></div>; }
function Outcome({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-base-raised p-3"><p className="text-xs text-ink-faint">{label}</p><p className="mt-1 text-lg font-bold">{Number(value || 0).toLocaleString()}</p></div>; }
function Rate({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-base-raised p-3"><p className="text-xs text-ink-faint">{label}</p><p className="mt-1 text-lg font-bold">{Number(value || 0).toFixed(1)}%</p></div>; }
function SystemState({ label, value }: { label: string; value: string }) { const measured = value !== "unknown"; return <div className="flex items-center justify-between rounded-lg bg-base-raised px-3 py-2"><span className="text-xs font-semibold">{label}</span><span className={`text-xs font-bold capitalize ${measured ? "text-emerald-600" : "text-ink-faint"}`}>{value}</span></div>; }

function OfficialBillingPulse({ data }: { data: PlatformBillingSummary }) {
  return <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">Official subscription pulse</p><p className="mt-1 text-sm text-ink-muted">Owner-level plans and verified payment workflow.</p></div><StatusBadge value="active" /></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Outcome label="Active" value={data.active_count} /><Outcome label="Pending payment" value={data.pending_payment_count} /><Outcome label="Under review" value={data.under_review_count} /><Outcome label="Grace" value={data.grace_count} /><Outcome label="Expiring" value={data.expiring_count} /><Outcome label="Unassigned" value={data.unassigned_count} /><Outcome label="Payment reviews" value={data.payments_awaiting_review} /><Outcome label="Suspended" value={data.suspended_count} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><ValueCard label="MRR" value={currency.format(Number(data.monthly_recurring_revenue_mad || 0))} copy="Monthly equivalent of active subscriptions." emphasis /><ValueCard label="Annualized recurring revenue" value={currency.format(Number(data.annualized_recurring_revenue_mad || 0))} copy="Annualized value of active subscriptions." /></div></article>;
}

function moroccoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function rangeForPreset(preset: RangePreset, customStart: string, customEnd: string) {
  const today = moroccoToday();
  const [year, month, day] = today.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const offset = (days: number) => iso(new Date(Date.UTC(year, month - 1, day + days)));
  if (preset === "today") return { start: today, end: today };
  if (preset === "yesterday") { const date = offset(-1); return { start: date, end: date }; }
  if (preset === "last_7") return { start: offset(-6), end: today };
  if (preset === "last_30") return { start: offset(-29), end: today };
  if (preset === "previous_month") return { start: iso(new Date(Date.UTC(year, month - 2, 1))), end: iso(new Date(Date.UTC(year, month - 1, 0))) };
  if (preset === "custom") return { start: customStart || today, end: customEnd || today };
  return { start: iso(new Date(Date.UTC(year, month - 1, 1))), end: today };
}
