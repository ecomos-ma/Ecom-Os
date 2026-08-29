import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, BellRing, CheckCircle2, CircleHelp,
  CreditCard, Radio, ReceiptText, Settings2, ShieldCheck, ShoppingBag, Store,
  TrendingUp, UserRoundCheck, Users, WalletCards, type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  founderAdmin, type FounderOrderV2, type PlatformBillingSummary,
  type PlatformCommandCenter, type PlatformSeller,
} from "../../../lib/founderAdmin";
import { supabase } from "../../../lib/supabase";
import type { PlatformPermission } from "../../../lib/rbac";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import { currency, dateTime, EmptyState, LoadingState, PageHeading, RefreshButton, StatusBadge, errorMessage } from "./shared";

type RangePreset = "today" | "yesterday" | "last_7" | "last_30" | "this_month" | "previous_month" | "custom";

export function CommandCenter() {
  const { can } = usePlatformAdmin();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "admin";
  const [data, setData] = useState<PlatformCommandCenter | null>(null);
  const [billing, setBilling] = useState<PlatformBillingSummary | null>(null);
  const [orders, setOrders] = useState<FounderOrderV2[]>([]);
  const [sellers, setSellers] = useState<PlatformSeller[]>([]);
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customStart, setCustomStart] = useState(moroccoToday());
  const [customEnd, setCustomEnd] = useState(moroccoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => rangeForPreset(preset, customStart, customEnd), [customEnd, customStart, preset]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      if (previewMode) {
        const preview = previewData();
        setData(preview.command); setBilling(preview.billing); setOrders(preview.orders); setSellers(preview.sellers);
        return;
      }
      const [commandCenter, billingSummary, orderFeed, sellerFeed] = await Promise.all([
        founderAdmin.commandCenter(range.start, range.end),
        can("billing.read") ? founderAdmin.billingSummary() : Promise.resolve(null),
        can("orders.read_all") ? founderAdmin.globalOrdersV3({ page: 1, pageSize: 8, sort: "newest" }) : Promise.resolve(null),
        can("workspaces.read") ? founderAdmin.platformSellers({ page: 1, pageSize: 6, startDate: range.start, endDate: range.end }) : Promise.resolve(null),
      ]);
      setData(commandCenter); setBilling(billingSummary);
      setOrders(orderFeed?.orders || []); setSellers(sellerFeed?.rows || []);
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { if (!quiet) setLoading(false); }
  }, [can, previewMode, range.end, range.start]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (previewMode || !can("orders.read_all")) return;
    let timer: number | undefined;
    const channel = supabase.channel("admin-command-center-order-spy")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        window.clearTimeout(timer); timer = window.setTimeout(() => void load(true), 350);
      }).subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [can, load, previewMode]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <div className="p-6"><EmptyState title="Command Center is unavailable" copy={error} /></div>;
  if (!data) return null;

  const heroMetrics = [
    { label: "Monthly recurring", value: currency.format(Number(billing?.monthly_recurring_revenue_mad || 0)), detail: `${billing?.active_count || 0} active subscriptions`, icon: WalletCards },
    { label: "Orders in range", value: Number(data.orders?.total || 0).toLocaleString(), detail: `${Number(data.orders?.delivered || 0).toLocaleString()} delivered`, icon: ShoppingBag },
    { label: "Sellers", value: Number(data.sellers?.total || 0).toLocaleString(), detail: `${data.sellers?.active || 0} active accounts`, icon: UserRoundCheck },
    { label: "Needs attention", value: String(data.attention.length + Number(data.support?.urgent_count || 0) + Number(billing?.payments_awaiting_review || 0)), detail: "Payments, tickets and risks", icon: BellRing },
  ];

  return <div className="mx-auto max-w-[1720px] p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Live platform command" title="Good morning. Here’s what needs your attention." description="Run sellers, orders, revenue and platform health from one focused workspace. Every number below comes from the cross-tenant admin layer." action={<div className="flex flex-wrap gap-2"><RangeControl preset={preset} setPreset={setPreset} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} /><RefreshButton onClick={() => void load()} loading={loading} /></div>} />

    <section className="relative overflow-hidden rounded-[28px] bg-[#180d2d] px-5 py-6 text-white shadow-[0_24px_70px_rgba(35,16,68,0.18)] md:px-7 md:py-8">
      <div className="pointer-events-none absolute -right-20 -top-36 h-96 w-96 rounded-full bg-violet-500/25 blur-3xl" /><div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-100"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Platform is live</span><h2 className="mt-5 max-w-xl text-2xl font-black tracking-[-0.04em] md:text-4xl">One calm command layer for the entire EcomOS business.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-violet-100/60">Spot operational risk, open any seller, review money and follow every order without jumping between disconnected tools.</p></div><div className="flex flex-wrap gap-2"><Link to="/admin/orders" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-[#24123f] shadow-lg shadow-black/10"><Radio size={15} className="text-emerald-500" />Open live Order Spy<ArrowRight size={14} /></Link><Link to="/admin/sellers" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 text-xs font-black text-white hover:bg-white/10"><Store size={15} />Manage sellers</Link></div></div>
      <div className="relative mt-7 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">{heroMetrics.map(({ label, value, detail, icon: Icon }) => <div key={label} className="bg-[#21113b]/90 p-4 md:p-5"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200/55">{label}</p><Icon size={16} className="text-violet-300/60" /></div><p className="mt-3 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-[11px] text-violet-100/45">{detail}</p></div>)}</div>
    </section>

    {error && <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-700">Some live data could not refresh: {error}</div>}
    <section className="mt-6 grid gap-5 2xl:grid-cols-[1.55fr_0.85fr]"><OrderSpy orders={orders} total={data.orders?.total || 0} /><AttentionCenter data={data} paymentReviews={billing?.payments_awaiting_review || 0} /></section>
    <section className="mt-5 grid gap-5 2xl:grid-cols-[1.2fr_0.8fr]"><SellerRadar sellers={sellers} /><RevenuePulse billing={billing} volume={data.business_volume} /></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><OrderPerformance data={data} /><SystemPulse data={data} /></section>
    <QuickTools can={can} />
  </div>;
}

function OrderSpy({ orders, total }: { orders: FounderOrderV2[]; total: number }) {
  return <article className="overflow-hidden rounded-[24px] border border-base-border bg-base-surface shadow-sm"><div className="flex flex-col gap-3 border-b border-base-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><Radio size={18} /></span><div><div className="flex items-center gap-2"><h3 className="font-black">Order Spy</h3><span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span></div><p className="mt-0.5 text-xs text-ink-muted">The newest orders from every seller on the platform.</p></div></div><Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-xs font-black text-brand-accent">Watch all {Number(total).toLocaleString()} orders<ArrowRight size={14} /></Link></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left"><thead className="bg-base-raised/70 text-[10px] font-black uppercase tracking-wider text-ink-faint"><tr><th className="px-5 py-3">Order</th><th className="px-4 py-3">Seller</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Created</th></tr></thead><tbody>{orders.length ? orders.map((order) => <tr key={order.id} className="group border-t border-base-border/75 transition hover:bg-brand-accent/[0.035]"><td className="px-5 py-3.5"><Link to={`/admin/orders?order=${order.id}`} className="font-mono text-xs font-black text-brand-accent group-hover:underline">#{order.order_number}</Link></td><td className="px-4 py-3.5"><p className="max-w-40 truncate text-xs font-bold">{order.workspace_name || "Unknown seller"}</p></td><td className="px-4 py-3.5"><p className="max-w-40 truncate text-xs font-semibold">{order.customer_name || "Unnamed customer"}</p><p className="mt-0.5 text-[10px] text-ink-faint">{order.city || order.phone || "No location"}</p></td><td className="px-4 py-3.5 text-xs font-black">{currency.format(Number(order.total || 0))}</td><td className="px-4 py-3.5"><StatusBadge value={order.status} /></td><td className="px-5 py-3.5 text-right text-[10px] text-ink-muted">{dateTime.format(new Date(order.created_at))}</td></tr>) : <tr><td colSpan={6}><EmptyState title="No recent orders" copy="New seller orders will appear here live." /></td></tr>}</tbody></table></div></article>;
}

function AttentionCenter({ data, paymentReviews }: { data: PlatformCommandCenter; paymentReviews: number }) {
  const items = [
    paymentReviews ? { id: "payments", title: `${paymentReviews} payment${paymentReviews === 1 ? "" : "s"} awaiting review`, copy: "Verify bank transfer proof and activate access.", href: "/admin/payments", tone: "amber" } : null,
    data.support?.urgent_count ? { id: "support", title: `${data.support.urgent_count} urgent support ticket${data.support.urgent_count === 1 ? "" : "s"}`, copy: "Seller operations may be blocked.", href: "/admin/support", tone: "red" } : null,
    ...(data.attention || []).slice(0, 4).map((item) => ({ id: `${item.kind}-${item.id}`, title: item.title, copy: item.detail, href: item.href, tone: item.priority >= 8 ? "red" : "amber" })),
  ].filter(Boolean) as Array<{ id: string; title: string; copy: string; href: string; tone: string }>;
  return <article className="rounded-[24px] border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Priority queue</p><h3 className="mt-1 font-black">Needs your attention</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><AlertTriangle size={18} /></span></div><div className="mt-4 space-y-2.5">{items.length ? items.map((item) => <Link key={item.id} to={item.href} className="group flex items-start gap-3 rounded-2xl border border-base-border p-3.5 transition hover:border-brand-accent/25 hover:bg-base-raised/60"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === "red" ? "bg-danger" : "bg-amber-500"}`} /><span className="min-w-0 flex-1"><span className="block text-xs font-black">{item.title}</span><span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-ink-muted">{item.copy}</span></span><ArrowRight size={14} className="mt-1 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brand-accent" /></Link>) : <div className="rounded-2xl bg-emerald-500/[0.07] p-5 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={24} /><p className="mt-2 text-sm font-black">Priority queue is clear</p><p className="mt-1 text-xs text-ink-muted">Nothing urgent from the measured sources.</p></div>}</div></article>;
}

function SellerRadar({ sellers }: { sellers: PlatformSeller[] }) {
  return <article className="overflow-hidden rounded-[24px] border border-base-border bg-base-surface shadow-sm"><div className="flex items-center justify-between border-b border-base-border px-5 py-4"><div><p className="font-black">Seller radar</p><p className="mt-0.5 text-xs text-ink-muted">Performance and account health in one view.</p></div><Link to="/admin/sellers" className="inline-flex items-center gap-1.5 text-xs font-black text-brand-accent">Open Seller CRM<ArrowRight size={14} /></Link></div><div className="divide-y divide-base-border/75">{sellers.length ? sellers.map((seller) => <Link key={seller.id} to={`/admin/sellers?seller=${seller.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-base-raised/60 sm:grid-cols-[minmax(180px,1fr)_110px_120px_110px] sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-accent/10 text-xs font-black text-brand-accent">{initials(seller.full_name || seller.email || "Seller")}</span><span className="min-w-0"><span className="block truncate text-xs font-black">{seller.full_name || "Unnamed seller"}</span><span className="mt-0.5 block truncate text-[10px] text-ink-faint">{seller.primary_workspace_name || seller.email || "No primary workspace"}</span></span></div><div><p className="text-[9px] font-black uppercase tracking-wider text-ink-faint">Revenue</p><p className="mt-1 text-xs font-black">{currency.format(Number(seller.delivered_revenue || 0))}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-ink-faint">Performance</p><p className="mt-1 text-xs font-black">{Number(seller.delivery_rate || 0).toFixed(1)}% delivered</p></div><div className="sm:text-right"><StatusBadge value={seller.health} /><p className="mt-1 text-[9px] font-bold uppercase text-ink-faint">{seller.plan_name || "No plan"}</p></div></Link>) : <EmptyState title="No sellers available" copy="Seller accounts will appear after ownership is assigned." />}</div></article>;
}

function RevenuePulse({ billing, volume }: { billing: PlatformBillingSummary | null; volume: PlatformCommandCenter["business_volume"] }) {
  return <article className="rounded-[24px] border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-accent">Revenue</p><h3 className="mt-1 font-black">Business pulse</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><TrendingUp size={18} /></span></div><div className="mt-5 rounded-2xl bg-gradient-to-br from-brand-accent/[0.09] to-violet-500/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Monthly recurring revenue</p><p className="mt-2 text-3xl font-black tracking-[-0.04em]">{currency.format(Number(billing?.monthly_recurring_revenue_mad || 0))}</p><p className="mt-1 text-xs text-ink-muted">{billing?.active_count || 0} active · {billing?.under_review_count || 0} under review</p></div><div className="mt-3 grid grid-cols-2 gap-3"><MiniValue label="Annual run rate" value={currency.format(Number(billing?.annualized_recurring_revenue_mad || 0))} /><MiniValue label="Delivered revenue" value={currency.format(Number(volume?.delivered_revenue || 0))} /><MiniValue label="Confirmed value" value={currency.format(Number(volume?.confirmed_order_value || 0))} /><MiniValue label="Gross order value" value={currency.format(Number(volume?.gross_order_value || 0))} /></div><div className="mt-4 grid grid-cols-2 gap-2"><Link to="/admin/subscriptions" className="rounded-xl border border-base-border px-3 py-2.5 text-center text-xs font-black hover:border-brand-accent/30">Subscriptions</Link><Link to="/admin/payments" className="rounded-xl bg-brand-accent px-3 py-2.5 text-center text-xs font-black text-white">Review payments</Link></div></article>;
}

function OrderPerformance({ data }: { data: PlatformCommandCenter }) {
  const statuses = [["Pending", data.orders?.pending_confirmation || 0, "bg-amber-400"], ["Confirmed", data.orders?.confirmed || 0, "bg-sky-500"], ["Shipped", data.orders?.shipped || 0, "bg-violet-500"], ["Delivered", data.orders?.delivered || 0, "bg-emerald-500"], ["Refused", data.orders?.refused || 0, "bg-orange-500"], ["Returned", data.orders?.returned || 0, "bg-rose-500"], ["Cancelled", data.orders?.cancelled || 0, "bg-slate-400"]] as const;
  const total = Math.max(1, data.orders?.total || 0);
  return <article className="rounded-[24px] border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="font-black">Order performance</p><p className="mt-0.5 text-xs text-ink-muted">Canonical status outcomes for the selected period.</p></div><Link to="/admin/orders" className="text-xs font-black text-brand-accent">Open details</Link></div><div className="mt-5 flex h-3 overflow-hidden rounded-full bg-base-raised">{statuses.map(([label, value, color]) => <span key={label} title={`${label}: ${value}`} className={color} style={{ width: `${Math.max(0.5, (value / total) * 100)}%` }} />)}</div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{statuses.map(([label, value, color]) => <div key={label} className="rounded-xl bg-base-raised/70 p-3"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-ink-faint"><span className={`h-1.5 w-1.5 rounded-full ${color}`} />{label}</p><p className="mt-2 text-lg font-black">{Number(value).toLocaleString()}</p></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-5"><Rate label="Confirmation" value={data.rates?.confirmation_rate || 0} /><Rate label="Delivery" value={data.rates?.delivery_rate || 0} positive /><Rate label="Cancellation" value={data.rates?.cancellation_rate || 0} /><Rate label="Refusal" value={data.rates?.refusal_rate || 0} /><Rate label="Return" value={data.rates?.return_rate || 0} /></div></article>;
}

function SystemPulse({ data }: { data: PlatformCommandCenter }) {
  const systems = data.system ? [["Application", data.system.application], ["Database", data.system.database], ["Authentication", data.system.auth], ["Realtime", data.system.realtime], ["Storage", data.system.storage], ["Workers", data.system.workers]] : [];
  return <article className="rounded-[24px] border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="font-black">Platform health</p><p className="mt-0.5 text-xs text-ink-muted">Only measured services are presented as healthy.</p></div><Link to="/admin/operations?tab=health" className="text-xs font-black text-brand-accent">Open operations</Link></div><div className="mt-4 grid grid-cols-2 gap-2">{systems.length ? systems.map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl border border-base-border px-3 py-3"><span className="text-xs font-bold">{label}</span><span className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${value === "healthy" ? "text-emerald-600" : value === "unknown" ? "text-ink-faint" : "text-amber-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${value === "healthy" ? "bg-emerald-500" : value === "unknown" ? "bg-slate-400" : "bg-amber-500"}`} />{value}</span></div>) : <p className="col-span-2 rounded-xl bg-base-raised p-4 text-center text-xs text-ink-muted">Service measurements are unavailable.</p>}</div>{data.system?.note && <p className="mt-3 text-[10px] leading-4 text-ink-faint">{data.system.note}</p>}</article>;
}

function QuickTools({ can }: { can: (permission: PlatformPermission) => boolean }) {
  const availableTools: Array<{ label: string; copy: string; href: string; icon: LucideIcon; permission?: PlatformPermission }> = [
    { label: "Seller CRM", copy: "Open any owner or workspace", href: "/admin/sellers", icon: Store, permission: "workspaces.read" },
    { label: "Order Spy", copy: "Follow all seller orders live", href: "/admin/orders", icon: Radio, permission: "orders.read_all" },
    { label: "Payment reviews", copy: "Verify transfers and access", href: "/admin/payments", icon: ReceiptText, permission: "billing.read" },
    { label: "Payment methods", copy: "Edit bank and checkout details", href: "/admin/payment-methods", icon: CreditCard, permission: "billing.manage" },
    { label: "Support inbox", copy: "Resolve seller problems", href: "/admin/support", icon: CircleHelp, permission: "support.read" },
    { label: "Users & roles", copy: "Control platform access", href: "/admin/users", icon: Users, permission: "users.read" },
    { label: "Plans & limits", copy: "Manage commercial packaging", href: "/admin/plans", icon: BadgeDollarSign, permission: "billing.read" },
    { label: "Platform settings", copy: "Configure global behavior", href: "/admin/platform", icon: Settings2, permission: "settings.read" },
  ];
  const quickTools = availableTools.filter((item) => !item.permission || can(item.permission));
  return <section className="mt-5"><div className="mb-3 flex items-end justify-between"><div><p className="font-black">Quick tools</p><p className="mt-0.5 text-xs text-ink-muted">The actions used most often by platform operators.</p></div><span className="hidden items-center gap-1 text-[10px] font-black uppercase tracking-wider text-ink-faint sm:flex"><ShieldCheck size={13} />Permission-aware</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{quickTools.map(({ label, copy, href, icon: Icon }) => <Link key={href} to={href} className="group flex items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-accent/25 hover:shadow-lg"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-base-raised text-ink-muted transition group-hover:bg-brand-accent/10 group-hover:text-brand-accent"><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black">{label}</span><span className="mt-0.5 block truncate text-[10px] text-ink-faint">{copy}</span></span><ArrowRight size={14} className="text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brand-accent" /></Link>)}</div></section>;
}

function RangeControl({ preset, setPreset, customStart, customEnd, setCustomStart, setCustomEnd }: { preset: RangePreset; setPreset: (value: RangePreset) => void; customStart: string; customEnd: string; setCustomStart: (value: string) => void; setCustomEnd: (value: string) => void }) { return <div className="flex flex-wrap gap-2"><select aria-label="Analytics date range" value={preset} onChange={(event) => setPreset(event.target.value as RangePreset)} className="field"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7">Last 7 days</option><option value="last_30">Last 30 days</option><option value="this_month">This month</option><option value="previous_month">Previous month</option><option value="custom">Custom</option></select>{preset === "custom" && <><input aria-label="Range start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="field" /><input aria-label="Range end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="field" /></>}</div>; }
function MiniValue({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-base-border p-3"><p className="text-[9px] font-black uppercase tracking-wide text-ink-faint">{label}</p><p className="mt-1.5 text-sm font-black">{value}</p></div>; }
function Rate({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) { return <div className="rounded-xl border border-base-border p-3"><p className="text-[9px] font-black uppercase tracking-wide text-ink-faint">{label}</p><p className={`mt-1.5 text-lg font-black ${positive ? "text-emerald-600" : ""}`}>{Number(value).toFixed(1)}%</p></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function moroccoToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function rangeForPreset(preset: RangePreset, customStart: string, customEnd: string) { const today = moroccoToday(); const [year, month, day] = today.split("-").map(Number); const iso = (date: Date) => date.toISOString().slice(0, 10); const offset = (days: number) => iso(new Date(Date.UTC(year, month - 1, day + days))); if (preset === "today") return { start: today, end: today }; if (preset === "yesterday") { const date = offset(-1); return { start: date, end: date }; } if (preset === "last_7") return { start: offset(-6), end: today }; if (preset === "last_30") return { start: offset(-29), end: today }; if (preset === "previous_month") return { start: iso(new Date(Date.UTC(year, month - 2, 1))), end: iso(new Date(Date.UTC(year, month - 1, 0))) }; if (preset === "custom") return { start: customStart || today, end: customEnd || today }; return { start: iso(new Date(Date.UTC(year, month - 1, 1))), end: today }; }

function previewData(): { command: PlatformCommandCenter; billing: PlatformBillingSummary; orders: FounderOrderV2[]; sellers: PlatformSeller[] } {
  const now = new Date(); const date = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const command: PlatformCommandCenter = {
    range: { start_date: "2026-08-01", end_date: "2026-08-29", start_at: "2026-08-01T00:00:00Z", end_at: "2026-08-30T00:00:00Z", timezone: "Africa/Casablanca" },
    sellers: { total: 128, active: 119, suspended: 4, active_today: 76, new_today: 3, new_month: 18 }, users: { total: 486, active_today: 214, active_7_days: 401, suspended: 6, banned: 1, registered_in_range: 42 }, workspaces: { total: 164, active: 151, suspended: 5, onboarding: 8, without_active_subscription: 11 },
    orders: { total: 1842, pending_confirmation: 196, confirmed: 310, shipped: 221, delivered: 1024, refused: 51, returned: 22, cancelled: 18 }, business_volume: { gross_order_value: 862400, confirmed_order_value: 684200, delivered_revenue: 512900 }, rates: { confirmation_rate: 84.4, delivery_rate: 74.9, cancellation_rate: 1, refusal_rate: 2.8, return_rate: 1.2 },
    subscriptions: { active_count: 113, pending_payment_count: 5, under_review_count: 7, grace_count: 3, expiring_count: 9, expired_count: 2, suspended_count: 4 }, support: { open_count: 17, urgent_count: 3, waiting_count: 8, oldest_unresolved_at: date(980) }, system: { application: "healthy", database: "healthy", auth: "healthy", realtime: "healthy", storage: "healthy", edge_functions: "healthy", workers: "healthy", note: "All measured platform services are responding normally." },
    attention: [{ kind: "subscription", id: "a1", title: "3 seller accounts enter grace this week", detail: "Contact owners before operational access changes.", href: "/admin/subscriptions", created_at: date(18), priority: 7 }, { kind: "workspace", id: "a2", title: "2 workspaces need ownership review", detail: "Ownership migration could not resolve a primary owner.", href: "/admin/workspaces", created_at: date(44), priority: 5 }], capabilities: { official_subscriptions: true, payments: true, measured_service_health: true, advertising_attribution: false },
  };
  const billing: PlatformBillingSummary = { active_count: 113, pending_payment_count: 5, under_review_count: 7, grace_count: 3, expiring_count: 9, expired_count: 2, suspended_count: 4, unassigned_count: 6, monthly_recurring_revenue_mad: 146700, annualized_recurring_revenue_mad: 1760400, payments_awaiting_review: 7, official_subscriptions: true, payments: true };
  const orders: FounderOrderV2[] = [["ord-1", "EC-84291", "pending", 699, "Atlas Gadgets", "Soukaina El Amrani", "Casablanca", 2], ["ord-2", "EC-84290", "confirmed", 449, "Kenzy Shop", "Yassine M.", "Rabat", 5], ["ord-3", "EC-84289", "shipped", 829, "Noura Market", "Imane B.", "Marrakech", 8], ["ord-4", "EC-84288", "delivered", 329, "Riad Living", "Hamza A.", "Agadir", 12], ["ord-5", "EC-84287", "pending_confirmation", 579, "Argania", "Salma R.", "Tangier", 18], ["ord-6", "EC-84286", "confirmed", 1149, "Casa Sneakers", "Zakaria L.", "Fes", 26], ["ord-7", "EC-84285", "delivered", 259, "Techdeal", "Nadia K.", "Meknes", 31], ["ord-8", "EC-84284", "returned", 399, "Medina Style", "Omar H.", "Oujda", 39]].map(([id, orderNumber, status, total, workspace, customer, city, minutes]) => ({ id: String(id), order_number: String(orderNumber), status: String(status), total: Number(total), phone: "+212 6 00 00 00 00", created_at: date(Number(minutes)), workspace_id: `ws-${id}`, workspace_name: String(workspace), customer_name: String(customer), city: String(city), payment_method: "cod" }));
  const sellers: PlatformSeller[] = [["s1", "Youssef Alaoui", "Atlas Gadgets", "Scale", "healthy", 164800, 82.4, 488], ["s2", "Kenza Benali", "Kenzy Shop", "Pro", "healthy", 108250, 79.7, 336], ["s3", "Noura El Idrissi", "Noura Market", "Pro", "attention", 89700, 68.3, 292], ["s4", "Hamza Amrani", "Riad Living", "Growth", "healthy", 62400, 76.2, 204], ["s5", "Amine Tazi", "Casa Sneakers", "Growth", "critical", 51850, 51.9, 187], ["s6", "Sara Bennis", "Medina Style", "Starter", "healthy", 35900, 73.8, 121]].map(([id, name, workspace, plan, health, revenue, delivery, orderCount], index) => ({ id: String(id), full_name: String(name), email: `${String(name).toLowerCase().replace(/\s+/g, ".")}@example.ma`, avatar_url: null, created_at: date(100000 + index), last_active: date(index * 14 + 3), primary_workspace_id: `ws-${id}`, primary_workspace_name: String(workspace), account_state: "active", plan_code: String(plan).toLowerCase(), plan_name: String(plan), subscription_status: "active", billing_cycle: "monthly", current_period_end: "2026-09-29", workspace_count: index < 2 ? 2 : 1, team_count: 3 + index, product_count: 12 + index * 3, active_campaigns: 2 + (index % 3), orders: Number(orderCount), pending: 12, confirmed: 38, delivered: Math.round(Number(orderCount) * Number(delivery) / 100), returned: 5, cancelled: 3, gross_order_value: Number(revenue) * 1.45, confirmed_order_value: Number(revenue) * 1.2, delivered_revenue: Number(revenue), confirmation_rate: 84 - index * 2.7, delivery_rate: Number(delivery), health: health as PlatformSeller["health"] }));
  return { command, billing, orders, sellers };
}
