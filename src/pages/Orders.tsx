import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { Plus, Search, RefreshCw, MessageCircle, Phone, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ShippingStatusBadge } from "../components/ShippingStatusBadge";
import { Modal } from "../components/Modal";
import { CitySelector, type CitySelectorValue } from "../components/CitySelector";
import { supabase } from "../lib/supabase";
import { toast } from "../components/Toast";
import { createShipment as createShipmentViaEngine } from "../services/shippingService";
import { normalizeShippingStatus } from "../lib/shippingStatus";
import type { Order, ShipmentEvent, ShipmentRecord } from "../lib/types";
import { useAuth } from "../hooks/useAuth";
import { StatusSelect } from "../components/StatusSelect";
import { normalizeStatus, type CanonicalStatus } from "../lib/statusEngine";
import { normalizeStatus as getInternalStatus } from "../utils/status";
import { formatOzonAddress, initializeOzonCities } from "../services/ozonService";
import { useGlobalOrders } from "../contexts/OrdersContext";
import { isShippingModuleEnabled } from "../lib/shippingModule";
import MobileBottomSheet from "../components/MobileBottomSheet";
import { useLocation, useNavigate } from "react-router-dom";

function WhatsAppBadge({ status }: { status: string }) {
  if (!status) return null;
  const s = status.toLowerCase();

  if (s === 'delivered' || s === 'confirmed' || s.includes('success')) return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#25D366]"><MessageCircle size={12} /> {status}</span>;
  if (s === 'cancelled' || s === 'failed') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-danger/10 px-2 py-1 text-[11px] font-semibold text-danger"><MessageCircle size={12} /> {status}</span>;
  if (s === 'modified' || s === 'modify') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-500"><MessageCircle size={12} /> {status}</span>;
  return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-base-raised px-2 py-1 text-[11px] font-semibold text-ink-muted"><MessageCircle size={12} /> {status}</span>;
}

function ConfirmationMethodBadge({ method }: { method: string | null | undefined }) {
  if (!method) return null;
  if (method === 'whatsapp') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#25D366]" title="Confirmed via WhatsApp"><MessageCircle size={12} /></span>;
  if (method === 'call') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-500" title="Confirmed via phone call"><Phone size={12} /></span>;
  return null;
}

// Check if string contains Arabic characters
function isArabic(str: string): boolean {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicPattern.test(str);
}

// Normalize string for comparison
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim();
}

// Resolve city ID using ozon_cities table with Arabic support
async function resolveCityId(cityName: string): Promise<{ ozon_city_id: number | null; city_name: string }> {
  if (!cityName) return { ozon_city_id: null, city_name: "" };

  // If it's already a numeric ID, return it
  const trimmed = cityName.trim();
  if (/^\d+$/.test(trimmed)) {
    return { ozon_city_id: parseInt(trimmed, 10), city_name: cityName };
  }

  // Try Arabic name match first if input contains Arabic
  if (isArabic(cityName)) {
    const { data: arabicMatch } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .eq('arabic_name', cityName.trim())
      .single();

    if (arabicMatch) {
      const { data: cityData } = await supabase
        .from('ozon_cities')
        .select('name')
        .eq('id', arabicMatch.ozon_city_id)
        .single();
      if (cityData) return { ozon_city_id: arabicMatch.ozon_city_id, city_name: cityData.name };
    }

    // Try partial Arabic match
    const { data: arabicPartial } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .ilike('arabic_name', `%${cityName.trim()}%`)
      .limit(1);

    if (arabicPartial && arabicPartial.length > 0) {
      const { data: cityData } = await supabase
        .from('ozon_cities')
        .select('name')
        .eq('id', arabicPartial[0].ozon_city_id)
        .single();
      if (cityData) return { ozon_city_id: arabicPartial[0].ozon_city_id, city_name: cityData.name };
    }

    // If Arabic and no match, return null without fallback
    return { ozon_city_id: null, city_name: cityName };
  }

  const normalizedInput = normalizeString(cityName);

  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .eq('name', normalizedInput)
    .single();

  if (exactMatch) return { ozon_city_id: exactMatch.id, city_name: exactMatch.name };

  // Try alias match
  const { data: aliasMatch } = await supabase
    .from('city_aliases')
    .select('ozon_city_id')
    .eq('alias', normalizedInput)
    .single();

  if (aliasMatch) {
    const { data: cityData } = await supabase
      .from('ozon_cities')
      .select('name')
      .eq('id', aliasMatch.ozon_city_id)
      .single();
    if (cityData) return { ozon_city_id: aliasMatch.ozon_city_id, city_name: cityData.name };
  }

  // Fallback to substring match (only for Latin text)
  const { data: substringMatches } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .ilike('name', `%${normalizedInput}%`)
    .limit(1);

  if (substringMatches && substringMatches.length > 0) {
    return { ozon_city_id: substringMatches[0].id, city_name: substringMatches[0].name };
  }

  return { ozon_city_id: null, city_name: cityName };
}

function isConfirmedOrderStatus(status: string) {
  const internal = getInternalStatus(status);
  return internal === 'CONFIRMED' || internal === 'OUT_FOR_DELIVERY' || internal === 'DELIVERED' || internal === 'COMING_BACK';
}

function mad(n: number) {
  return `MAD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function isMissingAddressColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /address/i.test(error.message) && /(schema cache|column)/i.test(error.message));
}

const googleSheetSyncRequests = new Map<string, Promise<{ inserted: number; errors: string[] }>>();

/**
 * The app shell / manual refresh buttons call this function.
 * It invokes the backend edge function to run the sync reliably on the server.
 */
export async function runGoogleSheetSync(
  wid: string,
  url: string,
  onProgress?: (msg: string) => void,
): Promise<{ inserted: number; errors: string[] }> {
  const key = `${wid}:${url}`;
  const active = googleSheetSyncRequests.get(key);
  if (active) return active;

  const request = (async () => {
    try {
      onProgress?.('Contacting background sync service...');
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { workspace_id: wid }
      });
      if (error) throw error;
      return data?.results?.[wid] || { inserted: 0, errors: [] };
    } catch (err: any) {
      console.error("[runGoogleSheetSync] Edge function error:", err);
      return { inserted: 0, errors: [err.message] };
    }
  })().finally(() => {
    if (googleSheetSyncRequests.get(key) === request) googleSheetSyncRequests.delete(key);
  });

  googleSheetSyncRequests.set(key, request);
  return request;
}

export default function Orders() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace, refreshProfile } = useAuth();
  const { globalOrders: allOrders, loading, reloadGlobalOrders: reload } = useGlobalOrders();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "youcan" | "sheets" | "manual">("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  useEffect(() => {
    const navigationState = location.state as { createOrder?: boolean; viewOrderId?: string } | null;
    if (!navigationState?.createOrder) return;

    setShowNew(true);
    navigate(location.pathname, {
      replace: true,
      state: { ...navigationState, createOrder: false },
    });
  }, [location.key, location.pathname, location.state, navigate]);

  useEffect(() => {
    const requestedOrderId = (location.state as { viewOrderId?: string } | null)?.viewOrderId;
    if (!requestedOrderId || !allOrders.length) return;
    const requestedOrder = allOrders.find((order) => order.id === requestedOrderId);
    if (requestedOrder) setEditingOrder(requestedOrder);
    navigate(location.pathname, { replace: true, state: null });
  }, [allOrders, location.pathname, location.state, navigate]);

  // Infinite Scroll state
  const [visibleCount, setVisibleCount] = useState(50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight * 1.5) {
      setVisibleCount(prev => prev + 50);
    }
  };

  // Filter orders locally from the master dataset
  const orders = useMemo(() => {
    return allOrders.filter((o) => {
      // Status filter
      if (status !== "all" && normalizeStatus(o.status) !== normalizeStatus(status)) {
        return false;
      }

      // Source filter
      if (sourceFilter !== "all" && o.source !== sourceFilter) {
        return false;
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const haystack = `${o.order_number} ${o.customer?.name ?? o.customer_name ?? ''} ${o.customer?.phone} ${o.city} ${o.address}`.toLowerCase();
        return haystack.includes(searchLower);
      }

      return true;
    });
  }, [allOrders, status, sourceFilter, search]);

  const displayOrders = useMemo(() => orders.slice(0, visibleCount), [orders, visibleCount]);

  const showShippingColumn = workspace?.show_shipping_column ?? false;

  // Auto Sync states
  const [autoSync, setAutoSync] = useState(false);

  // Load autosync setting on mount/workspace change
  useEffect(() => {
    setAutoSync(Boolean(workspace?.google_sheet_autosync ?? false));
  }, [workspace?.id, workspace?.google_sheet_autosync]);

  // Note: Auto sync is now handled by backend cron job (every 2 seconds)
  // Frontend polling removed - sync works even when browser is closed

  const handleToggleAutoSync = async () => {
    if (!workspace?.id) return;
    const next = !autoSync;
    setAutoSync(next);

    const { error } = await supabase
      .from("workspaces")
      .update({ google_sheet_autosync: next })
      .eq("id", workspace.id);

    if (error) {
      setAutoSync(!next);
      console.error("[Orders] Unable to persist auto sync setting:", error);
      return;
    }

    await refreshProfile();
  };

  // Listen for global auto-sync reloads
  useEffect(() => {
    const onReload = () => reload(true);
    window.addEventListener("trigger-order-reload", onReload);
    return () => window.removeEventListener("trigger-order-reload", onReload);
  }, [reload]);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Full CRM for your COD orders — search, filter, edit, ship."
        action={
          <div className="grid w-full grid-cols-2 items-center gap-2 md:flex md:w-auto">
            <button
              onClick={handleToggleAutoSync}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-all md:min-h-0 md:rounded-lg md:text-[13px] ${autoSync
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-base-border bg-base-surface text-ink-muted hover:bg-base-raised hover:text-ink"
                }`}
            >
              <span className={`h-2 w-2 rounded-full ${autoSync ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
              {autoSync ? "Auto Sync: ON" : "Auto Sync: OFF"}
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-accentHover md:min-h-0 md:rounded-lg"
            >
              <Plus size={14} /> New order
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2 md:gap-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone..."
            className="w-full rounded-lg border border-base-border bg-base-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50"
          />
        </div>
        <StatusSelect
          value={status}
          onChange={(val) => setStatus(val)}
          includeAll={true}
          allLabel="All statuses"
          className="hidden rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink md:block"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "all" | "youcan" | "sheets" | "manual")}
          className="hidden rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink md:block"
        >
          <option value="all">All sources</option>
          <option value="youcan">YouCan</option>
          <option value="sheets">Google Sheets</option>
          <option value="manual">Manual</option>
        </select>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-base-border bg-base-surface text-ink-muted md:hidden"
          aria-label="Open order filters"
        >
          <SlidersHorizontal size={18} />
          {(status !== "all" || sourceFilter !== "all") && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand" />}
        </button>
        <div className="hidden text-[12.5px] text-ink-muted sm:block">{orders.length} orders</div>
      </div>

      <MobileBottomSheet isOpen={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="Filter orders">
        <div className="space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">
            Order status
            <StatusSelect
              value={status}
              onChange={setStatus}
              includeAll
              allLabel="All statuses"
              className="mt-2 min-h-12 w-full rounded-xl border border-base-border bg-base-raised px-3 text-base text-ink"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">
            Source
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as "all" | "youcan" | "sheets" | "manual")}
              className="mt-2 min-h-12 w-full rounded-xl border border-base-border bg-base-raised px-3 text-base text-ink"
            >
              <option value="all">All sources</option>
              <option value="youcan">YouCan</option>
              <option value="sheets">Google Sheets</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button type="button" onClick={() => { setStatus("all"); setSourceFilter("all"); }} className="min-h-12 rounded-xl border border-base-border font-bold text-ink-muted">Reset</button>
            <button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-12 rounded-xl bg-brand font-bold text-white">Show {orders.length} orders</button>
          </div>
        </div>
      </MobileBottomSheet>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-base-border bg-base-surface shadow-card max-h-[100vh] lg:max-h-[calc(100vh-180px)] overflow-y-auto relative" ref={scrollContainerRef} onScroll={handleScroll}>
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-base-surface z-10 shadow-sm">
            <tr className="border-b border-base-border text-left text-[12px] text-ink-muted">
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Total</th>
              {showShippingColumn && <th className="px-4 py-3 font-medium">Shipping</th>}
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Variant</th>
              <th className="px-4 py-3 font-medium">Tracking</th>
              <th className="px-4 py-3 font-medium min-w-[120px]">Status</th>
              <th className="px-4 py-3 font-medium min-w-[140px]">Shipping Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={showShippingColumn ? 13 : 12} className="px-4 py-10 text-center text-ink-muted">
                  Loading orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={showShippingColumn ? 13 : 12}>
                  <EmptyState title="No orders found" subtitle={`No orders matching the selected source filter.`} />
                </td>
              </tr>
            ) : (
              displayOrders.map((o: Order & { delivery_status?: string | null }) => (
                <tr
                  key={o.id || o.order_number}
                  onClick={() => setEditingOrder(o)}
                  className="border-b border-base-border last:border-0 hover:bg-base-raised/60 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-ink">{o.order_number}</td>
                  <td className="px-4 py-3 text-ink">{o.customer_name ?? o.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted font-mono">{o.phone ?? o.customer?.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.city ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.address ? o.address : "No address"}</td>
                  <td className="px-4 py-3 font-mono text-ink">{mad(o.total)}</td>
                  {showShippingColumn && (
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {(o as any).ozon_city_id === null ? (
                        <span className="text-warning text-[11px]">Ville à vérifier</span>
                      ) : (o as any).shipping_cost !== null ? (
                        <span>{mad((o as any).shipping_cost)}</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-ink-muted font-mono">{o.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.product_variant ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink-muted">{o.tracking_number ?? o.coliaty_parcel_code ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {/* Status column ALWAYS shows order.status (confirmation workflow) */}
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={o.status} />
                      <ConfirmationMethodBadge method={(o as any).confirmation_method} />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap flex flex-col gap-1 items-start">
                    <ShippingStatusBadge status={o.shipping_status} />
                    {o.whatsapp_status && <WhatsAppBadge status={o.whatsapp_status} />}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-3 pb-8">
        {loading && orders.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-4 w-32 bg-base-raised rounded mb-2" />
                  <div className="h-3 w-24 bg-base-raised rounded" />
                </div>
                <div className="h-5 w-16 bg-base-raised rounded" />
              </div>
              <div className="flex gap-2 justify-between items-center">
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-base-raised rounded-full" />
                  <div className="h-5 w-16 bg-base-raised rounded-full" />
                </div>
                <div className="h-4 w-12 bg-base-raised rounded" />
              </div>
            </div>
          ))
        ) : orders.length === 0 ? (
          <EmptyState title="No orders yet" subtitle="New orders will show up here." />
        ) : (
          displayOrders.map((o: Order & { delivery_status?: string | null }) => (
            <div
              key={o.order_number}
              onClick={() => setEditingOrder(o)}
              className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl relative overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[16px] font-bold text-ink mb-0.5">{o.customer_name ?? o.customer?.name ?? "Unknown"}</div>
                  <div className="text-[13px] text-ink-muted">{o.city || "No City"} • <span className="font-mono text-ink-muted">{o.phone ?? o.customer?.phone ?? "No phone"}</span></div>
                  <div className="mt-2 text-[12px] text-ink-muted">Address: {o.address ? o.address : "No address"}</div>
                  {showShippingColumn && (
                    <div className="mt-1 text-[12px] text-ink-muted">
                      Shipping: {(o as any).ozon_city_id === null ? (
                        <span className="text-warning">Ville à vérifier</span>
                      ) : (o as any).shipping_cost !== null ? (
                        <span className="font-mono">{mad((o as any).shipping_cost)}</span>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-[16px] font-bold text-ink tracking-tight">{mad(o.total)}</div>
                  <div className="font-mono text-[11px] text-ink-muted mt-0.5">{o.order_number}</div>
                </div>
              </div>

              {/* Product details preview */}
              {(o.product_variant || o.sku) && (
                <div className="bg-base-raised/30 rounded-lg p-2.5 mb-4 text-[13px] text-ink">
                  <span className="text-ink font-medium">{o.product_variant || "Product"}</span>
                  {o.sku && <span className="text-ink-muted font-mono ml-2 text-[11.5px] px-1.5 py-0.5 bg-base-raised rounded">{o.sku}</span>}
                </div>
              )}

              <div className="flex gap-2 items-center justify-between">
                {/* Statuses - Status badge shows order.status, Shipping Status badge shows order.shipping_status */}
                <div className="flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide py-0.5">
                  <StatusBadge status={o.status} />
                  <ConfirmationMethodBadge method={(o as any).confirmation_method} />
                  <ShippingStatusBadge status={o.shipping_status} />
                  {o.whatsapp_status && <WhatsAppBadge status={o.whatsapp_status} />}
                </div>
                <div className="text-[11px] text-ink-muted font-medium">
                  {new Date(o.created_at).toLocaleDateString("en-GB", { month: 'short', day: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showNew && (
        <NewOrderModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            reload(true);
          }}
        />
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onUpdated={() => {
            setEditingOrder(null);
            reload(true);
          }}
        />
      )}
    </div>
  );
}

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { workspace } = useAuth();
  const carrier = workspace?.carrier || 'ozon';
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityValue, setCityValue] = useState<CitySelectorValue>({ ozon_city_id: null, city_name: "" });
  const [address, setAddress] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Diagnostic: log the current workspace state
    console.log("[NewOrder] workspace:", workspace);
    if (!workspace?.id) {
      setError("ERROR: workspace is not loaded. workspace = " + JSON.stringify(workspace));
      return;
    }

    if (carrier === 'ozon' ? !cityValue.ozon_city_id : !cityValue.carrier_city_id) {
      setError("Please select a city from the dropdown");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const custPayload = { name, phone, city: cityValue.city_name, workspace_id: workspace.id };
      console.log("[NewOrder] Inserting customer:", custPayload);

      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert(custPayload)
        .select()
        .single();

      if (custErr) {
        console.error("[NewOrder] Customer INSERT failed:", {
          code: custErr.code,
          message: custErr.message,
          details: custErr.details,
          hint: custErr.hint,
        });
        throw new Error(`Customer insert failed: [${custErr.code}] ${custErr.message}${custErr.details ? " — " + custErr.details : ""}${custErr.hint ? " (hint: " + custErr.hint + ")" : ""}`);
      }

      // Calculate shipping cost using Smart Pricing Engine
      let shippingCost = null;
      if (cityValue.ozon_city_id) {
        const { data: cityData } = await supabase
          .from("ozon_cities")
          .select("delivered_price")
          .eq("id", cityValue.ozon_city_id)
          .single();
        if (cityData && cityData.delivered_price) {
          shippingCost = cityData.delivered_price;
        } else {
          // Fallback to business delivery fee
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("business_delivery_fee")
            .eq("id", workspace.id)
            .single();
          shippingCost = workspaceData?.business_delivery_fee || 35;
        }
      }
      if (carrier === 'sendit' && cityValue.carrier_city_price != null) {
        shippingCost = cityValue.carrier_city_price;
      }

      const orderNumber = `#${Math.floor(1000 + Math.random() * 9000)}`;
      const orderPayload = {
        order_number: orderNumber,
        customer_id: customer.id,
        customer_name: name,
        city: cityValue.city_name,
        raw_city: cityValue.raw_city || cityValue.city_name,
        provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
        ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
        coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
        city_name: cityValue.city_name,
        address,
        total: Number(total),
        status: "pending",
        workspace_id: workspace.id,
        shipping_cost: shippingCost,
      };
      console.log("[NewOrder] Inserting order:", orderPayload);

      const { error: orderErr } = await supabase.from("orders").insert(orderPayload);
      if (orderErr) {
        console.error("[NewOrder] Order INSERT failed:", {
          code: orderErr.code,
          message: orderErr.message,
          details: orderErr.details,
          hint: orderErr.hint,
        });
        throw new Error(`Order insert failed: [${orderErr.code}] ${orderErr.message}${orderErr.details ? " — " + orderErr.details : ""}${orderErr.hint ? " (hint: " + orderErr.hint + ")" : ""}`);
      }

      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New order" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Customer name" value={name} onChange={setName} required />
        <Field label="Phone" value={phone} onChange={setPhone} required />
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">City <span className="text-danger">*</span></label>
          <CitySelector
            value={cityValue}
            onChange={setCityValue}
            placeholder="Search city..."
            required
            carrier={carrier}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
            placeholder="Enter delivery address"
          />
        </div>
        <Field label="Total (MAD)" value={total} onChange={setTotal} type="number" required />
        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-brand-accent py-2 text-[13px] font-medium text-white hover:bg-brand-accentHover disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create order"}
        </button>
      </form>
    </Modal>
  );
}

function EditOrderModal({ order, onClose, onUpdated }: { order: Order; onClose: () => void; onUpdated: () => void }) {
  const { workspace } = useAuth();
  const carrier = workspace?.carrier || 'ozon';

  const [name, setName] = useState(order.customer?.name || "");
  const [phone, setPhone] = useState(order.phone || order.customer?.phone || "");
  const [cityValue, setCityValue] = useState<CitySelectorValue>({
    ozon_city_id: (order as any).ozon_city_id || null,
    carrier_city_id: carrier === 'sendit' ? Number((order as any).provider_city_id) || null : (order as any).coliaty_city_id || null,
    city_name: (order as any).city_name || order.city || "",
    raw_city: (order as any).raw_city || (order as any).city_name || order.city || "",
  });
  const [address, setAddress] = useState(order.address || "");
  const [total, setTotal] = useState(String(order.total));
  const [status, setStatus] = useState<CanonicalStatus>(normalizeStatus(order.status));
  const [deliveryStatus, setDeliveryStatus] = useState<CanonicalStatus>(
    normalizeStatus(order.delivery_status ?? (isConfirmedOrderStatus(order.status) ? "pending" : ""))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsappLogs, setWhatsappLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!order.id) return;
    supabase.from("whatsapp_messages")
      .select("id, direction, message_type, status, body, created_at")
      .eq("workspace_id", workspace?.id)
      .eq("order_id", order.id)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => { if (data) setWhatsappLogs(data); });
  }, [order.id, workspace?.id]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isConfirmedOrderStatus(status)) {
        const fullAddr = formatOzonAddress(address, cityValue.city_name);
        if (!fullAddr || fullAddr.length < 5) {
          setError("L'adresse de livraison est trop courte (minimum 5 caractères requis pour la livraison). Veuillez la compléter.");
          setBusy(false);
          return;
        }
      }

      console.log("[EditOrderModal] === STARTING ORDER UPDATE ===");
      console.log("[EditOrderModal] Full order object:", order);
      console.log("[EditOrderModal] order.id:", order.id);
      console.log("[EditOrderModal] order['Order ID']:", (order as any)["Order ID"]);
      console.log("[EditOrderModal] order.order_number:", order.order_number);
      console.log("[EditOrderModal] workspace?.id:", workspace?.id);

      const orderKey = (order as any)["Order ID"] ? '"Order ID"' : 'id';
      const orderId = (order as any)["Order ID"] || order.id;
      console.log("[EditOrderModal] Using order key for update:", orderKey, orderId);

      if (!orderId) {
        throw new Error("Order ID is missing. Cannot update order. order.id=" + order.id + ", order['Order ID']=" + (order as any)["Order ID"]);
      }

      // CRITICAL: First verify the order exists with workspace filter
      console.log("[EditOrderModal] Verifying order exists with workspace filter...");
      const { data: existingOrder, error: checkError } = await supabase
        .from("orders")
        .select(`${orderKey}, workspace_id, order_number`)
        .eq(orderKey, orderId)
        .eq("workspace_id", workspace?.id)
        .single();

      console.log("[EditOrderModal] Existing order check:", existingOrder);
      console.log("[EditOrderModal] Existing order check error:", checkError);

      if (checkError) {
        console.error("[EditOrderModal] Order check failed with error:", checkError);
        throw new Error(`Order lookup failed. Order ID: ${orderId}, Workspace: ${workspace?.id}, Error: ${checkError.message}. This might be an RLS permission issue.`);
      }

      if (!existingOrder) {
        console.error("[EditOrderModal] Order not found in database with workspace filter");
        throw new Error(`Order not found in database with workspace filter. Order ID: ${orderId}, Workspace: ${workspace?.id}. This means either the order doesn't exist, or you don't have permission to access it in this workspace.`);
      }

      console.log("[EditOrderModal] Order verified, proceeding with update");

      if (order.customer_id) {
        console.log("[EditOrderModal] Updating customer:", order.customer_id);
        const customerUpdate = await supabase.from("customers").update({ name, phone, city: cityValue.city_name }).eq("id", order.customer_id).eq("workspace_id", workspace?.id).select();
        console.log("[EditOrderModal] Customer update response:", customerUpdate);
        if (customerUpdate.error) {
          console.error("[EditOrderModal] Customer update failed:", customerUpdate.error);
        } else if (!customerUpdate.data || customerUpdate.data.length === 0) {
          console.warn("[EditOrderModal] Customer update affected 0 rows");
        }
      }

      // Calculate shipping cost using Smart Pricing Engine
      let shippingCost = null;
      const cityId = cityValue.ozon_city_id || order.ozon_city_id;
      if (cityId) {
        const { data: cityData } = await supabase
          .from("ozon_cities")
          .select("delivered_price")
          .eq("id", cityId)
          .single();
        if (cityData && cityData.delivered_price) {
          shippingCost = cityData.delivered_price;
        } else {
          // Fallback to business delivery fee
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("business_delivery_fee")
            .eq("id", workspace?.id)
            .single();
          shippingCost = workspaceData?.business_delivery_fee || 35;
        }
      }
      if (carrier === 'sendit' && cityValue.carrier_city_price != null) {
        shippingCost = cityValue.carrier_city_price;
      }

      const updatePayload: Record<string, any> = {
        customer_name: name,
        city: cityValue.city_name,
        raw_city: cityValue.raw_city || cityValue.city_name,
        provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
        ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
        coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
        city_name: cityValue.city_name,
        address,
        total: Number(total),
        status: normalizeStatus(status),
        delivery_status: normalizeShippingStatus(deliveryStatus),
        phone,
        shipping_cost: shippingCost,
      };

      // Track confirmation method for manual confirmations
      const newStatus = normalizeStatus(status);
      if (newStatus === 'confirmed' && order.status !== 'confirmed') {
        updatePayload.confirmation_method = 'call';
        updatePayload.confirmed_at = new Date().toISOString();
      }

      console.log("[EditOrderModal] Update payload:", updatePayload);

      console.log("[EditOrderModal] Executing update query...");
      console.log("[EditOrderModal] Query: UPDATE orders SET ... WHERE", orderKey, "=", orderId, "AND workspace_id =", workspace?.id);

      const query = supabase.from("orders").update(updatePayload);
      const response = await query.eq(orderKey, orderId).eq("workspace_id", workspace?.id).select();

      console.log("[EditOrderModal] Update response:", response);
      console.log("[EditOrderModal] Response data:", response.data);
      console.log("[EditOrderModal] Response error:", response.error);
      console.log("[EditOrderModal] Rows affected:", response.data?.length || 0);

      if (response.error) {
        console.error("[EditOrderModal] Update failed:", response.error);
        if (isMissingAddressColumnError(response.error)) {
          const fallbackPayload: Record<string, any> = {
            customer_name: name,
            city: cityValue.city_name,
            raw_city: cityValue.raw_city || cityValue.city_name,
            provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
            ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
            coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
            city_name: cityValue.city_name,
            total: Number(total),
            status: normalizeStatus(status),
            delivery_status: normalizeShippingStatus(deliveryStatus),
            phone,
          };

          // Track confirmation method for manual confirmations (fallback path)
          if (newStatus === 'confirmed' && order.status !== 'confirmed') {
            fallbackPayload.confirmation_method = 'call';
            fallbackPayload.confirmed_at = new Date().toISOString();
          }
          const fallbackQuery = supabase.from("orders").update(fallbackPayload);
          const fallbackResponse = await fallbackQuery.eq('"Order ID"', orderId).eq("workspace_id", workspace?.id).select();

          console.log("[EditOrderModal] Fallback response:", fallbackResponse);
          console.log("[EditOrderModal] Fallback data:", fallbackResponse.data);
          console.log("[EditOrderModal] Fallback rows affected:", fallbackResponse.data?.length || 0);

          if (fallbackResponse.error) {
            console.error("[EditOrderModal] Fallback update also failed:", fallbackResponse.error);
            throw fallbackResponse.error;
          }

          if (!fallbackResponse.data || fallbackResponse.data.length === 0) {
            throw new Error("No rows were updated (fallback). Check if Order ID and workspace ID are correct.");
          }
        } else {
          throw response.error;
        }
      }

      if (!response.data || response.data.length === 0) {
        throw new Error("No rows were updated. Check if Order ID and workspace ID are correct.");
      }

      console.log("[EditOrderModal] Update successful, rows affected:", response.data.length);
      toast.success("Order updated successfully");
      onUpdated();
    } catch (err: any) {
      console.error("[EditOrderModal] Error saving order:", err);
      setError(err.message ?? "Something went wrong");
      toast.error(err.message ?? "Failed to update order");
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    setBusy(true);
    try {
      console.log("[EditOrderModal] === STARTING ORDER DELETE ===");
      console.log("[EditOrderModal] Full order object:", order);
      console.log("[EditOrderModal] order.id:", order.id);
      console.log("[EditOrderModal] order['Order ID']:", (order as any)["Order ID"]);
      console.log("[EditOrderModal] order.order_number:", order.order_number);
      console.log("[EditOrderModal] workspace?.id:", workspace?.id);

      // Use the correct primary key: "Order ID" (with space)
      const orderId = (order as any)["Order ID"] || order.id;
      console.log("[EditOrderModal] Using order ID for delete:", orderId);

      if (!orderId) {
        throw new Error("Order ID is missing. Cannot delete order.");
      }

      // CRITICAL: Verify the order exists with workspace filter
      console.log("[EditOrderModal] Verifying order exists before delete...");
      const orderKey = (order as any)["Order ID"] ? '"Order ID"' : 'id';
      const { data: existingOrder, error: checkError } = await supabase
        .from("orders")
        .select(`${orderKey}, workspace_id, order_number`)
        .eq(orderKey, orderId)
        .eq("workspace_id", workspace?.id)
        .single();

      console.log("[EditOrderModal] Existing order check:", existingOrder);
      console.log("[EditOrderModal] Existing order check error:", checkError);

      if (checkError) {
        console.error("[EditOrderModal] Order check failed with error:", checkError);
        throw new Error(`Order lookup failed. Order ID: ${orderId}, Workspace: ${workspace?.id}, Error: ${checkError.message}. This might be an RLS permission issue.`);
      }

      if (!existingOrder) {
        console.error("[EditOrderModal] Order not found in database with workspace filter");
        throw new Error(`Order not found in database with workspace filter. Order ID: ${orderId}, Workspace: ${workspace?.id}. This means either the order doesn't exist, or you don't have permission to access it in this workspace.`);
      }

      console.log("[EditOrderModal] Order verified, proceeding with delete");
      console.log("[EditOrderModal] Executing delete query...");
      console.log("[EditOrderModal] Query: DELETE FROM orders WHERE", orderKey, "=", orderId, "AND workspace_id =", workspace?.id);

      const query = supabase.from("orders").delete();
      const response = await query.eq(orderKey, orderId).eq("workspace_id", workspace?.id).select();

      console.log("[EditOrderModal] Delete response:", response);
      console.log("[EditOrderModal] Delete data:", response.data);
      console.log("[EditOrderModal] Rows deleted:", response.data?.length || 0);

      if (response.error) {
        console.error("[EditOrderModal] Delete failed:", response.error);
        throw response.error;
      }

      if (!response.data || response.data.length === 0) {
        throw new Error("No rows were deleted. Check if Order ID and workspace ID are correct.");
      }

      console.log("[EditOrderModal] Delete successful, rows deleted:", response.data.length);
      toast.success("Order deleted successfully");
      onUpdated();
    } catch (err: any) {
      console.error("[EditOrderModal] Error deleting order:", err);
      setError(err.message ?? "Unable to delete order");
      toast.error(err.message ?? "Failed to delete order");
      setBusy(false);
    }
  };

  const canCreateShipment = isConfirmedOrderStatus(order.status) && !order.tracking_number;

  return (
    <Modal title={`Edit Order ${order.order_number}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Customer name" value={name} onChange={setName} required />
        <Field label="Phone" value={phone} onChange={setPhone} required />
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">City</label>
          <CitySelector
            value={cityValue}
            onChange={setCityValue}
            placeholder="Search city..."
            required
            showWarning={Boolean(
              (carrier === 'ozon' ? !cityValue.ozon_city_id : !cityValue.carrier_city_id) &&
              cityValue.city_name
            )}
            carrier={carrier}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
            placeholder="Enter delivery address"
          />
        </div>
        <Field label="Total (MAD)" value={total} onChange={setTotal} type="number" required />

        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Shipping Status</label>
          <StatusSelect
            value={deliveryStatus}
            onChange={(val) => setDeliveryStatus(val)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Status</label>
          <StatusSelect
            value={status}
            onChange={(val) => setStatus(val as CanonicalStatus)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 outline-none"
          />
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}

        {whatsappLogs.length > 0 && (
          <div className="mt-2 rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-[#25D366] uppercase tracking-wide">
              <MessageCircle size={12} /> WhatsApp History
            </div>
            <div className="flex flex-col gap-2">
              {whatsappLogs.map((log) => (
                <div key={log.id} className={`text-[12px] leading-snug ${log.direction === 'outbound' ? 'text-ink-muted' : 'text-ink font-medium'}`}>
                  <span className="text-[10px] font-bold uppercase mr-1.5">{log.direction === 'outbound' ? 'Store' : 'Customer'}:</span>
                  {log.body}
                  {log.status && <span className="ml-1.5 rounded bg-base-raised px-1 py-0.5 text-[8px] uppercase text-ink-faint">{log.status}</span>}
                  <span className="ml-1.5 text-[9px] text-ink-muted/60">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg bg-danger/10 px-4 py-2 text-[13px] font-medium text-danger hover:bg-danger/20 disabled:opacity-60"
          >
            Delete
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-brand-accent py-2 text-[13px] font-medium text-white hover:bg-brand-accentHover disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>


        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] text-ink-muted">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
      />
    </div>
  );
}



