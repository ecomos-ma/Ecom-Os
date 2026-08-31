import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Save,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { useCostRules } from "../hooks/useCostRules";
import { useAffiliateCosts } from "../hooks/useAffiliateCosts";
import { calculateWorkspaceProfit } from "../lib/metrics";
import type { BusinessCostModel } from "../lib/metrics";

// ── Helpers ───────────────────────────────────────────────────────────────────
function mad(n: number) {
  return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

function dateNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

const EXPENSE_CATEGORIES = [
  "Ad spend", "Livraison", "Fulfillment", "Confirmation",
  "Packaging", "Warehouse rent", "Salaries", "Other",
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  confirmed: "Per Confirmed Order",
  delivered: "Per Delivered Order",
  entered: "Per Lead / All Orders",
};

// ── Mode Card ─────────────────────────────────────────────────────────────────
function ModeCard({
  id, title, icon, description, active, onClick,
}: {
  id: BusinessCostModel; title: string; icon: React.ReactNode;
  description: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 min-w-[220px] text-left rounded-xl border-2 p-4 transition-all ${active
        ? "border-brand bg-brand/5 ring-1 ring-brand/30 shadow-sm"
        : "border-base-border bg-base-surface hover:border-brand/30 hover:bg-base-raised/40"
        }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`h-9 w-9 flex items-center justify-center rounded-lg ${active ? "bg-brand/15 text-brand" : "bg-base-raised text-ink-muted"}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className={`text-[13.5px] font-bold ${active ? "text-brand" : "text-ink"}`}>{title}</div>
          {active && (
            <div className="text-[10.5px] font-semibold text-brand/70 uppercase tracking-wide">Active</div>
          )}
        </div>
      </div>
      <p className="text-[12px] text-ink-muted leading-relaxed">{description}</p>
    </button>
  );
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className={`block h-[18px] w-8 rounded-full transition-colors ${checked ? "bg-brand/80" : "bg-base-border"}`} />
      <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-3.5" : "translate-x-0"}`} />
    </label>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const { workspace } = useAuth();
  const navigate = useNavigate();
  const { config, saveCostModel } = useBusinessConfig();
  const { rules, addRule, updateRule, deleteRule, toggleRule } = useCostRules();
  const { skuCosts, skuCostsList, upsertSkuCost, deleteSkuCost } = useAffiliateCosts();

  // ── Date range ──────────────────────────────────────────────────────────────
  const [rangeDays, setRangeDays] = useState(30);
  const startDate = useMemo(() => dateNDaysAgo(rangeDays), [rangeDays]);
  const endDate = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }, []);

  // ── Mode switching ──────────────────────────────────────────────────────────
  const [confirmMode, setConfirmMode] = useState<BusinessCostModel | null>(null);
  const [modeSaving, setModeSaving] = useState(false);

  const handleModeClick = (m: BusinessCostModel) => {
    if (m === config.businessCostModel) return;
    setConfirmMode(m);
  };
  const applyModeSwitch = async () => {
    if (!confirmMode) return;
    setModeSaving(true);
    await saveCostModel(confirmMode);
    setConfirmMode(null);
    setModeSaving(false);
  };

  // ── P&L state ───────────────────────────────────────────────────────────────
  const [pnl, setPnl] = useState({ revenue: 0, productCost: 0, shippingCost: 0, operationalFees: 0, feeBreakdown: [] as any[], adSpend: 0, netProfit: 0, warnings: [] as { message: string }[], oneOffExpenses: 0 });
  const [pnlLoading, setPnlLoading] = useState(true);
  const pnlKey = `${rangeDays}-${config.businessCostModel}`;

  // ── One-off expenses ────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showNew, setShowNew] = useState(false);



  // ── SKU cost modal ──────────────────────────────────────────────────────────
  const [showNewSku, setShowNewSku] = useState(false);

  // ── Fee modal ───────────────────────────────────────────────────────────────
  const [showNewRule, setShowNewRule] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);


  // ── Load one-off expenses ─────────────────────────────────────────────────
  const loadExpenses = () => {
    if (!workspace?.id) return;
    supabase
      .from("expenses")
      .select("*")
      .eq("workspace_id", workspace.id)
      .gte("date", startDate.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .then(({ data }) => setExpenses(data ?? []));
  };
  useEffect(loadExpenses, [rangeDays, workspace?.id]);

  // ── Compute P&L from orders ───────────────────────────────────────────────
  const computePnl = async () => {
    if (!workspace?.id) return;
    setPnlLoading(true);
    try {
      // Fetch orders in range
      const { data: ordersRaw } = await supabase
        .from("orders")
        .select("id, total, status, delivery_status, shipping_status, city, created_at, sku, shipping_cost, order_items(quantity, unit_price, sku, products(name, cost))")
        .eq("workspace_id", workspace.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      const orders = (ordersRaw ?? []) as any[];

      // Fetch ad spend from expenses table
      const { data: adExp } = await supabase
        .from("expenses")
        .select("amount")
        .eq("workspace_id", workspace.id)
        .eq("category", "Ad spend")
        .gte("date", startDate.toISOString().slice(0, 10));
      const adSpend = (adExp ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      // Build SKU cost map from products for seller mode
      const { data: products } = await supabase
        .from("products")
        .select("sku, cost")
        .eq("workspace_id", workspace.id);
      const skuCostMap = new Map<string, number>(
        (products ?? []).map((p: any) => [p.sku, Number(p.cost || 0)])
      );

      const isAffiliate = config.businessCostModel === "affiliate";
      const input = isAffiliate
        ? {
          mode: "affiliate" as const,
          orders,
          adSpend,
          skuCostMap: skuCosts,
          costRules: rules.filter((r) => r.enabled),
        }
        : {
          mode: "seller" as const,
          orders,
          adSpend,
          skuCostMap,
          costRules: rules.filter((r) => r.enabled),
        };

      const result = calculateWorkspaceProfit(input);

      // One-off expenses (excluding ad spend already counted)
      const { data: oneOffs } = await supabase
        .from("expenses")
        .select("amount, category")
        .eq("workspace_id", workspace.id)
        .neq("category", "Ad spend")
        .gte("date", startDate.toISOString().slice(0, 10));
      const oneOffTotal = (oneOffs ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      setPnl({
        revenue: result.revenue,
        productCost: result.productCost,
        shippingCost: result.shippingCost,
        operationalFees: result.operationalFees,
        feeBreakdown: result.feeBreakdown,
        adSpend,
        netProfit: result.netProfit - oneOffTotal,
        warnings: result.missingCostWarnings,
        oneOffExpenses: oneOffTotal,
      });
    } catch (err) {
      console.error("P&L compute error:", err);
    } finally {
      setPnlLoading(false);
    }
  };

  useEffect(() => { computePnl(); }, [pnlKey, workspace?.id, rules.length, skuCostsList.length]);

  const isAffiliate = config.businessCostModel === "affiliate";

  return (
    <div className="space-y-5 animate-fade-in-up pb-24 max-w-[1200px] mx-auto">
      {/* Header */}
      <PageHeader
        title="Expenses & Profit"
        subtitle="Configure your business mode, fees, and track your net profit."
        action={
          <div className="flex items-center gap-2">
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand/90"
            >
              <Plus size={13} /> New Expense
            </button>
          </div>
        }
      />

      {/* Business Mode Selector */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-xs p-5 space-y-3">
        <div className="text-[13px] font-semibold text-ink">Business Mode</div>
        <div className="flex flex-wrap gap-3">
          <ModeCard
            id="seller"
            title="Seller"
            icon={<Store size={18} />}
            description="You manage stock, fulfillment, and shipping. Shipping cost is resolved from your connected provider per city."
            active={config.businessCostModel === "seller"}
            onClick={() => handleModeClick("seller")}
          />
          <ModeCard
            id="affiliate"
            title="Affiliate Seller"
            icon={<ShoppingBag size={18} />}
            description="You work with a company that provides fixed service prices. All fees are configured below — no city-based shipping lookup."
            active={config.businessCostModel === "affiliate"}
            onClick={() => handleModeClick("affiliate")}
          />
        </div>
      </div>


      {/* Cost Setup - Seller Mode */}
      {!isAffiliate && (
        <div className="rounded-xl border border-base-border bg-base-surface shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-base-border bg-base-raised/20">
            <div>
              <div className="text-[13.5px] font-semibold text-ink flex items-center gap-2">
                <Settings size={14} className="text-brand" />
                Cost Setup
              </div>
              <div className="text-[12px] text-ink-muted mt-0.5">
                Configure your operational fees. Shipping is automatic per provider/city.
              </div>
            </div>
          </div>

          {/* Product cost info */}
          <div className="px-5 py-3.5 border-b border-base-border flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-ink flex items-center gap-1.5">
                <Package size={13} className="text-ink-muted" />
                Product Costs
              </div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">Managed per SKU in Inventory</div>
            </div>
            <button
              onClick={() => navigate("/products-inventory")}
              className="flex items-center gap-1 text-[12px] text-brand hover:underline"
            >
              Manage <ExternalLink size={12} />
            </button>
          </div>

          {/* Shipping info */}
          <div className="px-5 py-3.5 border-b border-base-border flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-medium text-ink">Shipping Costs</div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">
                Resolved automatically from shipping provider + customer city
              </div>
            </div>
            <button
              onClick={() => navigate("/shipping")}
              className="flex items-center gap-1 text-[12px] text-brand hover:underline"
            >
              Provider setup <ExternalLink size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Product Costs by SKU - Affiliate Mode Only */}
      {isAffiliate && (
        <div className="rounded-xl border border-base-border bg-base-surface shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-base-border bg-base-raised/10">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[13.5px] font-semibold text-ink flex items-center gap-2">
                  <Package size={14} className="text-brand" />
                  Product Costs by SKU
                </div>
                <div className="text-[12px] text-ink-muted mt-0.5">
                  Configure static product costs per SKU for Affiliate calculation.
                </div>
              </div>
              <button
                onClick={() => setShowNewSku(true)}
                className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised hover:bg-base-raised/80 px-3 py-1.5 text-[12px] font-medium"
              >
                <Plus size={13} /> Add Product Cost
              </button>
            </div>
            {skuCostsList.length === 0 ? (
              <div className="text-[12px] text-ink-muted py-6 text-center">
                No SKU product costs configured.
              </div>
            ) : (
              <div className="rounded-lg border border-base-border overflow-hidden mt-4">
                <div className="space-y-2 md:hidden">
                  {skuCostsList.map((item) => (
                    <div key={`${item.id}-mobile`} className="flex items-center gap-3 rounded-xl border border-base-border bg-base-raised/40 p-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-ink">{item.sku}</span>
                      <input type="number" step="0.01" aria-label={`Cost for ${item.sku}`} value={item.cost} onChange={(event) => upsertSkuCost(item.sku, Number(event.target.value))} className="h-11 w-28 rounded-xl border border-base-border bg-base-surface px-3 text-right font-mono" />
                      <button type="button" aria-label={`Delete ${item.sku}`} onClick={() => deleteSkuCost(item.id)} className="grid h-11 w-11 place-items-center rounded-xl text-danger"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
                <table className="hidden w-full text-[12.5px] md:table">
                  <thead>
                    <tr className="border-b border-base-border text-left text-[10.5px] uppercase tracking-wider text-ink-muted bg-base-raised/30">
                      <th className="px-3 py-2 font-medium">Product/SKU</th>
                      <th className="px-3 py-2 font-medium">Cost in MAD</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {skuCostsList.map((s) => (
                      <tr key={s.id} className="border-b border-base-border last:border-0 hover:bg-base-raised/40">
                        <td className="px-3 py-2 font-medium text-ink font-mono">{s.sku}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={s.cost}
                            onChange={(e) => upsertSkuCost(s.sku, Number(e.target.value))}
                            className="w-24 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-[12.5px] hover:border-base-border focus:border-brand focus:bg-base-surface focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => deleteSkuCost(s.id)} className="text-danger hover:bg-danger/10 p-1.5 rounded-md" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service / Operational Fees */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-base-border bg-base-raised/10">
          <div className="text-[13px] font-semibold text-ink">
            {isAffiliate ? "Service Fees" : "Operational Fees"}
          </div>
          <button
            onClick={() => setShowNewRule(true)}
            className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised hover:bg-base-raised/80 px-3 py-1.5 text-[12px] font-medium"
          >
            <Plus size={13} /> Add Fee
          </button>
        </div>

        <div className="space-y-2 p-3 md:hidden">
          {rules.map((rule) => (
            <article key={`${rule.id}-mobile`} className={`rounded-xl border border-base-border bg-base-raised/35 p-3 ${!rule.enabled ? "opacity-55" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{rule.name}</p><p className="mt-0.5 text-xs text-ink-muted">{TRIGGER_LABELS[rule.trigger] || rule.trigger}</p></div>
                <Toggle checked={rule.enabled} onChange={(value) => toggleRule(rule.id, value)} />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-base-border pt-3">
                <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Amount<input type="number" step="0.01" value={rule.amount} onChange={(event) => updateRule(rule.id, { amount: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-xl border border-base-border bg-base-surface px-3 font-mono text-base text-ink" /></label>
                <button type="button" aria-label={`Edit ${rule.name}`} onClick={() => setEditingRule(rule)} className="mt-4 grid h-11 w-11 place-items-center rounded-xl bg-base-surface text-brand"><Edit2 size={16} /></button>
                <button type="button" aria-label={`Delete ${rule.name}`} onClick={() => deleteRule(rule.id)} className="mt-4 grid h-11 w-11 place-items-center rounded-xl bg-danger/5 text-danger"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!rules.length && <p className="py-6 text-center text-sm text-ink-muted">No fees configured.</p>}
        </div>

        <table className="hidden w-full text-[12.5px] md:table">
          <thead>
            <tr className="border-b border-base-border text-left text-[10.5px] uppercase tracking-wider text-ink-muted">
              <th className="px-5 py-2.5 font-medium w-12">Status</th>
              <th className="px-5 py-2.5 font-medium">Fee Name</th>
              <th className="px-5 py-2.5 font-medium">Amount</th>
              <th className="px-5 py-2.5 font-medium">Apply On</th>
              <th className="px-5 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className={`border-b border-base-border last:border-0 hover:bg-base-raised/40 transition-opacity ${!rule.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-5 py-3">
                  <Toggle checked={rule.enabled} onChange={(v) => toggleRule(rule.id, v)} />
                </td>
                <td className="px-5 py-3 font-medium text-ink">{rule.name}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      value={rule.amount}
                      onChange={(e) => updateRule(rule.id, { amount: Number(e.target.value) })}
                      className="w-20 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-[12.5px] text-ink hover:border-base-border focus:border-brand focus:bg-base-surface focus:outline-none"
                    />
                    <span className="text-[12px] text-ink-muted">MAD</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={rule.trigger}
                    onChange={(e) => updateRule(rule.id, { trigger: e.target.value as any })}
                    className="rounded-md border border-base-border bg-base-raised px-2 py-1 text-[11.5px] text-ink-muted focus:outline-none focus:border-brand"
                  >
                    <option value="confirmed">Per Confirmed Order</option>
                    <option value="delivered">Per Delivered Order</option>
                    <option value="entered">Per Lead / All Orders</option>
                  </select>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-1.5 rounded-md text-danger hover:bg-danger/10"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[12.5px] text-ink-muted">
                  No fees configured. Click "Add Fee" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* One-off Expenses */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExpenses((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-3.5 border-b border-base-border hover:bg-base-raised/30 transition-colors"
        >
          <span className="text-[13.5px] font-semibold text-ink">
            One-off Expenses
            {expenses.length > 0 && (
              <span className="ml-1.5 font-mono text-[12px] text-ink-muted">
                — {mad(expenses.reduce((s, e) => s + Number(e.amount), 0))}
              </span>
            )}
          </span>
          {showExpenses ? <ChevronUp size={15} className="text-ink-muted" /> : <ChevronDown size={15} className="text-ink-muted" />}
        </button>

        {showExpenses && (
          <div>
            <div className="space-y-2 p-3 md:hidden">
              {expenses.map((expense) => (
                <article key={`${expense.id}-mobile`} className="rounded-xl border border-base-border bg-base-raised/35 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{expense.description || expense.category}</p><p className="mt-1 text-xs text-ink-muted">{new Date(expense.date).toLocaleDateString()} · {expense.category}</p></div><strong className="shrink-0 font-mono text-sm text-ink">{mad(expense.amount)}</strong></div>
                  <button type="button" onClick={async () => { await supabase.from("expenses").delete().eq("id", expense.id); loadExpenses(); computePnl(); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-danger/15 text-xs font-bold text-danger"><Trash2 size={14} /> Delete expense</button>
                </article>
              ))}
              {!expenses.length && <p className="py-6 text-center text-sm text-ink-muted">No one-off expenses in this period.</p>}
            </div>
            <table className="hidden w-full min-w-[500px] text-[12.5px] md:table">
              <thead>
                <tr className="border-b border-base-border text-left text-[10.5px] uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 font-medium">Description</th>
                  <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-5 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-base-border group hover:bg-base-raised/40">
                    <td className="px-5 py-3 text-ink-muted">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full border border-base-border bg-base-raised px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">{e.description ?? "—"}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-ink text-right">{mad(e.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={async () => {
                          await supabase.from("expenses").delete().eq("id", e.id);
                          loadExpenses();
                          computePnl();
                        }}
                        className="opacity-0 group-hover:opacity-100 text-danger hover:bg-danger/10 p-1.5 rounded-md"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[12.5px] text-ink-muted">
                      No one-off expenses recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {
        confirmMode && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmMode(null)} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-base-border bg-base-surface shadow-2xl p-6">
              <h2 className="text-[16px] font-bold text-ink mb-2">Switch to {confirmMode === "affiliate" ? "Affiliate Seller" : "Seller"} mode?</h2>
              <p className="text-[13px] text-ink-muted mb-5">
                Future calculations will use the new mode. Your historical orders, inventory, and expense records will not be deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmMode(null)}
                  className="flex-1 rounded-xl border border-base-border bg-base-raised py-2.5 text-[13px] font-semibold hover:bg-base-border/60"
                >
                  Cancel
                </button>
                <button
                  onClick={applyModeSwitch}
                  disabled={modeSaving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {modeSaving ? <Loader2 size={13} className="animate-spin" /> : null}
                  Confirm Switch
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        showNew && (
          <NewExpenseModal
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); loadExpenses(); computePnl(); }}
            workspaceId={workspace!.id}
          />
        )
      }

      {
        (showNewRule || editingRule) && (
          <FeeModal
            rule={editingRule}
            onClose={() => { setShowNewRule(false); setEditingRule(null); }}
            onSave={async (r) => {
              if (editingRule) {
                await updateRule(editingRule.id, r);
              } else {
                await addRule({ ...r, enabled: true });
              }
              setShowNewRule(false);
              setEditingRule(null);
              computePnl();
            }}
          />
        )
      }

      {
        showNewSku && (
          <SkuModal
            onClose={() => setShowNewSku(false)}
            onAdd={async (sku, cost) => { await upsertSkuCost(sku, cost); setShowNewSku(false); }}
          />
        )
      }
    </div >
  );
}

// ── New Expense Modal ────────────────────────────────────────────────────────────
function NewExpenseModal({ onClose, onCreated, workspaceId }: { onClose: () => void; onCreated: () => void; workspaceId: string }) {
  const [category, setCategory] = useState<string>("Ad spend");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await supabase.from("expenses").insert({ category, description, amount: Number(amount), date, workspace_id: workspaceId });
    setBusy(false);
    onCreated();
  };

  return (
    <Modal title="New Expense" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-1">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink">
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none" />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (MAD)" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:outline-none" />
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:outline-none" />
        </div>
        <button disabled={busy} type="submit" className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Add Expense
        </button>
      </form>
    </Modal>
  );
}

// ── Fee Modal (Add / Edit) ────────────────────────────────────────────────────
function FeeModal({ rule, onClose, onSave }: { rule: any; onClose: () => void; onSave: (r: any) => Promise<void> }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [amount, setAmount] = useState(String(rule?.amount ?? ""));
  const [trigger, setTrigger] = useState<"confirmed" | "delivered" | "entered">(rule?.trigger ?? "confirmed");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={rule ? "Edit Fee" : "Add Fee"} onClose={onClose}>
      <form
        onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave({ name, amount: Number(amount), trigger }); setSaving(false); }}
        className="flex flex-col gap-4 p-1"
      >
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Fee Name (e.g. Call Center)" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none" />
        <input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (MAD)" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand focus:outline-none" />
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as any)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:outline-none">
          <option value="confirmed">Per Confirmed Order</option>
          <option value="delivered">Per Delivered Order</option>
          <option value="entered">Per Lead / All Orders</option>
        </select>
        <button type="submit" disabled={saving} className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60">
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {rule ? "Save Changes" : "Create Fee"}
        </button>
      </form>
    </Modal>
  );
}

// ── SKU Modal ─────────────────────────────────────────────────────────────────
function SkuModal({ onClose, onAdd }: { onClose: () => void; onAdd: (sku: string, cost: number) => Promise<void> }) {
  const [sku, setSku] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Add SKU Cost Override" onClose={onClose}>
      <form
        onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onAdd(sku, Number(cost)); setSaving(false); }}
        className="flex flex-col gap-4 p-1"
      >
        <input required value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="SKU Code" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink font-mono focus:border-brand focus:outline-none uppercase" />
        <input required type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost in MAD" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand focus:outline-none" />
        <button type="submit" disabled={saving} className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60">
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          Save SKU Cost
        </button>
      </form>
    </Modal>
  );
}
