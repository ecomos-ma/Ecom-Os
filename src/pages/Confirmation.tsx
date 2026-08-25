import { Filter, RefreshCw, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { useConfirmationCRM, type ConfirmationQueue } from "../hooks/useConfirmationCRM";
import { getStatusLabel } from "../lib/statusEngine";
import { useI18n } from "../i18n";
import { ConfirmationMetrics } from "./confirmation/ConfirmationMetrics";
import { ConfirmationOrderDrawer } from "./confirmation/ConfirmationOrderDrawer";
import { ConfirmationOrdersTable } from "./confirmation/ConfirmationOrdersTable";
import type { ConfirmationOrder } from "./confirmation/types";

const queueOptions: Array<{ id: ConfirmationQueue; label: string }> = [
  { id: "all", label: "All orders" },
  { id: "my", label: "My queue" },
  { id: "unassigned", label: "Unassigned" },
  { id: "callback_due", label: "Callback due" },
  { id: "recent", label: "Recently added" },
];

export default function Confirmation() {
  const crm = useConfirmationCRM();
  const { language } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedOrder, setSelectedOrder] = useState<ConfirmationOrder | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestedOrderId = searchParams.get("order");

  const openOrder = (order: ConfirmationOrder) => {
    setSelectedOrder(order);
    void crm.openOrder(order);
  };

  useEffect(() => {
    if (!requestedOrderId) return;
    void crm.findOrder(requestedOrderId).then((order) => {
      if (order) openOrder(order);
      else toast.error("The requested order is not available in this workspace.");
    }).catch((error: any) => toast.error(error?.message || "Could not open the requested order."));
    setSearchParams({}, { replace: true });
  }, [requestedOrderId, crm.workspaceId]);

  const saveStatus = async (status: string) => {
    if (!selectedOrder) return;
    await crm.updateStatus(selectedOrder, status);
    setSelectedOrder((current) => current ? { ...current, status } : current);
  };

  const openRelatedOrder = (orderId: string) => {
    void crm.findOrder(orderId).then((order) => {
      if (order) openOrder(order);
      else toast.error("That historic order is no longer available in this workspace.");
    }).catch((error: any) => toast.error(error?.message || "Could not open the historic order."));
  };

  const saveAndNext = () => {
    if (!selectedOrder) return;
    const currentIndex = crm.orders.findIndex((order) => order.id === selectedOrder.id);
    const next = crm.orders[currentIndex + 1] || crm.orders[currentIndex - 1] || null;
    if (next) openOrder(next);
    else setSelectedOrder(null);
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Confirmation CRM"
        subtitle={crm.canManage ? "Live workspace view for your Moroccan COD confirmation team." : "Your focused confirmation queue and callback workspace."}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => void crm.refresh()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-brand/30 hover:text-ink"><RefreshCw size={14} /> Refresh</button>
          </div>
        }
      />

      <ConfirmationMetrics summary={crm.summary} loading={crm.loading} myView={!crm.canManage} />

      {crm.canManage && crm.agentMetrics.length > 0 && (
        <section className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand"><UsersRound size={14} /></span><div><h2 className="text-[13px] font-semibold text-ink">Confirmation team</h2><p className="text-[10.5px] text-ink-muted">Live workload and CRM activity for each agent.</p></div></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {crm.agentMetrics.map(({ agent, summary }) => {
              const rate = summary.totalOrders ? Math.round((Object.entries(summary.statusCounts).filter(([raw]) => raw.toLowerCase().includes("confirm")).reduce((total, [, count]) => total + Number(count), 0) / summary.totalOrders) * 100) : 0;
              return <div key={agent.id} className="rounded-xl bg-base-raised/65 p-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-brand/10 text-[10px] font-bold text-brand">{agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent.fullName.slice(0, 1).toUpperCase()}</span><span className="min-w-0 truncate text-[12px] font-semibold text-ink">{agent.fullName}</span></div><div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div><div className="font-mono text-[13px] font-bold text-ink">{summary.remainingOrders}</div><div className="text-[9.5px] text-ink-muted">Remaining</div></div><div><div className="font-mono text-[13px] font-bold text-emerald-500">{summary.confirmedToday}</div><div className="text-[9.5px] text-ink-muted">Today</div></div><div><div className="font-mono text-[13px] font-bold text-brand">{rate}%</div><div className="text-[9.5px] text-ink-muted">Rate</div></div></div></div>;
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => crm.setStatus("all")} className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${crm.status === "all" ? "bg-brand text-white shadow-sm" : "bg-base-raised text-ink-muted hover:text-ink"}`}>All <span className="ml-1 opacity-75">{crm.summary?.totalOrders ?? 0}</span></button>
          {crm.visibleStatusFilters.map(({ id, count }) => <button key={id} onClick={() => crm.setStatus(id)} className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${crm.status === id ? "bg-brand text-white shadow-sm" : "bg-base-raised text-ink-muted hover:text-ink"}`}>{getStatusLabel(id, language)} <span className="ml-1 opacity-75">{count}</span></button>)}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-base-border bg-base-surface p-2.5 shadow-sm">
          <div className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" /><input value={crm.searchInput} onChange={(event) => crm.setSearchInput(event.target.value)} placeholder="Search order, customer, phone, city, SKU…" className="h-9 w-full rounded-lg bg-base-raised pl-9 pr-3 text-[12px] text-ink placeholder:text-ink-faint outline-none ring-1 ring-transparent focus:ring-brand/35" /></div>
          <select value={crm.queue} onChange={(event) => crm.setQueue(event.target.value as ConfirmationQueue)} className="h-9 rounded-lg border border-base-border bg-base-raised px-2.5 text-[11.5px] font-medium text-ink outline-none focus:border-brand/40">{queueOptions.filter((option) => crm.canManage || !["unassigned", "recent"].includes(option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          <button onClick={() => setFiltersOpen((current) => !current)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors ${filtersOpen ? "border-brand/30 bg-brand/10 text-brand" : "border-base-border bg-base-raised text-ink-muted hover:text-ink"}`}><SlidersHorizontal size={13} /> Filters</button>
        </div>

        {filtersOpen && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-base-border bg-base-raised/45 p-3.5"><div><label className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">Date</label><select value={crm.datePreset} onChange={(event) => crm.setDatePreset(event.target.value as typeof crm.datePreset)} className="mt-1.5 h-9 rounded-lg border border-base-border bg-base-surface px-2.5 text-[11.5px] text-ink outline-none focus:border-brand/40"><option value="all">All time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="month">This month</option></select></div>{crm.canManage && <div><label className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">Assigned agent</label><select value={crm.assigneeId || ""} onChange={(event) => crm.setAssigneeId(event.target.value || null)} className="mt-1.5 h-9 min-w-[180px] rounded-lg border border-base-border bg-base-surface px-2.5 text-[11.5px] text-ink outline-none focus:border-brand/40"><option value="">All agents</option>{crm.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></div>}<div className="pb-0.5 text-[11px] text-ink-muted">{crm.total.toLocaleString()} matching order{crm.total === 1 ? "" : "s"}</div></div>}
      </section>

      {crm.error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4"><div className="flex items-center gap-2 text-[12.5px] font-semibold text-danger"><Filter size={15} /> Confirmation CRM needs attention</div><p className="mt-1 text-[11.5px] text-danger/85">{crm.error}</p><button onClick={() => void crm.refresh()} className="mt-3 rounded-lg bg-danger px-3 py-2 text-[11px] font-semibold text-white">Try again</button></div> : <><ConfirmationOrdersTable orders={crm.orders} loading={crm.loading} onOpen={openOrder} selectedId={selectedOrder?.id} />{crm.hasMore && <div className="flex justify-center"><button onClick={() => void crm.loadMore()} disabled={crm.loadingMore} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-[11.5px] font-semibold text-ink hover:border-brand/30 disabled:opacity-50">{crm.loadingMore && <RefreshCw size={13} className="animate-spin" />} {crm.loadingMore ? "Loading" : "Load more orders"}</button></div>}</>}

      {selectedOrder && crm.workspaceId && crm.userId && <ConfirmationOrderDrawer workspaceId={crm.workspaceId} userId={crm.userId} order={selectedOrder} agents={crm.agents} canManage={crm.canManage} language={language} onClose={() => setSelectedOrder(null)} onOrderSaved={crm.refresh} onSaveStatus={saveStatus} onOpenRelatedOrder={openRelatedOrder} onSaveAndNext={saveAndNext} />}
    </div>
  );
}
