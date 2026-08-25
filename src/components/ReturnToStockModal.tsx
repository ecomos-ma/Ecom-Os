import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    X,
    Package,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    ScanLine,
    ChevronRight,
    Wifi,
    ArrowUp,
    ArrowDown
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { isReturnableStatus, normalizeDisplayStatus, loadOrderItems, executeReturnToStock, type ReturnItem, type ReturnToStockResult } from "../lib/returnToStock";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReturnToStockModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface OrderResult {
    id: string;
    order_number: string;
    tracking_number: string | null;
    coliaty_parcel_code: string | null;
    shipping_status: string | null;
    delivery_status: string | null;
    status: string | null;
    returned_to_stock: boolean;
    customer_name: string | null;
    city: string | null;
    quantity: number | null;
    sku: string | null;
    product_variant: string | null;
    // Additional fields for compatibility
    [key: string]: any;
    // Derived
    displayTracking: string;
    displayStatus: string;
    normStatus: string;
    customerName: string;
    isEligible: boolean;
    items: ReturnItem[];
}

interface SuccessState {
    tracking: string;
    productName: string;
    qty: number;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ReturnToStockModal({ isOpen, onClose }: ReturnToStockModalProps) {
    const { workspace } = useAuth();

    // Input
    const [searchInput, setSearchInput] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<OrderResult[]>([]);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);
    const [scannerActive, setScannerActive] = useState(false);

    // Workflow state
    const [selectedOrder, setSelectedOrder] = useState<OrderResult | null>(null);
    const [stage, setStage] = useState<"scan" | "confirm" | "success">("scan");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [successState, setSuccessState] = useState<SuccessState | null>(null);

    // Refs
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // ── Reset ────────────────────────────────────────────────────────────────
    const resetToScan = useCallback(() => {
        setSearchInput("");
        setSuggestions([]);
        setSelectedOrder(null);
        setHighlightedIdx(-1);
        setErrorMsg(null);
        setStage("scan");
        setSuccessState(null);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 50);
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetToScan();
        }
    }, [isOpen, resetToScan]);

    // ── Scanner detection (activity = focus) ─────────────────────────────────
    useEffect(() => {
        const handleFocus = () => setScannerActive(true);
        const handleBlur = () => setScannerActive(false);
        const inp = inputRef.current;
        inp?.addEventListener("focus", handleFocus);
        inp?.addEventListener("blur", handleBlur);
        return () => {
            inp?.removeEventListener("focus", handleFocus);
            inp?.removeEventListener("blur", handleBlur);
        };
    }, [isOpen]);

    // ── Search ───────────────────────────────────────────────────────────────
    const doSearch = useCallback(async (query: string) => {
        if (!workspace?.id) {
            setSuggestions([]);
            return;
        }

        setIsSearching(true);
        try {
            // Include common returnable statuses for the default empty-query load
            const defaultStatuses = [
                "COMING_BACK", "Refusé", "refused", "retour", "returned_to_sender",
                "Delivery Failed", "returned_to_warehouse", "rejected", "return_in_transit"
            ];

            let q = supabase
                .from("orders")
                .select(`
                    id, order_number, tracking_number, coliaty_parcel_code,
                    shipping_status, delivery_status, status, returned_to_stock,
                    customer_name, city, quantity, sku, product_variant
                `)
                .eq("workspace_id", workspace.id)
                .eq("returned_to_stock", false);

            if (query && query.length >= 2) {
                q = q.or(`tracking_number.ilike.%${query}%,coliaty_parcel_code.ilike.%${query}%`).limit(10);
            } else if (!query) {
                // If it's an empty query (clicked), show the most recent 15 that are coming back
                q = q.in("shipping_status", defaultStatuses)
                    .order("created_at", { ascending: false })
                    .limit(15);
            } else {
                setSuggestions([]);
                setIsSearching(false);
                return;
            }

            const { data, error } = await q;

            if (error) throw error;

            const results: OrderResult[] = (data ?? []).map((o: any) => {
                const rawStatus = String(o.shipping_status || o.delivery_status || o.status || "");
                const displayTracking = o.tracking_number || o.coliaty_parcel_code || o.order_number;
                const eligible = isReturnableStatus(rawStatus);

                return {
                    ...o,
                    displayTracking,
                    displayStatus: normalizeDisplayStatus(rawStatus),
                    normStatus: rawStatus.toLowerCase(),
                    customerName: o.customer_name || "Unknown Customer",
                    isEligible: eligible,
                    items: [], // populated on select
                };
            });

            // Filter out non-eligible ones if they snuck in through the default empty query
            const filteredResults = query ? results : results.filter(r => r.isEligible);

            setSuggestions(filteredResults);
            setHighlightedIdx(filteredResults.length === 1 ? 0 : -1);

            // Auto-select when exactly 1 result (scanner sends exact tracking number)
            if (query && filteredResults.length === 1) {
                handleSelectOrder(filteredResults[0]);
            }
        } catch (err) {
            console.error("[ReturnToStock] Search error:", err);
        } finally {
            setIsSearching(false);
        }
    }, [workspace?.id]);

    useEffect(() => {
        if (selectedOrder) {
            setSuggestions([]);
            return;
        }

        // If search Input is empty but scanner is active (input focused), load defaults
        if (!searchInput && scannerActive) {
            clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => doSearch(""), 50);
            return;
        } else if (!searchInput && !scannerActive) {
            setSuggestions([]);
            return;
        }

        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => doSearch(searchInput.trim()), 200);
        return () => clearTimeout(searchTimeoutRef.current);
    }, [searchInput, selectedOrder, scannerActive, doSearch]);

    // ── Select order ─────────────────────────────────────────────────────────
    const handleSelectOrder = useCallback(async (order: OrderResult) => {
        setSuggestions([]);
        setHighlightedIdx(-1);
        setSearchInput(order.displayTracking);
        setErrorMsg(null);

        // Duplicate check
        if (order.returned_to_stock) {
            setSelectedOrder({ ...order, items: [] });
            setErrorMsg("This parcel has already been returned to inventory.");
            setStage("confirm");
            return;
        }

        // Eligibility check
        if (!order.isEligible) {
            setSelectedOrder({ ...order, items: [] });
            setErrorMsg(`This order cannot be returned — current status is: "${order.displayStatus}"`);
            setStage("confirm");
            return;
        }

        // Load product/stock details
        setIsProcessing(true);
        try {
            if (!workspace?.id) {
                setErrorMsg("Workspace not available");
                return;
            }
            const items = await loadOrderItems(order.id || order["Order ID"], order.sku, order.quantity, order.product_variant, workspace.id);

            setSelectedOrder({ ...order, items });

            if (items.length === 0) {
                setErrorMsg("No products found for this order. Stock cannot be returned automatically.");
            }

            setStage("confirm");
        } finally {
            setIsProcessing(false);
        }
    }, [workspace?.id]);

    // ── Confirm return ───────────────────────────────────────────────────────
    const handleConfirm = useCallback(async () => {
        if (!selectedOrder || !workspace?.id || isProcessing) return;
        if (selectedOrder.returned_to_stock || !selectedOrder.isEligible) return;

        setIsProcessing(true);
        setErrorMsg(null);

        try {
            const result = await executeReturnToStock(
                selectedOrder.id || selectedOrder["Order ID"],
                selectedOrder.items,
                selectedOrder.displayTracking,
                workspace.id
            );

            if (result.success) {
                setSuccessState({
                    tracking: result.tracking,
                    productName: result.productName,
                    qty: result.qty,
                });
                setStage("success");

                // Auto-reset after 2.5 seconds for continuous scanning
                setTimeout(() => resetToScan(), 2500);
            } else {
                setErrorMsg(result.error || "Unable to return package to stock.");
            }
        } catch (err: any) {
            console.error("[ReturnToStock] Confirm error:", err);
            setErrorMsg("Unable to return package to stock.");
        } finally {
            setIsProcessing(false);
        }
    }, [selectedOrder, workspace?.id, isProcessing, resetToScan]);

    // ── Keyboard handler ─────────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            if (stage !== "scan") {
                resetToScan();
            } else {
                onClose();
            }
            return;
        }

        if (suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIdx(i => Math.min(i + 1, suggestions.length - 1));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIdx(i => Math.max(i - 1, 0));
                return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && highlightedIdx >= 0) {
                e.preventDefault();
                handleSelectOrder(suggestions[highlightedIdx]);
                return;
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();
            if (stage === "confirm" && selectedOrder?.isEligible && !selectedOrder?.returned_to_stock && !errorMsg) {
                handleConfirm();
            } else if (stage === "success") {
                resetToScan();
            } else if (suggestions.length === 1) {
                handleSelectOrder(suggestions[0]);
            } else if (searchInput.trim().length >= 2) {
                doSearch(searchInput.trim());
            }
        }
    }, [suggestions, highlightedIdx, stage, selectedOrder, errorMsg, searchInput, handleSelectOrder, handleConfirm, resetToScan, onClose, doSearch]);

    if (!isOpen) return null;

    const canConfirm = selectedOrder?.isEligible && !selectedOrder?.returned_to_stock && !errorMsg && !isProcessing;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div
                className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col"
                style={{ maxHeight: "90vh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <Package size={20} />
                        </div>
                        <div>
                            <h3 className="text-[16px] font-bold text-zinc-900 dark:text-zinc-100 leading-none">Return Parcel To Inventory</h3>
                            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">Scan barcode or type tracking number</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Scanner badge */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${scannerActive ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400" : "bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${scannerActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
                            <Wifi size={10} />
                            {scannerActive ? "Scanner Ready" : "Tap to Scan"}
                        </div>
                        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Body ────────────────────────────────────────────────── */}
                <div className="flex flex-col gap-4 p-6 overflow-y-auto">

                    {/* ── SUCCESS SCREEN ─────────────────────────────────── */}
                    {stage === "success" && successState && (
                        <div className="flex flex-col items-center gap-4 py-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                    <CheckCircle2 size={42} className="text-emerald-500" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[12px] font-bold">
                                    +{successState.qty}
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-[20px] font-bold text-zinc-900 dark:text-zinc-100">Returned to Stock ✓</p>
                                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">{successState.productName}</p>
                            </div>
                            <div className="w-full rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Tracking</p>
                                    <p className="font-mono text-[12px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{successState.tracking}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Quantity Returned</p>
                                    <p className="text-[18px] font-bold text-emerald-600 dark:text-emerald-400">+{successState.qty}</p>
                                </div>
                            </div>
                            <p className="text-[12px] text-zinc-400 dark:text-zinc-500">Scanning next parcel in 2 seconds...</p>
                        </div>
                    )}

                    {/* ── SCAN / CONFIRM SCREENS ─────────────────────────── */}
                    {stage !== "success" && (
                        <>
                            {/* Search Input */}
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                    {isSearching
                                        ? <Loader2 size={20} className="animate-spin text-emerald-500" />
                                        : <ScanLine size={20} className={scannerActive ? "text-emerald-500" : "text-zinc-400"} />
                                    }
                                </div>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchInput}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    onChange={(e) => {
                                        setSearchInput(e.target.value);
                                        if (selectedOrder) {
                                            setSelectedOrder(null);
                                            setErrorMsg(null);
                                            setStage("scan");
                                        }
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Scan barcode or type tracking number..."
                                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[14px] font-mono text-zinc-900 dark:text-zinc-100 shadow-sm focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none transition-all placeholder:font-sans placeholder:text-[13px] placeholder:text-zinc-400"
                                />

                                {/* Suggestion dropdown */}
                                {suggestions.length > 0 && (
                                    <div
                                        ref={dropdownRef}
                                        className="absolute z-30 top-full mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl overflow-hidden"
                                    >
                                        {suggestions.map((s, idx) => (
                                            <button
                                                key={s.id}
                                                onMouseDown={(e) => { e.preventDefault(); handleSelectOrder(s); }}
                                                onMouseEnter={() => setHighlightedIdx(idx)}
                                                className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0 transition-colors ${highlightedIdx === idx ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"}`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-mono text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.displayTracking}</div>
                                                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{s.customerName} • {s.city || "—"}</div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.isEligible ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400" : "bg-zinc-100 border-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-400"}`}>
                                                        {s.displayStatus}
                                                    </span>
                                                    {s.returned_to_stock && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400">Done</span>
                                                    )}
                                                    <ChevronRight size={13} className="text-zinc-300 dark:text-zinc-600" />
                                                </div>
                                            </button>
                                        ))}
                                        {suggestions.length > 1 && (
                                            <div className="px-4 py-2 text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50">
                                                <ArrowUp size={11} /><ArrowDown size={11} /> Arrow keys to navigate • Enter to select
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <p className="text-[12px] text-zinc-400 dark:text-zinc-500 -mt-2">
                                You can scan with a USB or Bluetooth barcode scanner, or search manually.
                            </p>

                            {/* Error banner */}
                            {errorMsg && (
                                <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 animate-in fade-in slide-in-from-top-2">
                                    <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-[13px] font-semibold text-red-800 dark:text-red-200">
                                            {selectedOrder?.returned_to_stock ? "Already Processed" : "Cannot Return"}
                                        </p>
                                        <p className="text-[12px] text-red-600 dark:text-red-400 mt-0.5">{errorMsg}</p>
                                    </div>
                                </div>
                            )}

                            {/* Order preview / confirm card */}
                            {selectedOrder && stage === "confirm" && (
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Order Found</span>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${selectedOrder.isEligible && !selectedOrder.returned_to_stock ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400" : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400"}`}>
                                            {selectedOrder.returned_to_stock ? "Already Returned" : selectedOrder.displayStatus}
                                        </span>
                                    </div>

                                    <div className="p-4 grid grid-cols-2 gap-3 text-[13px]">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">Tracking</p>
                                            <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 text-[12px] break-all">{selectedOrder.displayTracking}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">Customer</p>
                                            <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{selectedOrder.customerName}</p>
                                        </div>
                                        {selectedOrder.city && (
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">City</p>
                                                <p className="text-zinc-700 dark:text-zinc-300">{selectedOrder.city}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Products */}
                                    {selectedOrder.items.length > 0 && !errorMsg && (
                                        <div className="border-t border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Products To Return</p>
                                            {selectedOrder.items.map((item, i) => (
                                                <div key={i} className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2.5">
                                                    {item.image_url ? (
                                                        <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-md object-cover shrink-0 bg-zinc-100" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                                            <Package size={14} className="text-zinc-400" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{item.name}</p>
                                                        {item.variant && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{item.variant}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0 text-right">
                                                        {item.current_stock !== null && (
                                                            <div>
                                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Current</p>
                                                                <p className="font-mono font-bold text-[13px] text-zinc-700 dark:text-zinc-300">{item.current_stock}</p>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                                            <span className="text-[11px]">→</span>
                                                        </div>
                                                        {item.current_stock !== null && (
                                                            <div>
                                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">New</p>
                                                                <p className="font-mono font-bold text-[13px] text-emerald-600 dark:text-emerald-400">{item.current_stock + item.quantity}</p>
                                                            </div>
                                                        )}
                                                        <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-mono font-bold px-2 py-1 rounded-lg text-[13px]">
                                                            +{item.quantity}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {isProcessing && (
                                        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-[13px]">
                                            <Loader2 size={14} className="animate-spin" />
                                            Loading product details...
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className="border-t border-zinc-200 dark:border-zinc-700 px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between shrink-0">
                    <div className="text-[12px] text-zinc-400">
                        {stage === "confirm" && <span><kbd className="px-1.5 py-0.5 rounded border text-[11px] bg-white dark:bg-zinc-900 dark:border-zinc-700">Enter</kbd> to confirm • <kbd className="px-1.5 py-0.5 rounded border text-[11px] bg-white dark:bg-zinc-900 dark:border-zinc-700">Esc</kbd> to cancel</span>}
                        {stage === "success" && <span>Auto-resetting for next scan...</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={stage === "success" ? resetToScan : () => { if (stage !== "scan") resetToScan(); else onClose(); }}
                            className="px-4 py-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                        >
                            {stage === "success" ? "Scan Next" : "Cancel"}
                        </button>
                        {stage === "confirm" && (
                            <button
                                onClick={handleConfirm}
                                disabled={!canConfirm}
                                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${canConfirm ? "bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"}`}
                            >
                                {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                                Confirm Return To Inventory
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
