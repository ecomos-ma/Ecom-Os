import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Package, Phone, Users, Wallet, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../hooks/useAuth";
import { useDashboardData } from "../hooks/useDashboardData";
import { useConfirmationCRM } from "../hooks/useConfirmationCRM";
import { useNotifications } from "../contexts/NotificationContext";
import { isFounder, isOwnerLikeRole, normalizeAllowedSections } from "../lib/rbac";
import { normalizeStatus } from "../lib/statusEngine";

type Range = "today" | "week" | "month";

function datesFor(range: Range) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  return { start, end };
}

function money(amount: number) {
  return `${Number(amount || 0).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function MobileDashboard() {
  const { profile, session } = useAuth();
  const owner = isOwnerLikeRole(profile?.role) || isFounder(profile?.role, session?.user?.email);
  return owner ? <OwnerMobileDashboard /> : <AgentMobileDashboard />;
}

function OwnerMobileDashboard() {
  const navigate = useNavigate();
  const { profile, workspace, teamPermissions } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const { start, end } = useMemo(() => datesFor(range), [range]);
  const data = useDashboardData(start, end);
  const owner = true;
  const sections = useMemo(() => new Set(normalizeAllowedSections(profile?.allowed_sections)), [profile?.allowed_sections]);
  const can = (permission: keyof typeof teamPermissions, section: string) => owner || Boolean(teamPermissions[permission] && sections.has(section as never));
  const visibleOrders = data.orders.slice(0, 5);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const metrics: Array<[string, number | string, LucideIcon]> = owner
    ? [
      ["Orders today", data.todaysOrders, Package],
      ["Pending confirmation", data.pending, ClipboardCheck],
      ["Confirmed", data.confirmedCount, CheckCircle2],
      ["Delivered", data.delivered, Package],
    ]
    : [
      ["Orders in view", data.orders.length, Package],
      ["Pending confirmation", data.pending, ClipboardCheck],
      ["Confirmed", data.confirmedCount, CheckCircle2],
      ["Confirmation rate", `${Math.round(data.confirmationRate || 0)}%`, CheckCircle2],
    ];

  return <div className="mx-auto max-w-xl pb-5">
    <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
      <p className="text-sm text-ink-muted">{greeting()}, {firstName}</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{workspace?.name || "Your workspace"}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays size={14} />{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-0.5">
        {(["today", "week", "month"] as Range[]).map((item) => <button key={item} onClick={() => setRange(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${range === item ? "bg-brand text-white" : "bg-base-raised text-ink-muted"}`}>{item === "week" ? "Last 7 days" : item === "month" ? "This month" : "Today"}</button>)}
      </div>
    </section>

    <section className="mt-4 grid grid-cols-2 gap-3">
      {metrics.map(([label, value, Icon]) => <div key={String(label)} className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card"><div className="flex items-center gap-2 text-ink-muted"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={15} /></span><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-xl font-semibold tabular-nums text-ink">{value}</p></div>)}
    </section>

    <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-ink">Quick actions</h2></div><div className="grid grid-cols-2 gap-3">{can("orders", "Orders") && <QuickAction icon={Package} label="View orders" onClick={() => navigate("/orders")} />}{can("confirmation", "Confirmation") && <QuickAction icon={Phone} label="Start confirmation" onClick={() => navigate("/confirmation")} />}{owner && <QuickAction icon={Users} label="Assign orders" onClick={() => navigate("/team")} />}{owner ? <QuickAction icon={Wallet} label="Agent payments" onClick={() => navigate("/finance")} /> : <QuickAction icon={FileText} label="My invoices" onClick={() => navigate("/agent-invoices")} />}</div></section>

    <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center justify-between border-b border-base-border px-4 py-3.5"><div><h2 className="font-semibold text-ink">Recent orders</h2><p className="mt-0.5 text-xs text-ink-muted">Only orders available to your account are shown.</p></div>{can("orders", "Orders") && <button onClick={() => navigate("/orders")} className="inline-flex items-center gap-1 text-xs font-semibold text-brand">All orders <ArrowRight size={14} /></button>}</div>{data.loading ? <div className="space-y-3 p-4"><div className="h-12 animate-pulse rounded-lg bg-base-raised" /><div className="h-12 animate-pulse rounded-lg bg-base-raised" /></div> : visibleOrders.length === 0 ? <div className="p-8 text-center text-sm text-ink-muted">No orders for this period.</div> : <div className="divide-y divide-base-border">{visibleOrders.map((order: any) => <button key={order.id || order["Order ID"] || order.order_number} onClick={() => navigate("/orders", { state: { viewOrderId: order.id || order["Order ID"] } })} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-base-raised"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{order.order_number || order["Order ID"] || "Order"}</p><p className="mt-0.5 truncate text-xs text-ink-muted">{order.product_variant || order.sku || order.city || "Order details"}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-ink">{money(order.total)}</p><div className="mt-1"><StatusBadge status={order.status} size="sm" /></div></div></button>)}</div>}</section>

    {owner && <section className="mt-5 rounded-xl border border-base-border bg-base-surface p-4 shadow-card"><p className="text-xs font-medium text-ink-muted">Delivered revenue in this period</p><p className="mt-1 text-xl font-semibold text-ink">{money(data.revenue)}</p><div className="mt-3 flex items-center justify-between border-t border-base-border pt-3 text-sm"><span className="text-ink-muted">Delivery rate</span><span className="font-semibold text-ink">{Math.round(data.deliveryRate || 0)}%</span></div></section>}
    <RecentActivity />
  </div>;
}

function AgentMobileDashboard() {
  const navigate = useNavigate();
  const { profile, workspace, teamPermissions } = useAuth();
  const crm = useConfirmationCRM();
  const sections = new Set(normalizeAllowedSections(profile?.allowed_sections));
  const canConfirm = Boolean(teamPermissions.confirmation && sections.has("Confirmation"));
  const canSeeOrders = Boolean(teamPermissions.orders && sections.has("Orders"));
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const confirmed = Object.entries(crm.summary?.statusCounts ?? {}).reduce((total, [status, count]) => total + (normalizeStatus(status) === "confirmed" ? Number(count) : 0), 0);
  const metrics = [
    ["Assigned orders", crm.summary?.totalOrders ?? 0, Package],
    ["Remaining", crm.summary?.remainingOrders ?? 0, ClipboardCheck],
    ["Confirmed today", crm.summary?.confirmedToday ?? 0, CheckCircle2],
    ["Callbacks due", crm.summary?.callbacksDue ?? 0, Phone],
  ] as const;

  return <div className="mx-auto max-w-xl pb-5">
    <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
      <p className="text-sm text-ink-muted">{greeting()}, {firstName}</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{workspace?.name || "Your workspace"}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays size={14} />Your assigned work</p>
    </section>
    {crm.error && <div role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">{crm.error}<button onClick={() => void crm.refresh()} className="ml-2 underline">Retry</button></div>}
    <section className="mt-4 grid grid-cols-2 gap-3">
      {metrics.map(([label, value, Icon]) => <div key={label} className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card"><div className="flex items-center gap-2 text-ink-muted"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={15} /></span><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-xl font-semibold tabular-nums text-ink">{crm.loading ? "—" : value}</p></div>)}
    </section>
    <section className="mt-5 grid grid-cols-2 gap-3">
      {canConfirm && <QuickAction icon={Phone} label="Start confirmation" onClick={() => navigate("/confirmation")} />}
      {canConfirm && <QuickAction icon={CalendarDays} label="View callbacks" onClick={() => navigate("/confirmation?queue=callback_due")} />}
      {canSeeOrders && <QuickAction icon={Package} label="View orders" onClick={() => navigate("/orders")} />}
      <QuickAction icon={FileText} label="My invoices" onClick={() => navigate("/agent-invoices")} />
    </section>
    <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="border-b border-base-border px-4 py-3.5"><h2 className="font-semibold text-ink">My recent orders</h2><p className="mt-0.5 text-xs text-ink-muted">{confirmed} confirmed overall · assigned to you</p></div>{crm.loading ? <div className="p-4 text-sm text-ink-muted">Loading assigned orders…</div> : crm.orders.length === 0 ? <div className="p-8 text-center text-sm text-ink-muted">No orders assigned yet.</div> : <div className="divide-y divide-base-border">{crm.orders.slice(0, 5).map((order) => <button key={order.id} type="button" disabled={!canConfirm && !canSeeOrders} onClick={() => navigate(canConfirm ? `/confirmation?order=${encodeURIComponent(order.id)}` : "/orders", { state: canConfirm ? undefined : { viewOrderId: order.id } })} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-base-raised disabled:cursor-default"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{order.orderNumber}</span><span className="mt-0.5 block truncate text-xs text-ink-muted">{order.customerName}</span></span><span className="shrink-0 text-right"><span className="block text-sm font-semibold text-ink">{money(order.total)}</span><span className="mt-1 block"><StatusBadge status={order.status} size="sm" /></span></span></button>)}</div>}</section>
    <RecentActivity />
  </div>;
}

function RecentActivity() {
  const { notifications, openNotification } = useNotifications();
  return <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
    <div className="border-b border-base-border px-4 py-3.5"><h2 className="font-semibold text-ink">Recent activity</h2><p className="mt-0.5 text-xs text-ink-muted">Notifications recorded for your account</p></div>
    {notifications.length === 0 ? <p className="p-5 text-sm text-ink-muted">No recent activity yet.</p> : <div className="divide-y divide-base-border">{notifications.slice(0, 5).map((item) => <button key={item.id} type="button" onClick={() => void openNotification(item)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-base-raised"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? "bg-base-border" : "bg-brand"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{item.title}</span><span className="mt-0.5 block line-clamp-2 text-xs text-ink-muted">{item.message}</span><time dateTime={item.created_at} className="mt-1 block text-[11px] text-ink-faint">{new Date(item.created_at).toLocaleString()}</time></span></button>)}</div>}
  </section>;
}

function QuickAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex min-h-[86px] items-center gap-3 rounded-xl border border-base-border bg-base-surface px-4 text-left shadow-card active:bg-base-raised"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={18} /></span><span className="text-sm font-semibold text-ink">{label}</span></button>;
}
