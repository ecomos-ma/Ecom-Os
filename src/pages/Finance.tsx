import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Loader2, PackageCheck, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { FinanceProvider, useFinance } from "../contexts/FinanceContext";

const money = (value: number) => `${Math.round(value || 0).toLocaleString("fr-MA")} DH`;
const pct = (value: number) => `${Number(value || 0).toFixed(0)}%`;

function Metric({ label, value, tone = "text-ink", note }: { label: string; value: number; tone?: string; note?: string }) {
  return <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-ink-faint">{label}</p><p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{money(value)}</p>{note && <p className="mt-1 text-[11px] text-ink-muted">{note}</p>}</div>;
}

function FinanceDashboard() {
  const { revenue, cashFlow, health, forecast, reinvestment, alerts, payouts, transactions, loading, deliveryRate, returnRate, totalShippingCost, averageShippingCost, refetchTransactions, refetchPayouts, updatePayoutStatus } = useFinance();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refetchTransactions(), refetchPayouts()]); } finally { setRefreshing(false); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;

  return <div className="pb-12">
    <PageHeader title="Finance" subtitle="Your cash, delivered revenue, expenses and shipping position from the data already in Ecom OS." action={<button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-base-raised disabled:opacity-50"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />Refresh</button>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Delivered revenue" value={revenue.delivered} tone="text-emerald-600" note="Completed deliveries" />
      <Metric label="Money in transit" value={revenue.pending} tone="text-sky-600" note="Confirmed and shipping orders" />
      <Metric label="Expected income" value={revenue.expected} tone="text-brand" note={`Based on ${pct(deliveryRate)} delivery rate`} />
      <Metric label="Cash flow" value={cashFlow.net} tone={cashFlow.net >= 0 ? "text-emerald-600" : "text-danger"} note="Revenue less recorded expenses" />
      <Metric label="Pending payouts" value={payouts.filter((p) => p.status === "pending").reduce((sum, payout) => sum + Number(payout.amount || 0), 0)} tone="text-amber-600" note="Awaiting shipping settlement" />
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card"><div className="flex items-center gap-2"><WalletCards size={18} className="text-brand" /><div><h2 className="font-bold text-ink">Cash position</h2><p className="text-sm text-ink-muted">A simple view of realized cash and operational commitments.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Total in" value={cashFlow.totalIn} tone="text-emerald-600" /><Metric label="Recorded expenses" value={cashFlow.totalOut} tone="text-danger" /><Metric label="Daily burn" value={cashFlow.dailyBurn} tone="text-amber-600" /></div><div className="mt-5 grid gap-3 rounded-xl bg-base-raised p-4 sm:grid-cols-3"><div><p className="text-[11px] text-ink-muted">Delivery rate</p><p className="mt-1 text-lg font-bold text-ink">{pct(deliveryRate)}</p></div><div><p className="text-[11px] text-ink-muted">Return / refusal rate</p><p className="mt-1 text-lg font-bold text-ink">{pct(returnRate)}</p></div><div><p className="text-[11px] text-ink-muted">Cash runway</p><p className="mt-1 text-lg font-bold text-ink">{cashFlow.cashRunwayDays >= 999 ? "No burn recorded" : `${cashFlow.cashRunwayDays} days`}</p></div></div></div>
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card"><div className="flex items-center gap-2"><TrendingUp size={18} className="text-brand" /><h2 className="font-bold text-ink">Next 7 days</h2></div><div className="mt-5 space-y-4"><div><p className="text-sm text-ink-muted">Expected revenue</p><p className="mt-1 text-2xl font-bold text-emerald-600">{money(forecast.expectedRevenue)}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-base-raised p-3"><p className="text-[11px] text-ink-muted">Expected deliveries</p><p className="mt-1 font-bold text-ink">{forecast.expectedDeliveries}</p></div><div className="rounded-lg bg-base-raised p-3"><p className="text-[11px] text-ink-muted">Confidence</p><p className="mt-1 font-bold text-ink">{pct(forecast.confidenceScore)}</p></div></div><p className="text-xs leading-5 text-ink-muted">Projected from the orders and recorded expenses currently available in this workspace.</p></div></div>
    </section>

    <section className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card"><div className="flex items-center gap-2"><PackageCheck size={18} className="text-brand" /><div><h2 className="font-bold text-ink">Shipping costs</h2><p className="text-sm text-ink-muted">Taken from delivered Orders with a shipping cost.</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Total shipping" value={totalShippingCost} /><Metric label="Average / delivered order" value={averageShippingCost} /></div></div>
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card"><div className="flex items-center gap-2"><CircleDollarSign size={18} className="text-brand" /><div><h2 className="font-bold text-ink">Safe to reinvest</h2><p className="text-sm text-ink-muted">Keeps a 20% cash buffer and upcoming-expense allowance.</p></div></div><div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-[11px] text-ink-muted">Available</p><p className="mt-1 font-bold text-ink">{money(reinvestment.availableCash)}</p></div><div><p className="text-[11px] text-ink-muted">Locked</p><p className="mt-1 font-bold text-amber-600">{money(reinvestment.lockedCash)}</p></div><div><p className="text-[11px] text-ink-muted">Safe now</p><p className="mt-1 font-bold text-emerald-600">{money(reinvestment.safeReinvestment)}</p></div></div></div>
    </section>

    <section className="mt-5 rounded-xl border border-base-border bg-base-surface p-5 shadow-card"><div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-brand" /><div><h2 className="font-bold text-ink">Business health</h2><p className="text-sm text-ink-muted">Score {health.score}/100 · Grade {health.grade}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{health.factors.map((factor) => <div key={factor.name} className="rounded-lg bg-base-raised p-3"><p className="text-[11px] text-ink-muted">{factor.name}</p><p className="mt-1 font-bold text-ink">{factor.label}</p></div>)}</div></section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center gap-2 border-b border-base-border p-5"><AlertTriangle size={18} className="text-amber-600" /><h2 className="font-bold text-ink">Alerts</h2></div><div className="divide-y divide-base-border">{alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className="p-4"><p className="text-sm font-semibold text-ink">{alert.title}</p><p className="mt-1 text-sm text-ink-muted">{alert.message}</p></div>)}</div></div>
      <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center gap-2 border-b border-base-border p-5"><PackageCheck size={18} className="text-brand" /><h2 className="font-bold text-ink">Shipping payouts</h2></div>{payouts.length === 0 ? <div className="py-8"><EmptyState title="No shipping payouts yet" description="Payouts from shipping providers will appear here once recorded." compact /></div> : <div className="divide-y divide-base-border">{payouts.map((payout: any) => <div key={payout.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-ink">{payout.shipping_company || "Shipping provider"}</p><p className="mt-1 text-xs text-ink-muted">{money(payout.amount)} · {payout.status}</p></div>{payout.status === "pending" && <button onClick={() => void updatePayoutStatus(payout.id, "received")} className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-brand hover:bg-base-raised">Mark received</button>}</div>)}</div>}</div>
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="border-b border-base-border p-5"><h2 className="font-bold text-ink">Recent transactions</h2><p className="text-sm text-ink-muted">Income and expenses recorded in the existing finance ledger.</p></div>{transactions.length === 0 ? <div className="py-8"><EmptyState title="No transactions recorded yet" description="Income and expenses will appear here." compact /></div> : <div className="divide-y divide-base-border">{transactions.slice(0, 12).map((transaction, index) => <div key={`${transaction.date}-${index}`} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-ink">{transaction.category || transaction.type}</p><p className="mt-1 text-xs text-ink-muted">{transaction.date}</p></div><p className={`font-semibold ${transaction.type === "income" ? "text-emerald-600" : "text-danger"}`}>{transaction.type === "income" ? "+" : "−"}{money(transaction.amount)}</p></div>)}</div>}</section>
  </div>;
}

export default function Finance() {
  return <FinanceProvider><FinanceDashboard /></FinanceProvider>;
}
