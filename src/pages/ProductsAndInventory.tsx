import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
    RefreshCw, Package, PackageOpen, AlertTriangle, Search,
    Truck, CheckCircle2, RotateCcw, ShoppingCart, UploadCloud,
    TrendingUp, Plus, ArrowRight, ScanLine, LayoutGrid, LayoutList,
    SlidersHorizontal, DollarSign, Layers, Edit2, Sliders, Trash2,
    ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ReturnToStockModal } from "../components/ReturnToStockModal";
import { InventoryQRScanner } from "../components/inventory/InventoryQRScanner";
import { ProductModal } from "../components/products/ProductModal";
import { StockAdjustmentModal } from "../components/products/StockAdjustmentModal";
import { normalizeStatus } from "../utils/status";
import { toast } from "../components/Toast";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mad(n: number) {
    return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

function showToast(msg: string, type: "success" | "error" = "success") {
    toast[type](msg);
}

type FilterPillType = "ALL" | "LOW_STOCK" | "HAS_ORDERS" | "IN_STOCK" | "OUT_OF_STOCK" | "HIGH_MARGIN";
type SortField = "name" | "cost" | "price" | "initial_stock" | "ready_to_ship" | "out_for_delivery" | "delivered" | "returned" | "total_orders";
type SortDirection = "asc" | "desc";

// Shared focus/interaction styles so every control in this page behaves consistently
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-base-surface";
const TAP = "active:scale-[0.97] transition-all duration-150";

export default function ProductsAndInventory() {
    const { workspace } = useAuth();
    const navigate = useNavigate();

    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilterPill, setActiveFilterPill] = useState<FilterPillType>("ALL");

    // Sorting state
    const [sortField, setSortField] = useState<SortField>("total_orders");
    const [sortDir, setSortDir] = useState<SortDirection>("desc");

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    // View Mode state — default to the touch-friendly card grid on small screens,
    // and the dense table on larger ones. Purely a starting point; the user can
    // still flip between the two on any screen size.
    const [viewMode, setViewMode] = useState<"table" | "grid">(() =>
        typeof window !== "undefined" && window.innerWidth < 768 ? "grid" : "table"
    );

    // Inline edits state
    const [inlineEdits, setInlineEdits] = useState<Record<string, any>>({});
    const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [imageTarget, setImageTarget] = useState<any | null>(null);

    // Modals state
    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [qrScannerOpen, setQrScannerOpen] = useState(false);
    const [productModalState, setProductModalState] = useState<{ open: boolean; product: any | null }>({ open: false, product: null });
    const [stockAdjustState, setStockAdjustState] = useState<{ open: boolean; product: any | null }>({ open: false, product: null });

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // ── Load Products & Orders Data (BUSINESS LOGIC UNCHANGED) ──────
    const load = useCallback(async (silent = false) => {
        if (!workspace?.id) return;
        if (!silent) setLoading(true);

        try {
            const { data: orders, error: oErr } = await supabase
                .from("orders")
                .select("status, shipping_status, delivery_status, sku, product_variant, total, variant_price, created_at, quantity, returned_to_stock")
                .eq("workspace_id", workspace.id);

            if (oErr) throw oErr;

            const { data: saved, error: pErr } = await supabase
                .from("products")
                .select("id, sku, name, cost, price, initial_stock, image_url, low_stock_threshold, inventory_tracking_enabled, category, barcode, warehouse, status")
                .eq("workspace_id", workspace.id);

            if (pErr) throw pErr;

            const cleanName = (s: string) =>
                (s || "")
                    .replace(/\b\d+\s*(mad|dh|dirham|درهم)\b/gi, "")
                    .replace(/[^\u0000-\u007E\u0600-\u06FF\s]/g, "")
                    .replace(/gratuit|free|offert/gi, "")
                    .trim() || "Unknown Product";

            const toSku = (s: string) =>
                s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

            const skuMap = new Map<string, any>();

            orders?.forEach(order => {
                const rawName = order.product_variant || order.sku || "Unknown Product";
                const name = cleanName(rawName);
                const sku = order.sku || toSku(name);
                const key = sku || "unknown";
                const qty = Number(order.quantity) || 1;

                if (!skuMap.has(key)) {
                    skuMap.set(key, {
                        id: key,
                        sku: key,
                        name,
                        cost: 0,
                        price: Number(order.variant_price || order.total) || 0,
                        initial_stock: 0,
                        image_url: null,
                        low_stock_threshold: 5,
                        inventory_tracking_enabled: true,
                        delivered: 0,
                        returned: 0,
                        cancelled: 0,
                        out_for_delivery: 0,
                        total_orders: 0,
                    });
                }

                const p = skuMap.get(key)!;
                const internalStatus = normalizeStatus(order.shipping_status || order.delivery_status);
                p.total_orders += 1;

                if (internalStatus === "DELIVERED") p.delivered += qty;
                else if (internalStatus === "COMING_BACK" && !order.returned_to_stock) p.returned += qty;
                else if (internalStatus === "OUT_FOR_DELIVERY") p.out_for_delivery += qty;
            });

            saved?.forEach(s => {
                const key = s.sku || toSku(s.name);
                if (!skuMap.has(key)) {
                    skuMap.set(key, {
                        id: s.id,
                        sku: s.sku || key,
                        name: s.name,
                        cost: s.cost || 0,
                        price: s.price || 0,
                        initial_stock: s.initial_stock || 0,
                        image_url: s.image_url || null,
                        low_stock_threshold: s.low_stock_threshold || 5,
                        inventory_tracking_enabled: Boolean(s.inventory_tracking_enabled),
                        delivered: 0,
                        returned: 0,
                        cancelled: 0,
                        out_for_delivery: 0,
                        total_orders: 0,
                        category: s.category,
                        status: s.status,
                    });
                }
            });

            const final = Array.from(skuMap.values()).map(dyn => {
                const s = saved?.find(x => x.sku === dyn.sku || x.name === dyn.name || x.id === dyn.id);
                if (s) {
                    return {
                        ...dyn,
                        id: s.id,
                        cost: s.cost || 0,
                        price: s.price > 0 ? s.price : dyn.price,
                        initial_stock: s.initial_stock || 0,
                        image_url: s.image_url || dyn.image_url || null,
                        low_stock_threshold: s.low_stock_threshold || 5,
                        inventory_tracking_enabled: s.inventory_tracking_enabled ?? true,
                        category: s.category || dyn.category,
                        status: s.status || dyn.status || "active",
                    };
                }
                return dyn;
            });

            final.sort((a, b) => b.total_orders - a.total_orders);
            setProducts(final);
        } catch (err: any) {
            console.error(err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [workspace?.id]);

    useEffect(() => {
        load();
        if (!workspace?.id) return;
        const ch = supabase
            .channel(`inv-${workspace.id}-${Math.random()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `workspace_id=eq.${workspace.id}` }, () => load(true))
            .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `workspace_id=eq.${workspace.id}` }, () => load(true))
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [workspace?.id, load]);

    useEffect(() => {
        const handleReturnComplete = () => {
            console.log("[ProductsAndInventory] Refreshing inventory after return to stock");
            load(true);
        };
        window.addEventListener("return-to-inventory-complete", handleReturnComplete);
        return () => window.removeEventListener("return-to-inventory-complete", handleReturnComplete);
    }, [load]);

    // ── Computed Values per Product (UNCHANGED) ──────────────────
    const getVals = (p: any) => {
        const edits = inlineEdits[p.id] || {};
        const cost = edits.cost !== undefined ? Number(edits.cost) : p.cost;
        const price = edits.price !== undefined ? Number(edits.price) : p.price;
        const initial = edits.initial_stock !== undefined ? Number(edits.initial_stock) : p.initial_stock;

        const current_stock = initial - p.delivered;
        const ready_to_ship = Math.max(0, current_stock - p.out_for_delivery - p.returned);

        const profit = price - cost;
        const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
        const threshold = p.low_stock_threshold || 5;

        let stockStatus: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
        if (ready_to_ship <= 0) stockStatus = "CRITICAL";
        else if (ready_to_ship <= threshold) stockStatus = "WARNING";

        const isAllZero = ready_to_ship === 0 && p.out_for_delivery === 0 && p.delivered === 0 && p.returned === 0 && p.total_orders === 0;

        return {
            cost, price, initial, current_stock, ready_to_ship, profit, margin,
            threshold, stockStatus, isAllZero, isTracked: Boolean(p.inventory_tracking_enabled)
        };
    };

    // ── Top KPI Stats ─────────────────────────────────────────────
    const stats = useMemo(() => {
        const totalProducts = products.length;
        let readyToShip = 0, outForDelivery = 0, comingBack = 0, delivered = 0, lowStock = 0, outOfStock = 0, hasOrdersCount = 0;
        let totalValuation = 0, totalPotentialRevenue = 0;

        products.forEach(p => {
            const v = getVals(p);
            if (p.total_orders > 0) hasOrdersCount++;
            if (!v.isTracked) return;
            readyToShip += v.ready_to_ship;
            outForDelivery += p.out_for_delivery;
            comingBack += p.returned;
            delivered += p.delivered;
            if (v.ready_to_ship === 0) outOfStock++;
            else if (v.ready_to_ship <= v.threshold) lowStock++;

            totalValuation += v.ready_to_ship * v.cost;
            totalPotentialRevenue += v.ready_to_ship * v.price;
        });

        return {
            totalProducts, readyToShip, outForDelivery, comingBack, delivered,
            lowStock, outOfStock, hasOrdersCount, totalValuation, totalPotentialRevenue
        };
    }, [products, inlineEdits]);

    // ── Inline Edit Helpers (UNCHANGED) ───────────────────────────
    const handleChange = (id: string, field: string, val: string) => {
        setInlineEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }));
    };

    const handleSave = async (id: string, p: any, field: string) => {
        const edits = inlineEdits[id];
        if (!edits || edits[field] === undefined) return;

        const newVal = Number(edits[field]);
        const prevVal = Number(field === "initial_stock" ? p.initial_stock : p[field]);
        if (newVal === prevVal) {
            setInlineEdits(prev => { const n = { ...prev }; if (n[id]) delete n[id][field]; return n; });
            return;
        }

        const key = `${id}-${field}`;
        setSavingFields(prev => ({ ...prev, [key]: true }));

        let targetId = id;
        try {
            if (!UUID_REGEX.test(id)) {
                const { data, error } = await supabase.from("products").insert({
                    workspace_id: workspace?.id, sku: p.sku, name: p.name, status: "active"
                }).select("id").single();
                if (error) throw error;
                if (data) targetId = data.id;
            }
            const updatePayload = field === "initial_stock"
                ? { [field]: newVal, inventory_tracking_enabled: true }
                : { [field]: newVal };

            const { data: savedRow, error } = await supabase
                .from("products")
                .update(updatePayload)
                .eq("id", targetId)
                .eq("workspace_id", workspace!.id)
                .select("id, cost, price, initial_stock, low_stock_threshold, inventory_tracking_enabled")
                .maybeSingle();

            if (error) throw error;
            if (!savedRow) throw new Error("Product not found in current workspace.");

            setProducts(prev => prev.map(prod => prod.id === id || prod.id === targetId ? { ...prod, ...savedRow } : prod));
            showToast("Enregistré ✓");
            setInlineEdits(prev => { const n = { ...prev }; if (n[id]) delete n[id][field]; return n; });
        } catch (e: any) {
            showToast("Erreur d'enregistrement: " + e.message, "error");
        } finally {
            setSavingFields(prev => ({ ...prev, [key]: false }));
        }
    };

    // ── Image Upload (UNCHANGED) ──────────────────────────────────
    const handleImageClick = (p: any) => { setImageTarget(p); fileInputRef.current?.click(); };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !imageTarget) return;
        const p = imageTarget;
        setImageTarget(null);
        setUploadingId(p.id);
        try {
            let targetId = p.id;
            if (!UUID_REGEX.test(p.id)) {
                const { data, error } = await supabase.from("products").insert({
                    workspace_id: workspace?.id, sku: p.sku, name: p.name, status: "active"
                }).select("id").single();
                if (error) throw error;
                if (data) targetId = data.id;
            }
            const ext = file.name.split(".").pop() || "jpg";
            const path = `${workspace?.id}/${targetId}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
            await supabase.from("products").update({ image_url: urlData.publicUrl }).eq("id", targetId);
            showToast("Image téléchargée ✓");
            load(true);
        } catch (e: any) {
            showToast("Échec: " + e.message, "error");
        } finally {
            setUploadingId(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // ── Column Sort Handler ──────────────
    const handleColumnSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDir("desc");
        }
        setCurrentPage(1);
    };

    // ── Filtered & Sorted Products List ──────────────────────────
    const processedProducts = useMemo(() => {
        let result = [...products];

        // 1. Search Query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p =>
                p.name?.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q)
            );
        }

        // 2. Filter Pills
        if (activeFilterPill === "IN_STOCK") {
            result = result.filter(p => getVals(p).ready_to_ship > 0);
        } else if (activeFilterPill === "LOW_STOCK") {
            result = result.filter(p => {
                const v = getVals(p);
                return v.ready_to_ship > 0 && v.ready_to_ship <= v.threshold;
            });
        } else if (activeFilterPill === "OUT_OF_STOCK") {
            result = result.filter(p => getVals(p).ready_to_ship === 0);
        } else if (activeFilterPill === "HAS_ORDERS") {
            result = result.filter(p => p.total_orders > 0);
        } else if (activeFilterPill === "HIGH_MARGIN") {
            result = result.filter(p => getVals(p).margin >= 50);
        }

        // 3. Dynamic Column Sorting
        result.sort((a, b) => {
            const va = getVals(a);
            const vb = getVals(b);
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (sortField === "ready_to_ship") { valA = va.ready_to_ship; valB = vb.ready_to_ship; }
            else if (sortField === "cost") { valA = va.cost; valB = vb.cost; }
            else if (sortField === "price") { valA = va.price; valB = vb.price; }
            else if (sortField === "initial_stock") { valA = va.initial; valB = vb.initial; }

            // Secondary sort: active products first if not explicitly sorting by zero values
            if (typeof valA === "number" && typeof valB === "number") {
                const diff = sortDir === "desc" ? valB - valA : valA - valB;
                if (diff !== 0) return diff;
            } else if (typeof valA === "string" && typeof valB === "string") {
                const cmp = valA.localeCompare(valB);
                if (cmp !== 0) return sortDir === "desc" ? -cmp : cmp;
            }

            // Fallback tie breaker
            return (vb.ready_to_ship + b.total_orders) - (va.ready_to_ship + a.total_orders);
        });

        return result;
    }, [products, searchQuery, activeFilterPill, sortField, sortDir, inlineEdits]);

    // ── Pagination Slice ──────────────────────────────────────────
    const totalPages = Math.ceil(processedProducts.length / pageSize) || 1;
    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return processedProducts.slice(start, start + pageSize);
    }, [processedProducts, currentPage, pageSize]);

    // Reset page when search or filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeFilterPill, pageSize]);

    // QR scanner handlers
    const handleQRDetected = useCallback((qrValue: string) => {
        console.log("[Inventory] QR detected:", qrValue);
    }, []);

    const handleViewOrder = useCallback((orderId: string) => {
        navigate("/orders", { state: { viewOrderId: orderId } });
        setQrScannerOpen(false);
    }, [navigate]);

    return (
        <div className="space-y-4 sm:space-y-5 animate-fade-in-up pb-24 max-w-[1600px] mx-auto">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

            {/* Page Header */}
            <PageHeader
                title="Products & Inventory"
                subtitle={`${stats.totalProducts} produits • ${mad(stats.totalValuation)} valeur de stock`}
                action={
                    <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => setProductModalState({ open: true, product: null })}
                            className={`flex h-9 sm:h-8.5 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white shadow-sm hover:bg-brand/90 hover:scale-[1.01] ${TAP} ${FOCUS_RING}`}
                        >
                            <Plus size={14} /> <span className="whitespace-nowrap">Nouveau Produit</span>
                        </button>
                        <button
                            onClick={() => setQrScannerOpen(true)}
                            aria-label="Scanner QR"
                            title="Scanner QR"
                            className={`flex h-9 w-9 sm:h-8.5 sm:w-auto flex-none items-center justify-center gap-1.5 rounded-lg border border-brand/20 bg-brand/5 px-0 sm:px-2.5 text-[12.5px] text-brand font-medium hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                        >
                            <ScanLine size={14} className="sm:hidden" />
                            <ScanLine size={13} className="hidden sm:block" />
                            <span className="hidden sm:inline whitespace-nowrap">Scanner QR</span>
                        </button>
                        <button
                            onClick={() => setReturnModalOpen(true)}
                            aria-label="Retour Stock"
                            title="Retour Stock"
                            className={`flex h-9 w-9 sm:h-8.5 sm:w-auto flex-none items-center justify-center gap-1.5 rounded-lg border border-brand/20 bg-brand/5 px-0 sm:px-2.5 text-[12.5px] text-brand font-medium hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                        >
                            <RotateCcw size={14} className="sm:hidden" />
                            <RotateCcw size={13} className="hidden sm:block" />
                            <span className="hidden sm:inline whitespace-nowrap">Retour Stock</span>
                        </button>
                        <button
                            onClick={() => load()}
                            disabled={loading}
                            aria-label="Rafraîchir"
                            title="Rafraîchir"
                            className={`flex h-9 w-9 sm:h-8.5 sm:w-8.5 flex-none items-center justify-center rounded-lg border border-base-border bg-base-raised text-ink-muted hover:text-ink hover:bg-base-raised/70 disabled:opacity-50 disabled:cursor-not-allowed ${TAP} ${FOCUS_RING}`}
                        >
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                }
            />

            {/* Modals */}
            <ReturnToStockModal isOpen={returnModalOpen} onClose={() => setReturnModalOpen(false)} />

            <InventoryQRScanner
                isOpen={qrScannerOpen}
                onClose={() => setQrScannerOpen(false)}
                onQRDetected={handleQRDetected}
                onViewOrder={handleViewOrder}
            />

            {productModalState.open && (
                <ProductModal
                    product={productModalState.product}
                    onClose={() => setProductModalState({ open: false, product: null })}
                    onSaved={() => {
                        setProductModalState({ open: false, product: null });
                        load(true);
                        showToast("Produit sauvegardé ✓");
                    }}
                />
            )}

            {stockAdjustState.open && (
                <StockAdjustmentModal
                    product={stockAdjustState.product}
                    onClose={() => setStockAdjustState({ open: false, product: null })}
                    onSaved={() => {
                        setStockAdjustState({ open: false, product: null });
                        load(true);
                        showToast("Ajustement de stock sauvegardé ✓");
                    }}
                />
            )}

            {/* ── 1. CARTES STATS — horizontal snap-scroll on phones, grid from sm+ ── */}
            <div
                className="flex sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2.5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
                <CompactStatCard
                    label="Total Produits"
                    value={stats.totalProducts}
                    dotColor="bg-blue-500"
                    active={activeFilterPill === "ALL"}
                    onClick={() => setActiveFilterPill("ALL")}
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
                <CompactStatCard
                    label="Ready to Ship"
                    value={stats.readyToShip}
                    dotColor="bg-emerald-500"
                    active={activeFilterPill === "IN_STOCK"}
                    onClick={() => setActiveFilterPill(activeFilterPill === "IN_STOCK" ? "ALL" : "IN_STOCK")}
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
                <CompactStatCard
                    label="Out for Delivery"
                    value={stats.outForDelivery}
                    dotColor="bg-amber-500"
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
                <CompactStatCard
                    label="Coming Back"
                    value={stats.comingBack}
                    dotColor="bg-purple-500"
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
                <CompactStatCard
                    label="Low Stock Alert"
                    value={stats.lowStock}
                    dotColor="bg-red-500"
                    isAlert={stats.lowStock > 0}
                    active={activeFilterPill === "LOW_STOCK"}
                    onClick={() => setActiveFilterPill(activeFilterPill === "LOW_STOCK" ? "ALL" : "LOW_STOCK")}
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
                <CompactStatCard
                    label="Stock Valuation"
                    customValue={mad(stats.totalValuation)}
                    dotColor="bg-emerald-400"
                    className="min-w-[136px] sm:min-w-0 snap-start flex-none sm:flex-auto"
                />
            </div>

            {/* ── 2. CONTROLS BAR: SEARCH, CHIPS & VIEW SWITCHER ── */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 bg-base-surface border border-base-border rounded-xl p-2.5 shadow-xs">

                {/* Row 1 on mobile: search + view switcher side by side */}
                <div className="flex items-center gap-2 md:contents">
                    <div className="relative flex-1 md:w-72 md:flex-none">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                        <input
                            type="text"
                            placeholder="Rechercher produit, SKU..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className={`w-full h-9 md:h-8.5 pl-8 pr-7 rounded-lg border border-base-border bg-base-raised text-[13px] md:text-[12.5px] text-ink focus:border-brand/50 focus:outline-none transition-all placeholder:text-ink-muted/70 ${FOCUS_RING}`}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                aria-label="Effacer la recherche"
                                className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-[12px] text-ink-muted hover:text-ink hover:bg-base-border/40 ${FOCUS_RING}`}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* View switcher — reachable next to search on mobile, moves to the right on desktop */}
                    <div className="flex items-center bg-base-raised border border-base-border rounded-lg p-0.5 flex-none md:hidden">
                        <button
                            onClick={() => setViewMode("table")}
                            aria-label="Vue Tableau"
                            className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${TAP} ${FOCUS_RING} ${viewMode === "table" ? "bg-base-surface text-brand shadow-xs" : "text-ink-muted hover:text-ink"}`}
                        >
                            <LayoutList size={15} />
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            aria-label="Vue Cartes"
                            className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${TAP} ${FOCUS_RING} ${viewMode === "grid" ? "bg-base-surface text-brand shadow-xs" : "text-ink-muted hover:text-ink"}`}
                        >
                            <LayoutGrid size={15} />
                        </button>
                    </div>
                </div>

                {/* Row 2 on mobile: scrollable filter chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 -mx-0.5 px-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {[
                        { id: "ALL", label: `Tous (${products.length})` },
                        { id: "LOW_STOCK", label: `Low Stock Only (${stats.lowStock})` },
                        { id: "HAS_ORDERS", label: `Commandes en cours (${stats.hasOrdersCount})` },
                        { id: "IN_STOCK", label: `En Stock (${stats.readyToShip})` },
                        { id: "OUT_OF_STOCK", label: `Rupture (${stats.outOfStock})` },
                    ].map(pill => {
                        const active = activeFilterPill === pill.id;
                        return (
                            <button
                                key={pill.id}
                                onClick={() => setActiveFilterPill(pill.id as FilterPillType)}
                                className={`flex-none px-2.5 py-1.5 md:py-1 rounded-lg text-[11.5px] font-medium whitespace-nowrap border ${TAP} ${FOCUS_RING} ${active
                                        ? "bg-brand text-white border-brand shadow-2xs font-semibold"
                                        : "bg-base-raised text-ink-muted hover:text-ink border-base-border"
                                    }`}
                            >
                                {pill.label}
                            </button>
                        );
                    })}
                </div>

                {/* Desktop-only view switcher, right aligned */}
                <div className="hidden md:flex items-center justify-end gap-1.5 flex-none">
                    <div className="flex items-center bg-base-raised border border-base-border rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode("table")}
                            aria-label="Vue Tableau dense"
                            title="Vue Tableau dense"
                            className={`p-1 rounded-md transition-colors ${TAP} ${FOCUS_RING} ${viewMode === "table" ? "bg-base-surface text-brand shadow-xs" : "text-ink-muted hover:text-ink"}`}
                        >
                            <LayoutList size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            aria-label="Vue Cartes"
                            title="Vue Cartes"
                            className={`p-1 rounded-md transition-colors ${TAP} ${FOCUS_RING} ${viewMode === "grid" ? "bg-base-surface text-brand shadow-xs" : "text-ink-muted hover:text-ink"}`}
                        >
                            <LayoutGrid size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 3. TABLEAU PRODUITS DENSE AVEC ENTÊTE STICKY & DE-EMPHASIS DES LIGNES A ZÉRO ── */}
            {loading ? (
                <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-ink-muted gap-2 rounded-xl border border-base-border bg-base-surface">
                    <RefreshCw size={22} className="animate-spin text-brand opacity-80" />
                    <span className="text-[12.5px] font-medium">Chargement du catalogue produits...</span>
                </div>
            ) : processedProducts.length === 0 ? (
                <div className="py-16 sm:py-20 flex flex-col items-center justify-center gap-2 text-ink-muted rounded-xl border border-base-border bg-base-surface px-4 text-center">
                    <PackageOpen size={36} className="opacity-30 text-brand" />
                    <span className="text-[13px] font-bold text-ink">Aucun produit trouvé</span>
                    <span className="text-[11.5px] text-ink-muted">Essayez de modifier votre recherche ou vos filtres.</span>
                    <button
                        onClick={() => { setSearchQuery(""); setActiveFilterPill("ALL"); }}
                        className={`mt-1 text-[11.5px] text-brand font-semibold hover:underline rounded ${FOCUS_RING}`}
                    >
                        Réinitialiser les filtres
                    </button>
                </div>
            ) : viewMode === "grid" ? (
                /* GRID CARD VIEW */
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {paginatedProducts.map(p => {
                        const v = getVals(p);
                        return (
                            <div
                                key={p.id}
                                className={`group relative rounded-xl border border-base-border bg-base-surface p-3 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${v.isAllZero ? "opacity-60 hover:opacity-100 bg-base-raised/20" : ""
                                    }`}
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2.5 mb-2.5">
                                        <button
                                            type="button"
                                            aria-label="Changer l'image du produit"
                                            className={`relative h-11 w-11 sm:h-10 sm:w-10 flex-none rounded-lg overflow-hidden border border-base-border bg-base-raised cursor-pointer flex items-center justify-center group/img ${FOCUS_RING}`}
                                            onClick={() => handleImageClick(p)}
                                        >
                                            {p.image_url ? (
                                                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover group-hover/img:scale-105 transition-transform" />
                                            ) : (
                                                <Package size={18} className="text-ink-faint group-hover/img:text-brand transition-colors" />
                                            )}
                                            {uploadingId === p.id && (
                                                <div className="absolute inset-0 bg-base-surface/80 flex items-center justify-center">
                                                    <RefreshCw size={12} className="animate-spin text-brand" />
                                                </div>
                                            )}
                                        </button>

                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold border ${v.stockStatus === "CRITICAL"
                                                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                    : v.stockStatus === "WARNING"
                                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${v.stockStatus === "CRITICAL" ? "bg-red-500 animate-pulse" : v.stockStatus === "WARNING" ? "bg-amber-500" : "bg-emerald-500"
                                                    }`} />
                                                {v.ready_to_ship} ready
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={`block w-full text-left cursor-pointer rounded ${FOCUS_RING}`}
                                        onClick={() => navigate(`/products-inventory/${p.id}`)}
                                    >
                                        <h4 className="font-semibold text-[13.5px] text-ink truncate group-hover:text-brand transition-colors">
                                            {p.name || "Sans titre"}
                                        </h4>
                                        <div className="text-[11px] font-mono text-sky-500 mt-0.5 truncate">
                                            SKU: {p.sku || "—"}
                                        </div>
                                    </button>

                                    <div className="grid grid-cols-2 gap-2 my-2.5 p-2 rounded-lg bg-base-raised border border-base-border/50 text-[11.5px]">
                                        <div>
                                            <span className="text-[9.5px] uppercase font-bold text-ink-muted block">Coût</span>
                                            <span className="font-mono font-medium text-ink-muted">{mad(v.cost)}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9.5px] uppercase font-bold text-ink-muted block">Prix</span>
                                            <span className="font-mono font-bold text-ink">{mad(v.price)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-base-border/60">
                                    <div className="flex items-center gap-1 text-[11px] text-ink-muted font-mono">
                                        <ShoppingCart size={11} /> {p.total_orders} commandes
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={() => setStockAdjustState({ open: true, product: p })}
                                            aria-label="Ajuster Stock"
                                            title="Ajuster Stock"
                                            className={`p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                        >
                                            <Sliders size={14} />
                                        </button>
                                        <button
                                            onClick={() => setProductModalState({ open: true, product: p })}
                                            aria-label="Éditer Produit"
                                            title="Éditer Produit"
                                            className={`p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => navigate(`/products-inventory/${p.id}`)}
                                            aria-label="Voir Détails"
                                            title="Voir Détails"
                                            className={`p-1.5 rounded-md text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                        >
                                            <Eye size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* DENSE TABLE VIEW WITH STICKY HEADER, STICKY FIRST COLUMN & SORTABLE COLUMNS */
                <div className="rounded-xl border border-base-border bg-base-surface shadow-xs overflow-hidden">
                    <div className="overflow-x-auto max-h-[680px] [scrollbar-width:thin]">
                        <table className="w-full text-left text-[12.5px] border-collapse">
                            {/* Sticky Header */}
                            <thead className="sticky top-0 z-20 bg-base-surface/95 backdrop-blur border-b border-base-border shadow-2xs">
                                <tr className="text-[10.5px] uppercase font-bold text-ink-muted tracking-wider select-none">
                                    <SortableHeader
                                        label="PRODUCT"
                                        field="name"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="sticky left-0 z-10 bg-base-surface/95 backdrop-blur pl-4 pr-3 py-2.5 w-[220px] sm:w-[260px] after:content-[''] after:absolute after:top-0 after:right-0 after:bottom-0 after:w-px after:bg-base-border"
                                    />
                                    <SortableHeader
                                        label="COST"
                                        field="cost"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 w-24"
                                    />
                                    <SortableHeader
                                        label="PRICE"
                                        field="price"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 w-28"
                                    />
                                    <SortableHeader
                                        label="INITIAL"
                                        field="initial_stock"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 w-24"
                                    />
                                    <SortableHeader
                                        label="READY TO SHIP"
                                        field="ready_to_ship"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 text-center text-emerald-600 dark:text-emerald-400 w-32"
                                    />
                                    <SortableHeader
                                        label="OUT DELIVERY"
                                        field="out_for_delivery"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 text-center text-amber-600 dark:text-amber-400 w-28"
                                    />
                                    <SortableHeader
                                        label="DELIVERED"
                                        field="delivered"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 text-center text-sky-600 dark:text-sky-400 w-24"
                                    />
                                    <SortableHeader
                                        label="RETURNED"
                                        field="returned"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 text-center text-purple-600 dark:text-purple-400 w-24"
                                    />
                                    <SortableHeader
                                        label="ORDERS"
                                        field="total_orders"
                                        currentField={sortField}
                                        currentDir={sortDir}
                                        onSort={handleColumnSort}
                                        className="px-3 py-2.5 text-center w-24"
                                    />
                                    <th className="pr-4 pl-3 py-2.5 text-right w-24">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-base-border/50">
                                {paginatedProducts.map(p => {
                                    const v = getVals(p);
                                    const savingCost = savingFields[`${p.id}-cost`];
                                    const savingPrice = savingFields[`${p.id}-price`];
                                    const savingStock = savingFields[`${p.id}-initial_stock`];
                                    const rowBg = v.isAllZero ? "bg-base-raised/15 group-hover:bg-base-raised/50" : "bg-base-surface group-hover:bg-base-raised/50";

                                    return (
                                        <tr
                                            key={p.id}
                                            className={`group transition-colors ${v.isAllZero
                                                    ? "opacity-50 hover:opacity-100 bg-base-raised/15"
                                                    : "hover:bg-base-raised/50"
                                                }`}
                                        >
                                            {/* Product cell — sticky so identity stays visible while scrolling horizontally */}
                                            <td className={`sticky left-0 z-[5] pl-4 pr-3 py-2 transition-colors ${rowBg} after:content-[''] after:absolute after:top-0 after:right-0 after:bottom-0 after:w-px after:bg-base-border/60`}>
                                                <div className="flex items-center gap-2.5">
                                                    <button
                                                        type="button"
                                                        aria-label="Changer l'image du produit"
                                                        className={`relative h-9 w-9 flex-none rounded-lg overflow-hidden border border-base-border bg-base-raised cursor-pointer flex items-center justify-center group/img ${FOCUS_RING}`}
                                                        onClick={() => handleImageClick(p)}
                                                    >
                                                        {p.image_url ? (
                                                            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover group-hover/img:opacity-60 transition-opacity" />
                                                        ) : (
                                                            <Package size={16} className="text-ink-faint group-hover/img:text-brand transition-colors" />
                                                        )}
                                                        {uploadingId === p.id && (
                                                            <div className="absolute inset-0 bg-base-surface/80 flex items-center justify-center">
                                                                <RefreshCw size={12} className="animate-spin text-brand" />
                                                            </div>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`min-w-0 text-left cursor-pointer rounded ${FOCUS_RING}`}
                                                        onClick={() => navigate(`/products-inventory/${p.id}`)}
                                                    >
                                                        <div className="font-semibold text-[13px] text-ink leading-tight truncate max-w-[140px] sm:max-w-[160px] hover:text-brand transition-colors">
                                                            {p.name || "Sans titre"}
                                                        </div>
                                                        <div className="text-[10.5px] font-mono text-sky-500 truncate max-w-[140px] sm:max-w-[160px]">
                                                            SKU: {p.sku || "—"}
                                                        </div>
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Cost */}
                                            <td className="px-3 py-2">
                                                <EditableNumField
                                                    value={v.cost}
                                                    rawEdit={inlineEdits[p.id]?.cost}
                                                    saving={savingCost}
                                                    onChange={val => handleChange(p.id, "cost", val)}
                                                    onSave={() => handleSave(p.id, p, "cost")}
                                                    suffix="MAD"
                                                    isZero={v.cost === 0}
                                                />
                                            </td>

                                            {/* Price */}
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-1.5">
                                                    <EditableNumField
                                                        value={v.price}
                                                        rawEdit={inlineEdits[p.id]?.price}
                                                        saving={savingPrice}
                                                        onChange={val => handleChange(p.id, "price", val)}
                                                        onSave={() => handleSave(p.id, p, "price")}
                                                        suffix="MAD"
                                                        bold
                                                        isZero={v.price === 0}
                                                    />
                                                </div>
                                            </td>

                                            {/* Initial Stock */}
                                            <td className="px-3 py-2">
                                                <EditableNumField
                                                    value={v.initial}
                                                    rawEdit={inlineEdits[p.id]?.initial_stock}
                                                    saving={savingStock}
                                                    onChange={val => handleChange(p.id, "initial_stock", val)}
                                                    onSave={() => handleSave(p.id, p, "initial_stock")}
                                                    integer
                                                    isZero={v.initial === 0}
                                                />
                                            </td>

                                            {/* Ready To Ship Badge */}
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md text-[11.5px] font-bold font-mono border ${v.ready_to_ship === 0
                                                        ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20 opacity-70"
                                                        : v.stockStatus === "CRITICAL"
                                                            ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                            : v.stockStatus === "WARNING"
                                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                    }`}>
                                                    {v.ready_to_ship}
                                                </span>
                                            </td>

                                            {/* Out For Delivery */}
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded-md text-[11.5px] font-mono ${p.out_for_delivery > 0 ? "bg-amber-500/10 text-amber-500 font-bold" : "text-ink-muted/50 font-normal"
                                                    }`}>
                                                    {p.out_for_delivery}
                                                </span>
                                            </td>

                                            {/* Delivered */}
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded-md text-[11.5px] font-mono ${p.delivered > 0 ? "bg-sky-500/10 text-sky-500 font-bold" : "text-ink-muted/50 font-normal"
                                                    }`}>
                                                    {p.delivered}
                                                </span>
                                            </td>

                                            {/* Returned */}
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded-md text-[11.5px] font-mono ${p.returned > 0 ? "bg-purple-500/10 text-purple-500 font-bold" : "text-ink-muted/50 font-normal"
                                                    }`}>
                                                    {p.returned}
                                                </span>
                                            </td>

                                            {/* Orders */}
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    onClick={() => navigate(`/products-inventory/${p.id}`)}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-mono ${TAP} ${FOCUS_RING} ${p.total_orders > 0
                                                            ? "bg-brand/10 border border-brand/20 text-brand font-bold hover:bg-brand/20"
                                                            : "text-ink-muted/50 font-normal hover:text-ink"
                                                        }`}
                                                >
                                                    {p.total_orders}
                                                </button>
                                            </td>

                                            {/* Actions Column (Discrete Icons) */}
                                            <td className="pr-4 pl-3 py-2 text-right">
                                                <div className="flex items-center justify-end gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => setStockAdjustState({ open: true, product: p })}
                                                        aria-label="Ajuster Stock"
                                                        title="Ajuster Stock"
                                                        className={`p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                                    >
                                                        <Sliders size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => setProductModalState({ open: true, product: p })}
                                                        aria-label="Modifier Produit"
                                                        title="Modifier Produit"
                                                        className={`p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => navigate(`/products-inventory/${p.id}`)}
                                                        aria-label="Voir Détails"
                                                        title="Voir Détails"
                                                        className={`p-1.5 rounded-md text-ink-muted hover:text-brand hover:bg-brand/10 ${TAP} ${FOCUS_RING}`}
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="md:hidden px-4 py-1.5 text-[10.5px] text-ink-muted/70 border-t border-base-border bg-base-raised/30 text-center">
                        ← Glissez pour voir plus de colonnes →
                    </div>

                    {/* Pagination Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-3 sm:px-4 py-2.5 border-t border-base-border bg-base-surface text-[12px] text-ink-muted">
                        <div className="order-2 sm:order-1 text-center sm:text-left">
                            Affichage <span className="font-semibold text-ink">{Math.min(processedProducts.length, (currentPage - 1) * pageSize + 1)}</span>–
                            <span className="font-semibold text-ink">{Math.min(processedProducts.length, currentPage * pageSize)}</span> sur{" "}
                            <span className="font-semibold text-ink">{processedProducts.length}</span> produits
                        </div>

                        <div className="order-1 sm:order-2 flex items-center gap-3">
                            <div className="hidden sm:flex items-center gap-1.5">
                                <span className="text-[11.5px]">Lignes par page:</span>
                                <select
                                    value={pageSize}
                                    onChange={e => setPageSize(Number(e.target.value))}
                                    className={`bg-base-raised border border-base-border rounded px-1.5 py-0.5 text-[11.5px] text-ink focus:outline-none ${FOCUS_RING}`}
                                >
                                    <option value={15}>15</option>
                                    <option value={30}>30</option>
                                    <option value={50}>50</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    aria-label="Page précédente"
                                    className={`h-8 w-8 flex items-center justify-center rounded border border-base-border hover:bg-base-raised disabled:opacity-40 disabled:cursor-not-allowed ${TAP} ${FOCUS_RING}`}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-2 text-[11.5px] font-mono whitespace-nowrap">
                                    Page {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    aria-label="Page suivante"
                                    className={`h-8 w-8 flex items-center justify-center rounded border border-base-border hover:bg-base-raised disabled:opacity-40 disabled:cursor-not-allowed ${TAP} ${FOCUS_RING}`}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Column Header with Sort Indicator ──────────────────────────────
function SortableHeader({ label, field, currentField, currentDir, onSort, className = "" }: {
    label: string;
    field: SortField;
    currentField: SortField;
    currentDir: SortDirection;
    onSort: (field: SortField) => void;
    className?: string;
}) {
    const isSorted = currentField === field;
    return (
        <th
            onClick={() => onSort(field)}
            className={`cursor-pointer hover:text-brand transition-colors ${FOCUS_RING} ${className}`}
            tabIndex={0}
            role="button"
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(field); } }}
        >
            <div className="flex items-center gap-1">
                <span>{label}</span>
                {isSorted ? (
                    currentDir === "asc" ? <ChevronUp size={11} className="text-brand" /> : <ChevronDown size={11} className="text-brand" />
                ) : (
                    <ArrowUpDown size={10} className="opacity-40 hover:opacity-100" />
                )}
            </div>
        </th>
    );
}

// ── Reusable Editable Number Field (UNCHANGED LOGIC) ──────────────
function EditableNumField({ value, rawEdit, saving, onChange, onSave, suffix, bold, integer, isZero }: {
    value: number;
    rawEdit?: string;
    saving?: boolean;
    onChange: (v: string) => void;
    onSave: () => void;
    suffix?: string;
    bold?: boolean;
    integer?: boolean;
    isZero?: boolean;
}) {
    const [focused, setFocused] = useState(false);
    const isDirty = rawEdit !== undefined;

    if (focused || isDirty) {
        return (
            <div className="relative flex items-center">
                <input
                    autoFocus={focused}
                    type="number"
                    inputMode="decimal"
                    value={rawEdit ?? value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={() => { setFocused(false); onSave(); }}
                    onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") { onChange(String(value)); setFocused(false); }
                    }}
                    step={integer ? 1 : 0.01}
                    className={`w-full rounded border border-brand/60 bg-brand/5 text-brand px-1.5 py-1 sm:py-0.5 text-[12px] font-mono focus:outline-none ${FOCUS_RING}`}
                />
                {saving && <RefreshCw size={10} className="absolute right-1.5 animate-spin text-brand" />}
            </div>
        );
    }

    return (
        <button
            onClick={() => setFocused(true)}
            disabled={saving}
            className={`group flex items-center gap-0.5 rounded px-1.5 py-1 sm:py-0.5 text-[12px] font-mono hover:bg-brand/5 hover:text-brand transition-colors w-full text-left disabled:cursor-not-allowed ${FOCUS_RING} ${bold ? "font-semibold text-ink" : isZero ? "text-ink-muted/50" : "text-ink-muted"
                }`}
        >
            {saving ? (
                <RefreshCw size={10} className="animate-spin text-ink-muted" />
            ) : (
                <span>
                    {integer ? value : value > 0 ? value : "—"}
                    {suffix && value > 0 && <span className="ml-0.5 text-ink-faint text-[10px]">{suffix}</span>}
                </span>
            )}
        </button>
    );
}

// ── 1. COMPACT NEUTRAL STAT CARD (HIERARCHIE & NEUTRAL PALETTE) ───
function CompactStatCard({ label, value, customValue, dotColor, isAlert, active, onClick, className = "" }: {
    label: string;
    value?: number;
    customValue?: string;
    dotColor: string;
    isAlert?: boolean;
    active?: boolean;
    onClick?: () => void;
    className?: string;
}) {
    const isZero = value === 0;
    const Wrapper: any = onClick ? "button" : "div";

    return (
        <Wrapper
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`rounded-xl border px-3 py-2.5 shadow-2xs transition-all relative overflow-hidden text-left w-full ${onClick ? `cursor-pointer hover:border-brand/40 hover:-translate-y-0.5 ${TAP} ${FOCUS_RING}` : ""
                } ${active
                    ? "border-brand bg-brand/5 ring-1 ring-brand/40"
                    : isZero
                        ? "border-base-border bg-base-surface opacity-60 hover:opacity-100"
                        : "border-base-border bg-base-surface"
                } ${className}`}
        >
            {/* Top row: dot + label */}
            <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-2 w-2 rounded-full flex-none ${dotColor} ${isAlert ? "animate-pulse" : ""}`} />
                <span className="text-[10px] uppercase font-semibold tracking-wider text-ink-muted truncate">
                    {label}
                </span>
            </div>

            {/* Dominant main number */}
            <div className={`text-xl font-bold font-mono tracking-tight leading-none ${isZero ? "text-ink-muted/60" : "text-ink"
                }`}>
                {customValue ? customValue : value !== undefined ? value.toLocaleString() : 0}
            </div>
        </Wrapper>
    );
}
