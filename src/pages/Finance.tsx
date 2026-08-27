import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Lock, Truck, BarChart2,
  Zap, AlertTriangle, CheckCircle2, ArrowRight, Plus, X, Loader2,
  Bot, Target, Activity, RefreshCcw, ChevronDown, Info, DollarSign,
  ShoppingBag, Users, Package, Star,
} from "lucide-react";
import { FinanceProvider, useFinance } from "../contexts/FinanceContext";
import { useTheme, THEME_COLORS } from "../hooks/useTheme";
import { groupByPeriod } from "../lib/financeEngine";
import { useOrders } from "../hooks/useOrders";
import { toast } from "../components/Toast";

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmt(v: number) {
  return `${Math.round(v).toLocaleString("fr-MA")} MAD`;
}
function pct(v: number) {
  return `${Math.round(v)}%`;
}

// ── EXPENSE CATEGORIES ─────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  "Marketing", "Stock", "Packaging", "Shipping", "Employees",
  "Software", "Warehouse", "Office", "Education", "Tools", "Miscellaneous",
];
const CHART_COLORS = ["#8B5CF6", "#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899", "#F97316"];

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, trend, color = "brand", icon,
}: {
  label: string; value: string; sub?: string;
  trend?: "up" | "down" | "neutral"; color?: string; icon: React.ReactNode;
}) {
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-ink-muted";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  return (
    <div className="relative flex flex-col gap-3 rounded-[22px] border border-base-border bg-base-surface p-5 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-base-raised text-brand">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[11px] font-semibold ${trendColor}`}>
            <TrendIcon size={12} /> {sub}
          </div>
        )}
      </div>
      <div>
        <p className="text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">{label}</p>
        <p className="mt-0.5 text-[22px] font-bold tracking-tight text-ink">{value}</p>
        {sub && !trend && <p className="mt-0.5 text-[12px] text-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

// ── Money Journey ────────────────────────────────────────────────────────────
function MoneyJourney() {
  const { orders } = useOrders();
  const fin = useOrders();

  const ord = (orders ?? []).map((o) => ({
    total: o.total ?? 0,
    status: o.status ?? "",
  }));

  const steps = useMemo(() => {
    const all = ord.reduce((s, o) => s + o.total, 0);
    const confirmed = ord.filter((o) => ["confirmed", "scheduled"].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const shipped = ord.filter((o) => ["shipped", "out for delivery", "in_transit"].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const delivered = ord.filter((o) => ["delivered", "Livré", "Delivered"].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const returned = ord.filter((o) => ["returned", "refused", "retourné"].includes(o.status)).reduce((s, o) => s + o.total, 0);

    return [
      { label: "Gross Orders", amount: all, icon: <ShoppingBag size={16} />, color: "#8B5CF6" },
      { label: "Confirmed", amount: confirmed, icon: <CheckCircle2 size={16} />, color: "#3B82F6" },
      { label: "In Transit", amount: shipped, icon: <Truck size={16} />, color: "#F59E0B" },
      { label: "Delivered", amount: delivered, icon: <Package size={16} />, color: "#10B981" },
      { label: "Returned", amount: returned, icon: <TrendingDown size={16} />, color: "#EF4444" },
    ];
  }, [ord]);

  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Activity size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">Money Journey</h3>
        <span className="ml-auto text-[11px] text-ink-muted">Order value flow</span>
      </div>
      <div className="flex items-start gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex min-w-[120px] flex-col items-center gap-2 rounded-xl border border-base-border/60 bg-base-raised/40 px-4 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${step.color}20`, color: step.color }}>
                {step.icon}
              </div>
              <p className="text-center text-[11px] font-semibold text-ink-muted">{step.label}</p>
              <p className="text-center text-[13px] font-bold text-ink">{step.amount > 0 ? fmt(step.amount) : "—"}</p>
              {/* Progress bar */}
              {steps[0].amount > 0 && (
                <div className="w-full rounded-full bg-base-border h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((step.amount / steps[0].amount) * 100, 100)}%`, backgroundColor: step.color }}
                  />
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={14} className="flex-shrink-0 text-ink-faint" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cash Flow Chart ────────────────────────────────────────────────────────────
function CashFlowChart() {
  const { orders } = useOrders();
  const { mode } = useTheme();
  const theme = THEME_COLORS[mode];
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");

  const ord = (orders ?? []).map((o) => ({
    total: o.total ?? 0,
    status: o.status ?? "",
    delivery_status: null,
    created_at: o.created_at ?? new Date().toISOString(),
  }));

  const data = useMemo(() => {
    const grouped = groupByPeriod(ord, period);
    return grouped.slice(-12);
  }, [ord, period]);

  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-brand" />
          <h3 className="text-[15px] font-bold text-ink">Revenue Timeline</h3>
        </div>
        <div className="flex rounded-xl border border-base-border bg-base-raised p-0.5 text-[12px]">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 font-medium capitalize transition-colors ${period === p ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: theme.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: theme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
            <Tooltip
              contentStyle={{ backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 14, fontSize: 12 }}
              formatter={(v: number | undefined) => [fmt(v || 0), "Revenue"]}
            />
            <Area type="monotone" dataKey="revenue" stroke="#8B5CF6" fill="url(#revGrad)" strokeWidth={2.5} dot={false} name="Revenue" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Expense Center ─────────────────────────────────────────────────────────────
function ExpenseCenter() {
  const { transactions, addTransaction } = useFinance();
  const { mode } = useTheme();
  const theme = THEME_COLORS[mode];
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ category: "Marketing", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions.filter((t) => t.type === "expense")) {
      const cat = t.category ?? "Other";
      map[cat] = (map[cat] ?? 0) + t.amount;
    }
    return Object.entries(map)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || isNaN(amount)) return;
    setSaving(true);
    await addTransaction({
      type: "expense",
      category: form.category,
      amount,
      status: "paid",
      date: new Date().toISOString().split("T")[0],
    });
    setSaving(false);
    setForm({ category: "Marketing", amount: "", notes: "" });
    setAddOpen(false);
    toast.success("Expense recorded");
  };

  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-brand" />
          <h3 className="text-[15px] font-bold text-ink">Expense Center</h3>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          <Plus size={13} /> Add Expense
        </button>
      </div>

      {byCategory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-ink-muted">
          <DollarSign size={32} className="mb-3 opacity-30" />
          <p className="text-[13px]">No expenses recorded. Add your first expense above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 14, fontSize: 12 }}
                  formatter={(v: number | undefined) => [fmt(v || 0)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {byCategory.slice(0, 6).map((item, i) => {
              const total = byCategory.reduce((s, b) => s + b.value, 0);
              return (
                <div key={item.category} className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-medium text-ink">{item.category}</span>
                      <span className="font-semibold text-ink">{fmt(item.value)}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-base-border">
                      <div className="h-1 rounded-full" style={{ width: `${(item.value / total) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-base-border/60 bg-base-raised/30 px-7 py-5">
              <div>
                <h2 className="text-[17px] font-bold text-ink">Add Expense</h2>
                <p className="text-[12.5px] text-ink-muted">Record a business expense</p>
              </div>
              <button onClick={() => setAddOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-4 px-7 py-6">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] text-ink focus:outline-none focus:border-brand/50"
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">Amount (MAD)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] text-ink focus:outline-none focus:border-brand/50"
                  placeholder="e.g. 5000"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full resize-none rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] text-ink focus:outline-none focus:border-brand/50"
                  placeholder="What was this for?"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-60">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Forecast Panel ─────────────────────────────────────────────────────────────
function ForecastPanel() {
  const { forecast, deliveryRate } = useFinance();
  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Target size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">7-Day Forecast</h3>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted">
          <Info size={11} /> {forecast.confidenceScore}% confidence
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Expected Revenue", value: fmt(forecast.expectedRevenue), icon: <TrendingUp size={14} />, color: "emerald" },
          { label: "Expected Profit", value: fmt(forecast.expectedProfit), icon: <Wallet size={14} />, color: "blue" },
          { label: "Expected Deliveries", value: `${forecast.expectedDeliveries} orders`, icon: <Package size={14} />, color: "purple" },
          { label: "Expected Returns", value: `${forecast.expectedReturns} orders`, icon: <TrendingDown size={14} />, color: "red" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-base-border/60 bg-base-raised/30 p-4">
            <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-${item.color}-500/15 text-${item.color}-500`}>
              {item.icon}
            </div>
            <p className="text-[11px] text-ink-muted">{item.label}</p>
            <p className="text-[15px] font-bold text-ink">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-brand/5 border border-brand/10 px-4 py-3">
        <p className="text-[12.5px] text-ink-muted">
          Based on your <strong className="text-ink">{deliveryRate}%</strong> historical delivery rate. Forecast accuracy improves with more order data.
        </p>
      </div>
    </div>
  );
}

// ── AI Digest ─────────────────────────────────────────────────────────────────
function AIDigestPanel() {
  const { aiDigest } = useFinance();
  const now = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Bot size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">AI Business Digest</h3>
        <span className="ml-auto text-[11px] text-ink-muted">{now}</span>
      </div>
      <div className="flex flex-col gap-3">
        {aiDigest.map((line, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-base-raised/40 px-4 py-3 text-[13px] text-ink-muted leading-relaxed">
            <Zap size={14} className="mt-0.5 flex-shrink-0 text-brand" />
            <p>{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Health Score ───────────────────────────────────────────────────────────────
function HealthScorePanel() {
  const { health } = useFinance();
  const gradeColor = health.grade === "A" ? "#10B981" : health.grade === "B" ? "#3B82F6" : health.grade === "C" ? "#F59E0B" : "#EF4444";
  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Star size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">Business Health</h3>
      </div>
      <div className="flex items-center gap-6 mb-6">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border-4" style={{ borderColor: gradeColor }}>
          <div className="text-center">
            <p className="text-[24px] font-black" style={{ color: gradeColor }}>{health.grade}</p>
          </div>
        </div>
        <div>
          <p className="text-[28px] font-black text-ink">{health.score}<span className="text-[14px] text-ink-muted font-normal">/100</span></p>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            {health.grade === "A" ? "Excellent business health" : health.grade === "B" ? "Good, keep improving" : health.grade === "C" ? "Some areas need attention" : "Needs immediate action"}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {health.factors.map((f) => (
          <div key={f.name}>
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span className="font-medium text-ink">{f.name}</span>
              <span className="text-ink-muted">{f.label} · {f.score}/{f.maxScore}</span>
            </div>
            <div className="h-1.5 rounded-full bg-base-border">
              <div
                className="h-1.5 rounded-full transition-all duration-700"
                style={{
                  width: `${(f.score / f.maxScore) * 100}%`,
                  backgroundColor: f.score >= f.maxScore * 0.7 ? "#10B981" : f.score >= f.maxScore * 0.4 ? "#F59E0B" : "#EF4444",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Smart Alerts ──────────────────────────────────────────────────────────────
function SmartAlertsPanel() {
  const { alerts } = useFinance();
  const iconMap = {
    danger: <AlertTriangle size={14} className="text-red-500" />,
    warning: <AlertTriangle size={14} className="text-amber-500" />,
    info: <CheckCircle2 size={14} className="text-emerald-500" />,
  };
  const bgMap = {
    danger: "bg-red-500/8 border-red-500/20",
    warning: "bg-amber-500/8 border-amber-500/20",
    info: "bg-emerald-500/8 border-emerald-500/20",
  };
  return (
    <div className="rounded-[22px] border border-base-border bg-base-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">Smart Alerts</h3>
        <span className="ml-auto rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">{alerts.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {alerts.map((alert, i) => (
          <div key={i} className={`flex gap-3 rounded-xl border p-3 ${bgMap[alert.type]}`}>
            <div className="mt-0.5 flex-shrink-0">{iconMap[alert.type]}</div>
            <div>
              <p className="text-[12.5px] font-semibold text-ink">{alert.title}</p>
              <p className="text-[12px] text-ink-muted mt-0.5">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reinvestment Center ───────────────────────────────────────────────────────
function ReinvestmentPanel() {
  const { reinvestment } = useFinance();
  return (
    <div className="rounded-[22px] border border-brand/20 bg-gradient-to-br from-brand/5 to-base-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <RefreshCcw size={16} className="text-brand" />
        <h3 className="text-[15px] font-bold text-ink">Reinvestment Center</h3>
      </div>
      <div className="mb-5">
        <p className="text-[12.5px] text-ink-muted mb-1">Safe to Reinvest</p>
        <p className="text-[32px] font-black text-brand">{fmt(reinvestment.safeReinvestment)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-base-surface border border-base-border p-4">
          <p className="text-[11px] text-ink-muted mb-1">💸 Ads Budget</p>
          <p className="text-[16px] font-bold text-ink">{fmt(reinvestment.recommendedAdsBudget)}</p>
        </div>
        <div className="rounded-xl bg-base-surface border border-base-border p-4">
          <p className="text-[11px] text-ink-muted mb-1">📦 Stock Budget</p>
          <p className="text-[16px] font-bold text-ink">{fmt(reinvestment.recommendedStockBudget)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex justify-between border-t border-base-border/50 pt-3">
          <span className="text-ink-muted">Cash Available</span>
          <span className="font-semibold text-ink">{fmt(reinvestment.availableCash)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Locked in Transit</span>
          <span className="font-semibold text-amber-500">{fmt(reinvestment.lockedCash)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">Upcoming Expenses</span>
          <span className="font-semibold text-red-500">{fmt(reinvestment.upcomingExpenses)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
function FinanceDashboard() {
  const { revenue, cashFlow, deliveryRate, returnRate, payouts, loading, totalShippingCost, averageShippingCost } = useFinance();
  const [tab, setTab] = useState<"overview" | "expenses" | "forecast" | "insights">("overview");

  const pendingPayout = payouts
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "expenses", label: "Expenses" },
    { key: "forecast", label: "Forecast" },
    { key: "insights", label: "Insights" },
  ] as const;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-muted gap-3">
        <Loader2 size={20} className="animate-spin text-brand" />
        <p className="text-[14px]">Loading your business data…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-black tracking-tight text-ink">Finance</h1>
          <p className="text-[14px] text-ink-muted">Business Control Center — everything you need to make smart decisions.</p>
        </div>
        <div className="flex rounded-xl border border-base-border bg-base-raised p-0.5 text-[12.5px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${tab === t.key ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top KPI Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Delivered Revenue" value={fmt(revenue.delivered)} icon={<TrendingUp size={16} />} trend="up" sub="Confirmed paid orders" />
        <KpiCard label="Money in Transit" value={fmt(revenue.pending)} icon={<Truck size={16} />} trend="neutral" sub="Shipped, awaiting delivery" />
        <KpiCard label="Expected Income" value={fmt(revenue.expected)} icon={<Target size={16} />} trend="neutral" sub={`Based on ${deliveryRate}% rate`} />
        <KpiCard label="Pending Payouts" value={fmt(pendingPayout)} icon={<Lock size={16} />} trend={pendingPayout > 200_000 ? "down" : "neutral"} sub="Owed by shipping cos." />
        <KpiCard label="Net Cash Flow" value={fmt(Math.max(cashFlow.net, 0))} icon={<Wallet size={16} />} trend={cashFlow.net > 0 ? "up" : "down"} sub="Revenue minus expenses" />
        <KpiCard label="Delivery Rate" value={pct(deliveryRate)} icon={<CheckCircle2 size={16} />} trend={deliveryRate >= 65 ? "up" : "down"} sub={`Return rate ${pct(returnRate)}`} />
      </div>

      {/* ── Shipping Cost Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <KpiCard 
          label="Total Shipping Cost" 
          value={fmt(totalShippingCost)} 
          icon={<Truck size={16} />} 
          trend="neutral" 
          sub="Sum of shipping costs for delivered orders" 
          color="blue"
        />
        <KpiCard 
          label="Average Shipping Cost" 
          value={fmt(averageShippingCost)} 
          icon={<Package size={16} />} 
          trend="neutral" 
          sub="Per delivered order" 
          color="purple"
        />
      </div>

      {/* ── Money Journey (always visible) ─────────────────────────────── */}
      <MoneyJourney />

      {/* ── Tab Content ────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <>
          <CashFlowChart />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ReinvestmentPanel />
            <SmartAlertsPanel />
          </div>
        </>
      )}

      {tab === "expenses" && (
        <ExpenseCenter />
      )}

      {tab === "forecast" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ForecastPanel />
          <AIDigestPanel />
        </div>
      )}

      {tab === "insights" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <HealthScorePanel />
          <SmartAlertsPanel />
        </div>
      )}
    </div>
  );
}

// ── Page Export ────────────────────────────────────────────────────────────────
export default function Finance() {
  return (
    <FinanceProvider>
      <FinanceDashboard />
    </FinanceProvider>
  );
}
