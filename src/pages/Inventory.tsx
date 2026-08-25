import { useEffect, useState } from "react";
import { RefreshCw, Package, Truck, PackageCheck, AlertTriangle, BarChart3 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import type { Product } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

function mad(n: number) {
  return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

import { normalizeStatus } from '../utils/status';

// ─── Status helpers ───────────────────────────────────────────────────────────
// Use central normalizeStatus instead of local maps.

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductStock {
  product: Product;
  initialStock: number;
  outForDelivery: number;  // confirmed, shipped, out_for_delivery
  delivered: number;       // delivered orders
  returnedCancelled: number; // returned or cancelled - these are reinjected
  remaining: number;        // initial - (outForDelivery + delivered) + returnedCancelled
  isTemporary?: boolean;   // True for products created from orders (not in DB yet)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const { workspace } = useAuth();
  const [stocks, setStocks] = useState<ProductStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [stockValues, setStockValues] = useState<Record<string, number>>({});

  const load = async () => {
    if (!workspace?.id) return;
    setLoading(true);

    console.log('[Inventory] Fetching orders for workspace_id:', workspace.id);

    // Fetch all orders with SKU and status for this workspace
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("sku, product_variant, status, shipping_status, delivery_status, quantity")
      .eq("workspace_id", workspace.id);

    console.log('[Inventory] Orders query result:', {
      error: ordersError,
      count: ordersData?.length || 0
    });

    if (ordersError || !ordersData) {
      console.error('[Inventory] Error fetching orders:', ordersError);
      setStocks([]);
      setLoading(false);
      return;
    }

    // Group orders by SKU (or by variant for N/A cases)
    const orderGroups = new Map<string, { sku: string | null; variant: string | null; orders: any[] }>();

    ordersData.forEach((order) => {
      const sku = order.sku;
      const variant = order.product_variant;

      // For N/A SKUs, use variant as key
      const key = (sku === "N/A" || !sku) && variant ? `variant::${variant}` : (sku || "unknown");

      if (!orderGroups.has(key)) {
        orderGroups.set(key, { sku, variant, orders: [] });
      }
      orderGroups.get(key)!.orders.push(order);
    });

    console.log('[Inventory] Order groups created:', orderGroups.size);
    console.log('[Inventory] Group keys:', Array.from(orderGroups.keys()));

    // Get existing products from products table
    const { data: existingProducts, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("workspace_id", workspace.id);

    console.log('[Inventory] Existing products:', {
      error: productsError,
      count: existingProducts?.length || 0
    });

    const productsMap = new Map((existingProducts ?? []).map((p: Product) => [p.sku, p]));

    // Create products for missing SKUs
    for (const [key, group] of orderGroups) {
      const { sku, variant } = group;

      // Skip if SKU is N/A (we'll handle these separately in display)
      if (sku === "N/A" || !sku) continue;

      if (!productsMap.has(sku)) {
        console.log('[Inventory] Creating product for SKU:', sku);

        const { error: insertError } = await supabase
          .from("products")
          .insert({
            workspace_id: workspace.id,
            name: variant || sku,
            sku: sku,
            cost: 0,
            price: 0,
            stock: 0, // Default initial stock
            low_stock_threshold: 5,
            status: "active"
          });

        if (insertError) {
          console.error('[Inventory] Error creating product for SKU:', sku, insertError);
        } else {
          // Create a temporary product object for display
          productsMap.set(sku, {
            id: `temp-${sku}`,
            workspace_id: workspace.id,
            name: variant || sku,
            sku: sku,
            cost: 0,
            price: 0,
            stock: 0,
            low_stock_threshold: 5,
            status: "active",
            created_at: new Date().toISOString()
          } as Product);
        }
      }
    }

    // Calculate stock for each product
    const result: ProductStock[] = [];

    for (const [key, group] of orderGroups) {
      const { sku, variant, orders } = group;

      // Calculate quantities by status
      let outForDeliveryCount = 0;
      let deliveredCount = 0;
      let returnedCancelledCount = 0;

      orders.forEach((order) => {
        const quantity = Number(order.quantity) || 1;
        const internalStatus = normalizeStatus(order.shipping_status || order.delivery_status);

        if (internalStatus === 'OUT_FOR_DELIVERY') {
          outForDeliveryCount += quantity;
        } else if (internalStatus === 'DELIVERED') {
          deliveredCount += quantity;
        } else if (internalStatus === 'COMING_BACK') {
          returnedCancelledCount += quantity;
        }
      });

      // Get product from map or create temporary one
      let product: Product;
      let initialStock = 0;

      if (sku && sku !== "N/A" && productsMap.has(sku)) {
        product = productsMap.get(sku)!;
        initialStock = product.stock;
      } else {
        // For N/A or missing SKUs, create temporary product
        const displayName = (sku === "N/A" || !sku) ? variant || "Unknown" : sku;
        product = {
          id: `temp-${key}`,
          workspace_id: workspace.id,
          name: displayName,
          sku: sku === "N/A" ? null : sku,
          cost: 0,
          price: 0,
          stock: 0,
          low_stock_threshold: 5,
          status: "active",
          created_at: new Date().toISOString()
        } as Product;
        initialStock = 0;
      }

      const remaining = Math.max(0, initialStock - (outForDeliveryCount + deliveredCount) - returnedCancelledCount);

      const isTemporary = !sku || sku === "N/A" || !productsMap.has(sku);

      result.push({
        product,
        initialStock,
        outForDelivery: outForDeliveryCount,
        delivered: deliveredCount,
        returnedCancelled: returnedCancelledCount,
        remaining,
        isTemporary,
      });
    }

    console.log('[Inventory] Final stock calculation:', result.length, 'products');
    setStocks(result);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, [workspace?.id]);

  const handleStockChange = async (sku: string | null, newValue: number) => {
    if (!sku || sku === "N/A") return; // Can't edit temporary products

    setStockValues(prev => ({ ...prev, [sku]: newValue }));

    if (!workspace?.id) return;

    const { error } = await supabase
      .from("products")
      .update({ stock: newValue })
      .eq("sku", sku)
      .eq("workspace_id", workspace.id);

    if (error) {
      console.error('[Inventory] Error updating stock:', error);
    } else {
      // Reload to reflect changes
      load();
    }
  };

  const startEditingStock = (sku: string | null, currentValue: number) => {
    if (!sku || sku === "N/A") return;
    setEditingStock(sku);
    setStockValues(prev => ({ ...prev, [sku]: currentValue }));
  };

  const saveStock = (sku: string | null) => {
    if (!sku) return;
    const newValue = stockValues[sku];
    handleStockChange(sku, newValue);
    setEditingStock(null);
  };

  const cancelStockEdit = (sku: string | null) => {
    setEditingStock(null);
  };

  const totalInitial = stocks.reduce((s, r) => s + r.initialStock, 0);
  const totalRemaining = stocks.reduce((s, r) => s + r.remaining, 0);
  const totalOutForDelivery = stocks.reduce((s, r) => s + r.outForDelivery, 0);
  const lowStockCount = stocks.filter((r) => r.remaining <= Math.ceil(r.initialStock * 0.1)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        subtitle="Real-time stock calculated from all confirmed and shipped orders."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-[13px] text-ink hover:bg-base-surface transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 max-md:grid-cols-2 md:grid-cols-4 gap-3 max-md:gap-4">
        <div className="max-md:col-span-2">
          <SummaryCard
            icon={<Package size={16} className="text-blue-400" />}
            label="Total Initial Stock"
            value={totalInitial.toString()}
            color="border-blue-500/20"
          />
        </div>
        <SummaryCard
          icon={<BarChart3 size={16} className="text-emerald-400" />}
          label="Remaining"
          value={totalRemaining.toString()}
          color="border-emerald-500/20"
          highlight={totalRemaining < totalInitial * 0.2 ? "text-red-400" : "text-emerald-400"}
        />
        <SummaryCard
          icon={<Truck size={16} className="text-amber-400" />}
          label="Out for Delivery"
          value={totalOutForDelivery.toString()}
          color="border-amber-500/20"
        />
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-400">
          <AlertTriangle size={15} />
          <span>
            <strong>{lowStockCount}</strong> product{lowStockCount > 1 ? "s" : ""} in low stock (≤ 10% of initial stock)
          </span>
        </div>
      )}

      {/* Stock Table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-base-border text-left text-[12px] text-ink-muted">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium text-right">Initial Stock</th>
              <th className="px-4 py-3 font-medium text-right">Out for Delivery</th>
              <th className="px-4 py-3 font-medium text-right">Delivered</th>
              <th className="px-4 py-3 font-medium text-right">Returned/Cancelled</th>
              <th className="px-4 py-3 font-medium text-right">Remaining Stock</th>
              <th className="px-4 py-3 font-medium">Bar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-ink-muted">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 opacity-40" />
                  Calculating…
                </td>
              </tr>
            ) : stocks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-ink-muted">
                  <Package size={28} className="mx-auto mb-3 opacity-25" />
                  <div className="text-[13px] font-medium text-ink mb-1">No products found</div>
                  <div className="text-[12px]">Add products from the Products page.</div>
                </td>
              </tr>
            ) : (
              stocks.map(({ product: p, initialStock, outForDelivery, delivered, returnedCancelled, remaining, isTemporary }) => {
                const pct = initialStock > 0 ? (remaining / initialStock) * 100 : 0;
                const isLow = pct < 20;
                const isMedium = pct >= 20 && pct <= 50;
                const isEditing = editingStock === p.sku;
                const currentValue = stockValues[p.sku ?? ""] ?? initialStock;

                return (
                  <tr key={p.id} className="border-b border-base-border last:border-0 hover:bg-base-raised/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-[11.5px] text-ink-faint">
                        {isTemporary && <span className="text-amber-400">• Auto-created from orders</span>}
                        {!isTemporary && <span>Cost: {mad(p.cost)}  •  Price: {mad(p.price)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sky-400 text-[12px]">
                      {p.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isTemporary ? (
                        <span className="font-mono text-ink-faint">{initialStock}</span>
                      ) : isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            value={currentValue}
                            onChange={(e) => setStockValues(prev => ({ ...prev, [p.sku || ""]: parseInt(e.target.value) || 0 }))}
                            className="w-16 px-2 py-1 text-right border border-base-border rounded bg-base-surface font-mono text-[13px]"
                            autoFocus
                          />
                          <button
                            onClick={() => saveStock(p.sku)}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => cancelStockEdit(p.sku)}
                            className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingStock(p.sku, initialStock)}
                          className="font-mono text-ink-muted hover:text-brand hover:underline cursor-pointer"
                        >
                          {initialStock}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {outForDelivery > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                          <Truck size={10} />
                          {outForDelivery}
                        </span>
                      ) : (
                        <span className="font-mono text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {delivered > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
                          <PackageCheck size={10} />
                          {delivered}
                        </span>
                      ) : (
                        <span className="font-mono text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {returnedCancelled > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 text-[11px] font-medium">
                          +{returnedCancelled}
                        </span>
                      ) : (
                        <span className="font-mono text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold text-[14px]
                        ${isLow ? "text-red-400" : isMedium ? "text-amber-400" : "text-emerald-400"}`}>
                        {remaining}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[100px]">
                      <div className="h-1.5 w-full rounded-full bg-base-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all
                            ${isLow ? "bg-red-500" : isMedium ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="text-[10.5px] text-ink-faint mt-0.5 text-right">{pct.toFixed(0)}%</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {stocks.length > 0 && (
          <div className="border-t border-base-border px-4 py-2.5 text-[11px] text-ink-faint">
            Last update: {lastRefresh.toLocaleTimeString("en-US")} •
            Remaining = Initial − (Out for Delivery + Delivered + Returned/Cancelled)
          </div>
        )}
      </div>

      {/* Mobile view */}
      <div className="md:hidden flex flex-col gap-3 pb-8">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-4 w-32 bg-base-raised rounded mb-2" />
                  <div className="h-3 w-20 bg-base-raised rounded" />
                </div>
                <div className="h-8 w-12 bg-base-raised rounded-full" />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="h-4 w-20 bg-base-raised rounded" />
                <div className="h-4 w-16 bg-base-raised rounded" />
              </div>
              <div className="h-2 w-full bg-base-raised rounded-full" />
            </div>
          ))
        ) : stocks.length === 0 ? (
          <div className="py-14 text-center text-ink-muted">
            <Package size={32} className="mx-auto mb-3 opacity-25" />
            <div className="text-[15px] font-semibold text-ink mb-1">No products found</div>
          </div>
        ) : (
          stocks.map(({ product: p, initialStock, outForDelivery, delivered, returnedCancelled, remaining, isTemporary }) => {
            const pct = initialStock > 0 ? (remaining / initialStock) * 100 : 0;
            const isLow = pct < 20;
            const isMedium = pct >= 20 && pct <= 50;
            const isEditing = editingStock === p.sku;
            const currentValue = stockValues[p.sku ?? ""] ?? initialStock;

            return (
              <div key={p.id} className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 pr-2">
                    <div className="text-[16px] font-bold text-ink mb-0.5">{p.name}</div>
                    <div className="text-[13px] text-sky-400 font-mono">{p.sku ?? "No SKU"}</div>
                    {isTemporary && <div className="text-[11px] text-amber-400 mt-1">Auto-created from orders</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-ink-muted mb-0.5 uppercase tracking-wide">Remaining</div>
                    <div className={`font-mono text-[22px] font-bold tracking-tight ${isLow ? "text-red-400" : isMedium ? "text-amber-400" : "text-emerald-400"}`}>
                      {remaining}
                    </div>
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-base-raised/50 overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all ${isLow ? "bg-red-500" : isMedium ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 bg-base-raised/30 rounded-xl p-3">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Initial</div>
                    {isTemporary ? (
                      <div className="font-mono text-[14px] font-bold text-ink">{initialStock}</div>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={currentValue}
                          onChange={(e) => setStockValues(prev => ({ ...prev, [p.sku || ""]: parseInt(e.target.value) || 0 }))}
                          className="w-20 px-2 py-1 text-right border border-base-border rounded bg-base-surface font-mono text-[14px]"
                          autoFocus
                        />
                        <button
                          onClick={() => saveStock(p.sku)}
                          className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded text-[12px]"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditingStock(p.sku, initialStock)}
                        className="font-mono text-[14px] font-bold text-ink hover:text-brand hover:underline cursor-pointer"
                      >
                        {initialStock}
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Out for delivery</div>
                    <div className="font-mono text-[14px] font-bold text-amber-400 flex items-center gap-1.5">
                      <Truck size={12} /> {outForDelivery}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Delivered</div>
                    <div className="font-mono text-[14px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <PackageCheck size={12} /> {delivered}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Returned/Cancelled</div>
                    <div className="font-mono text-[14px] font-bold text-blue-400">+{returnedCancelled}</div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  highlight?: string;
}) {
  return (
    <div className={`rounded-xl border ${color} bg-base-surface p-4 shadow-card max-md:p-5 max-md:rounded-2xl max-md:bg-base-surface/60 max-md:backdrop-blur-xl max-md:shadow-lg max-md:border-none`}>
      <div className="flex items-center gap-2 mb-2 text-[12px] max-md:text-[13px] text-ink-muted">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-[22px] max-md:text-[28px] max-md:tracking-tight font-bold ${highlight ?? "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}
