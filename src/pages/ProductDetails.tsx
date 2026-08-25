import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Package, Truck, ArrowLeft, RefreshCw, BarChart, ShoppingCart,
    DollarSign, Target, Activity, History, Settings, Copy, Check,
    Sliders, Edit2, TrendingUp, AlertTriangle, Layers, Warehouse
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { ProductModal } from "../components/products/ProductModal";
import { StockAdjustmentModal } from "../components/products/StockAdjustmentModal";
import { StatusBadge } from "../components/StatusBadge";
import { ShippingStatusBadge } from "../components/ShippingStatusBadge";

function mad(n: number | null | undefined) {
    if (n == null) return "0 MAD";
    return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

export default function ProductDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { workspace } = useAuth();

    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("overview");
    const [copiedSku, setCopiedSku] = useState(false);

    // Modals
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [stockModalOpen, setStockModalOpen] = useState(false);

    const loadProduct = async () => {
        if (!id || !workspace?.id) return;
        setLoading(true);
        const { data } = await supabase
            .from("products")
            .select("*")
            .eq("id", id)
            .eq("workspace_id", workspace.id)
            .single();

        setProduct(data);
        setLoading(false);
    };

    useEffect(() => {
        loadProduct();

        if (id && workspace?.id) {
            const channelId = `product-details-${id}-${Math.random()}`;
            const channel = supabase
                .channel(channelId)
                .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `id=eq.${id}` }, payload => {
                    setProduct(payload.new);
                })
                .subscribe();
            return () => { supabase.removeChannel(channel); };
        }
    }, [id, workspace?.id]);

    const copySku = () => {
        if (!product?.sku) return;
        navigator.clipboard.writeText(product.sku);
        setCopiedSku(true);
        setTimeout(() => setCopiedSku(false), 2000);
    };

    if (loading) {
        return (
            <div className="p-24 flex flex-col items-center justify-center gap-3 text-ink-muted">
                <RefreshCw className="animate-spin text-brand" size={24} />
                <span className="text-[13px]">Loading product specs...</span>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="p-16 text-center text-ink-muted flex flex-col items-center gap-3">
                <Package size={36} className="opacity-30" />
                <span className="text-lg font-bold text-ink">Product Not Found</span>
                <button onClick={() => navigate("/products-inventory")} className="text-brand hover:underline text-[13px]">
                    Back to Products & Inventory
                </button>
            </div>
        );
    }

    const tabs = [
        { id: "overview", label: "Overview", icon: Package },
        { id: "inventory", label: "Inventory Pipeline", icon: Truck },
        { id: "orders", label: "Order History", icon: ShoppingCart },
        { id: "finance", label: "Financials", icon: DollarSign },
        { id: "analytics", label: "Analytics", icon: Activity },
    ];

    return (
        <div className="min-h-screen bg-base-background pb-20">
            {editModalOpen && (
                <ProductModal
                    product={product}
                    onClose={() => setEditModalOpen(false)}
                    onSaved={() => { setEditModalOpen(false); loadProduct(); }}
                />
            )}

            {stockModalOpen && (
                <StockAdjustmentModal
                    product={product}
                    onClose={() => setStockModalOpen(false)}
                    onSaved={() => { setStockModalOpen(false); loadProduct(); }}
                />
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in-up space-y-6">

                {/* Top Navigation & Hero Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-surface border border-base-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate("/products-inventory")}
                            className="p-2.5 rounded-xl bg-base-raised border border-base-border hover:bg-base-border/50 text-ink transition-colors"
                        >
                            <ArrowLeft size={18} />
                        </button>

                        <div className="relative h-16 w-16 flex-none rounded-xl overflow-hidden border border-base-border bg-base-raised">
                            {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                    <Package size={24} className="text-brand/60" />
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">{product.name}</h1>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border uppercase ${
                                    product.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                }`}>
                                    {product.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-[12.5px] text-ink-muted mt-1 font-mono flex-wrap">
                                <button
                                    onClick={copySku}
                                    className="flex items-center gap-1 hover:text-brand transition-colors bg-base-raised px-2 py-0.5 rounded-md border border-base-border"
                                >
                                    <span>SKU: {product.sku || "No SKU"}</span>
                                    {copiedSku ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                </button>
                                <span>•</span>
                                <span>{product.category || "Uncategorized"}</span>
                                <span>•</span>
                                <span>{product.warehouse || "Main Warehouse"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Hero Action Buttons */}
                    <div className="flex items-center gap-2 self-start md:self-auto">
                        <button
                            onClick={() => setStockModalOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-brand/20 bg-brand/5 px-3.5 text-[13px] text-brand font-semibold hover:bg-brand/10 transition-colors"
                        >
                            <Sliders size={14} /> Adjust Stock
                        </button>
                        <button
                            onClick={() => setEditModalOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13px] text-white font-semibold shadow-md hover:bg-brand/90 transition-colors"
                        >
                            <Edit2 size={14} /> Edit Specs
                        </button>
                    </div>
                </div>

                {/* Tabs Header */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-base-border pb-px [scrollbar-width:none]">
                    {tabs.map(tab => {
                        const active = activeTab === tab.id;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${
                                    active
                                        ? "border-brand text-brand bg-brand/5 rounded-t-xl"
                                        : "border-transparent text-ink-muted hover:text-ink hover:bg-base-surface rounded-t-xl"
                                }`}
                            >
                                <TabIcon size={15} className={active ? "text-brand" : "text-ink-faint"} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content Panels */}
                <div className="mt-4">
                    {activeTab === "overview" && <TabOverview product={product} />}
                    {activeTab === "inventory" && <TabInventory product={product} />}
                    {activeTab === "orders" && <TabOrders product={product} />}
                    {activeTab === "finance" && <TabFinance product={product} />}
                    {activeTab === "analytics" && <TabAnalytics product={product} />}
                </div>
            </div>
        </div>
    );
}

// ── Tab 1: Overview Panel ─────────────────────────────────────────
function TabOverview({ product }: { product: any }) {
    const profit = (product.price || 0) - (product.cost || 0);
    const margin = product.price ? ((profit / product.price) * 100).toFixed(1) : "0.0";

    const initial = product.initial_stock ?? product.stock ?? 0;
    const physical = initial + (product.returned_stock || 0) + (product.manual_added_stock || 0) - (product.delivered_stock || 0) - (product.damaged_stock || 0) - (product.manual_removed_stock || 0) - (product.lost_stock || 0);
    const available = Math.max(0, physical - (product.reserved_stock || 0));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                {/* Financial Summary */}
                <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4 flex items-center gap-2">
                        <DollarSign size={16} className="text-brand" /> Financial Overview
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <MiniStat label="Purchase Cost" value={mad(product.cost)} />
                        <MiniStat label="Selling Price" value={mad(product.price)} />
                        <MiniStat label="Profit / Unit" value={mad(profit)} valueColor={profit >= 0 ? "text-emerald-500" : "text-red-500"} />
                        <MiniStat label="Margin" value={`${margin}%`} valueColor={Number(margin) >= 30 ? "text-emerald-500" : "text-ink"} />
                    </div>
                </div>

                {/* Stock Overview */}
                <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4 flex items-center gap-2">
                        <Truck size={16} className="text-brand" /> Inventory Overview
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <MiniStat label="Initial Units" value={initial} />
                        <MiniStat label="Available Stock" value={available} valueColor={available > (product.low_stock_threshold || 5) ? "text-emerald-500" : "text-red-500"} />
                        <MiniStat label="Reserved / Transit" value={product.reserved_stock || 0} valueColor="text-amber-500" />
                        <MiniStat label="Units Delivered" value={product.delivered_stock || 0} valueColor="text-sky-500" />
                    </div>
                </div>
            </div>

            {/* Right Column: Metadata */}
            <div className="space-y-6">
                <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4 flex items-center gap-2">
                        <Layers size={16} className="text-brand" /> Metadata & Specs
                    </h2>
                    <div className="space-y-3 text-[13px]">
                        <DetailRow label="Category" value={product.category || "—"} />
                        <DetailRow label="Supplier" value={product.supplier || "—"} />
                        <DetailRow label="Barcode" value={product.barcode || "—"} />
                        <DetailRow label="Warehouse" value={product.warehouse || "Main"} />
                        <DetailRow label="Low Stock Alert" value={`${product.low_stock_threshold || 5} units`} />
                        <DetailRow label="Tracking Enabled" value={product.inventory_tracking_enabled ? "Yes" : "No"} />
                        <DetailRow label="Created Date" value={new Date(product.created_at || Date.now()).toLocaleDateString()} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Tab 2: Inventory Pipeline ─────────────────────────────────────
function TabInventory({ product }: { product: any }) {
    const initial = product.initial_stock ?? product.stock ?? 0;
    const returned = product.returned_stock || 0;
    const added = product.manual_added_stock || 0;
    const removed = product.manual_removed_stock || 0;
    const damaged = (product.damaged_stock || 0) + (product.lost_stock || 0);
    const delivered = product.delivered_stock || 0;

    const netPhysical = initial + returned + added - delivered - removed - damaged;

    return (
        <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-5 space-y-6">
            <h2 className="text-[15px] font-bold text-ink">Stock Movement Pipeline</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
                <div className="p-4 rounded-xl bg-base-raised border border-base-border">
                    <div className="text-ink-muted text-[11px] font-semibold uppercase mb-1">Initial Stock</div>
                    <div className="font-mono text-2xl font-bold text-ink">{initial}</div>
                </div>
                <div className="p-4 rounded-xl bg-base-raised border border-base-border">
                    <div className="text-ink-muted text-[11px] font-semibold uppercase mb-1">Restocked / Returned</div>
                    <div className="font-mono text-2xl font-bold text-blue-500">+{returned + added}</div>
                </div>
                <div className="p-4 rounded-xl bg-base-raised border border-base-border">
                    <div className="text-ink-muted text-[11px] font-semibold uppercase mb-1">Delivered to Clients</div>
                    <div className="font-mono text-2xl font-bold text-sky-500">-{delivered}</div>
                </div>
                <div className="p-4 rounded-xl bg-base-raised border border-base-border">
                    <div className="text-ink-muted text-[11px] font-semibold uppercase mb-1">Damaged / Lost</div>
                    <div className="font-mono text-2xl font-bold text-red-500">-{damaged + removed}</div>
                </div>
            </div>

            <div className="border-t border-base-border pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="text-[11px] uppercase font-bold text-ink-muted">Net Remaining Physical Warehouse Stock</div>
                    <div className="text-3xl font-bold font-mono text-emerald-500 mt-1">{netPhysical} units</div>
                </div>
            </div>
        </div>
    );
}

// ── Tab 3: Related Orders ─────────────────────────────────────────
function TabOrders({ product }: { product: any }) {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            const { data } = await supabase
                .from("orders")
                .select("*")
                .eq("workspace_id", product.workspace_id)
                .or(`sku.eq.${product.sku},product_variant.ilike.%${product.name}%`)
                .order("created_at", { ascending: false })
                .limit(100);

            if (data) setOrders(data);
            setLoading(false);
        };
        if (product) fetchOrders();
    }, [product]);

    return (
        <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm overflow-hidden">
            <div className="p-5 border-b border-base-border flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-ink">Related Orders ({orders.length})</h2>
            </div>

            {loading ? (
                <div className="p-12 text-center text-ink-muted flex flex-col items-center gap-2">
                    <RefreshCw className="animate-spin text-brand" size={20} />
                    Loading orders...
                </div>
            ) : orders.length === 0 ? (
                <div className="p-12 text-center text-ink-muted">
                    No orders recorded for this SKU yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-base-raised text-[11px] uppercase tracking-wider text-ink-muted font-bold">
                            <tr>
                                <th className="px-5 py-3">Order #</th>
                                <th className="px-5 py-3">Date</th>
                                <th className="px-5 py-3">Variant / SKU</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-border">
                            {orders.map(o => (
                                <tr key={o.id} className="hover:bg-base-raised/50 transition-colors">
                                    <td className="px-5 py-3 font-mono font-bold text-brand">{o.order_number}</td>
                                    <td className="px-5 py-3 text-ink-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                                    <td className="px-5 py-3 truncate max-w-[200px]">{o.product_variant || o.sku || "—"}</td>
                                    <td className="px-5 py-3">
                                        {o.shipping_status
                                            ? <ShippingStatusBadge status={o.shipping_status} size="sm" />
                                            : <StatusBadge status={o.status || "new"} size="sm" />}
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono font-bold text-ink">{mad(o.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Tab 4: Finance ────────────────────────────────────────────────
function TabFinance({ product }: { product: any }) {
    const qtyDelivered = product.delivered_stock || 0;
    const revenue = qtyDelivered * (product.price || 0);
    const costs = qtyDelivered * (product.cost || 0);
    const grossProfit = revenue - costs;

    return (
        <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-5 space-y-4">
            <h2 className="text-[15px] font-bold text-ink">Financial Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniStat label="Total Delivered Revenue" value={mad(revenue)} valueColor="text-emerald-500" />
                <MiniStat label="Cost of Goods Sold" value={mad(costs)} />
                <MiniStat label="Gross Profit" value={mad(grossProfit)} valueColor="text-emerald-500" />
            </div>
        </div>
    );
}

// ── Tab 5: Analytics ──────────────────────────────────────────────
function TabAnalytics({ product }: { product: any }) {
    return (
        <div className="bg-base-surface rounded-2xl border border-base-border shadow-sm p-8 text-center space-y-3">
            <BarChart size={36} className="mx-auto text-brand opacity-60" />
            <h3 className="text-lg font-bold text-ink">Product Analytics & Velocity</h3>
            <p className="text-[13px] text-ink-muted max-w-md mx-auto">
                Detailed delivery rate percentages, average days to delivery, and reorder projections will appear here.
            </p>
        </div>
    );
}

function MiniStat({ label, value, valueColor = "text-ink" }: { label: string; value: React.ReactNode; valueColor?: string }) {
    return (
        <div className="flex flex-col gap-1 p-3 rounded-xl bg-base-raised border border-base-border/50">
            <span className="text-[11px] text-ink-muted uppercase tracking-wider font-semibold">{label}</span>
            <span className={`font-mono text-xl font-bold ${valueColor}`}>{value}</span>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center py-1.5 border-b border-base-border/40 last:border-0">
            <span className="text-ink-muted font-medium">{label}</span>
            <span className="font-semibold text-ink text-right">{value}</span>
        </div>
    );
}
