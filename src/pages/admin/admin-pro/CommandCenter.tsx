import { useCallback, useEffect, useState } from "react";
import { CircleHelp, ShieldCheck, ShoppingCart, Sparkles, Users, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { founderAdmin, type FounderSnapshot } from "../../../lib/founderAdmin";
import { currency, EmptyState, EventLine, LoadingState, MetricCard, PageHeading, QuickLink, RefreshButton, errorMessage } from "./shared";

export function CommandCenter() {
  const [data, setData] = useState<FounderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await founderAdmin.snapshot()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <div className="p-6"><EmptyState title="Command Center is unavailable" copy={error} /></div>;
  if (!data) return null;

  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
    <PageHeading
      eyebrow="EcomOS Admin Pro"
      title="Command Center"
      description="A founder-only, server-synchronized overview of EcomOS. All metrics are computed by protected database RPCs—no tenant data is exposed through a normal browser query."
      action={<RefreshButton onClick={() => void load()} loading={loading} />}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active users" value={data.active_users.toLocaleString()} detail={`${data.users.toLocaleString()} total accounts`} icon={Users} />
      <MetricCard label="Workspaces" value={data.active_workspaces.toLocaleString()} detail={`${data.workspaces.toLocaleString()} total workspaces`} icon={Warehouse} tone="violet" />
      <MetricCard label="Orders today" value={data.orders_today.toLocaleString()} detail={`${data.orders_month.toLocaleString()} this month`} icon={ShoppingCart} tone="green" />
      <MetricCard label="Open support" value={data.open_tickets.toLocaleString()} detail="Tickets requiring attention" icon={CircleHelp} tone={data.open_tickets ? "amber" : "green"} />
    </section>

    <section className="mt-6 grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
      <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">Commercial pulse</p><p className="mt-1 text-sm text-ink-muted">Month-to-date platform activity.</p></div><Link to="/admin/orders" className="text-sm font-semibold text-brand-accent hover:underline">View global orders</Link></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-base-raised p-4"><p className="text-xs text-ink-faint">Revenue this month</p><p className="mt-2 text-xl font-bold">{currency.format(Number(data.revenue_month || 0))}</p></div>
          <div className="rounded-lg bg-base-raised p-4"><p className="text-xs text-ink-faint">Products</p><p className="mt-2 text-xl font-bold">{data.products.toLocaleString()}</p></div>
          <div className="rounded-lg bg-base-raised p-4"><p className="text-xs text-ink-faint">Tools providers online</p><p className="mt-2 text-xl font-bold">{data.enabled_tool_providers.toLocaleString()}</p></div>
        </div>
      </article>
      <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div><p className="text-sm font-bold">Founder activity</p><p className="mt-1 text-sm text-ink-muted">Sensitive actions are audit logged.</p></div><div className="mt-4 space-y-3">{data.recent_events.length ? data.recent_events.map((event) => <EventLine key={event.id} event={event} />) : <p className="py-5 text-center text-sm text-ink-muted">No founder actions have been recorded yet.</p>}</div></article>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-3">
      <QuickLink to="/admin/users" title="Manage accounts" copy="Activate or suspend users with a mandatory audit reason." icon={Users} />
      <QuickLink to="/admin/support" title="Support Mode" copy="Start a time-limited, fully audited workspace support session." icon={ShieldCheck} />
      <QuickLink to="/admin/ai-tools" title="AI & Tools" copy="Manage the shared provider pool and Landing Page AI library." icon={Sparkles} />
    </section>
  </div>;
}
