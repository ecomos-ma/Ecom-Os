import {
  Inbox,
  Phone,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  MessageCircle,
} from "lucide-react";
import { useState, useRef, useMemo, useCallback } from "react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { toast } from "../components/Toast";
import { useOrders } from "../hooks/useOrders";
import { StatusBadge } from "../components/StatusBadge";
import { ShippingStatusBadge } from "../components/ShippingStatusBadge";
import { StatusSelect } from "../components/StatusSelect";
import { normalizeStatus, normalizeStatusOrNull, getStatusLabel, type CanonicalStatus } from "../lib/statusEngine";
import { getShippingStatusLabel, normalizeShippingStatus, type ShippingLanguage } from "../lib/shippingStatus";
import { supabase } from "../lib/supabase";
import { useI18n } from "../i18n";
import { isShippingModuleEnabled } from "../lib/shippingModule";
import { ShippingModuleDisabled } from "../components/ShippingModuleDisabled";
import { useAuth } from "../hooks/useAuth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mad(n: number) {
  return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

function isConfirmedOrderStatus(status?: string | null) {
  return normalizeStatusOrNull(status) === "confirmed";
}

function isNotProcessedOrder(o: any) {
  return isConfirmedOrderStatus(o.status) && (!o.shipping_status || o.shipping_status === 'pending');
}

// ─── Tab Configuration ────────────────────────────────────────────────────────────

const SHIPPING_TAB_CONFIG = [
  { id: "ready", canonicalIds: [], labelId: "ready" },
  { id: "new_parcel", canonicalIds: ["NEW_PARCEL"], labelId: "NEW_PARCEL" },
  { id: "waiting_pickup", canonicalIds: ["WAITING_PICKUP"], labelId: "WAITING_PICKUP" },
  { id: "picked_up", canonicalIds: ["PICKED_UP"], labelId: "PICKED_UP" },
  { id: "received_warehouse", canonicalIds: ["RECEIVED_AT_WAREHOUSE"], labelId: "RECEIVED_AT_WAREHOUSE" },
  { id: "in_distribution", canonicalIds: ["IN_DISTRIBUTION"], labelId: "IN_DISTRIBUTION" },
  { id: "out_for_delivery", canonicalIds: ["OUT_FOR_DELIVERY"], labelId: "OUT_FOR_DELIVERY" },
  { id: "delivered", canonicalIds: ["DELIVERED"], labelId: "DELIVERED" },
  { id: "no_answer", canonicalIds: ["NO_ANSWER"], labelId: "NO_ANSWER" },
  { id: "refused", canonicalIds: ["REFUSED"], labelId: "REFUSED" },
  { id: "returned", canonicalIds: ["RETURNED_TO_SENDER"], labelId: "RETURNED_TO_SENDER" },
  { id: "canceled", canonicalIds: ["CANCELED"], labelId: "CANCELED" },
  { id: "all", canonicalIds: [], labelId: "all" },
];



export default function Shipping() {
  const { orders, loading, reload } = useOrders({ status: "all" });
  const { language } = useI18n();

  const [activeTab, setActiveTab] = useState("ready");
  const [draftStatus, setDraftStatus] = useState<Record<string, string>>({});
  const [savingOrders, setSavingOrders] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismissTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 1. Filter out ONLY confirmed orders for shipping workflow
  const shippingPipelineOrders = useMemo(() => {
    return orders.filter((o) => {
      const s = o.status;
      if (!s) return false;
      return isConfirmedOrderStatus(s);
    });
  }, [orders]);

  const handleDraftChange = useCallback((orderNumber: string, newStatus: string) => {
    setDraftStatus((prev) => ({ ...prev, [orderNumber]: newStatus }));
  }, []);

  const displayStatus = (o: any): string => {
    if (draftStatus[o.order_number]) return draftStatus[o.order_number];
    // Use shipping_status as the single source of truth - no fallbacks
    // Normalize to ensure we return the internal code
    const rawStatus = o.shipping_status || "";
    const normalized = normalizeShippingStatus(rawStatus);
    return normalized || rawStatus;
  };

  const handleSave = useCallback(async (o: any) => {
    const orderNumber = o.order_number as string;
    const newShippingStatus = displayStatus(o);

    // Prevent manual status changes if order has a tracking number
    if (o.tracking_number && o.tracking_number.trim() !== "") {
      toast.error(`Cannot manually change status for order ${orderNumber}. It has a tracking number and is managed by the shipping provider.`);
      return;
    }

    if (savingOrders[orderNumber]) return;
    setSavingOrders((prev) => ({ ...prev, [orderNumber]: true }));

    try {
      // Only update shipping_status - never modify order.status
      // The order.status field is managed exclusively by the Confirmation module
      const payload: Record<string, unknown> = { shipping_status: newShippingStatus };

      const { error } = await supabase
        .from("orders")
        .update(payload)
        .eq("order_number", orderNumber);

      if (error) throw error;

      setDraftStatus((prev) => {
        const next = { ...prev };
        delete next[orderNumber];
        return next;
      });

      toast.success(`Order ${orderNumber} shipping: ${newShippingStatus} ✓`);

      // Optionally slide-out if it no longer belongs to current tab
      const tabConfig = SHIPPING_TAB_CONFIG.find(t => t.id === activeTab);
      if (activeTab !== "all" && tabConfig && !tabConfig.canonicalIds.includes(newShippingStatus)) {
        setDismissed((prev) => new Set(prev).add(orderNumber));
        dismissTimers.current[orderNumber] = setTimeout(() => {
          setDismissed((prev) => {
            const next = new Set(prev);
            next.delete(orderNumber);
            return next;
          });
          reload();
        }, 450);
      } else {
        reload(); // just refresh global data silently
      }

    } catch (err: any) {
      toast.error(`Error : ${err.message ?? "Unable to save."}`);
    } finally {
      setSavingOrders((prev) => ({ ...prev, [orderNumber]: false }));
    }
  }, [draftStatus, activeTab, reload]);

  const filteredOrders = useMemo(() => {
    return shippingPipelineOrders.filter((orderParam) => {
      const o = orderParam as any;
      const tabConfig = SHIPPING_TAB_CONFIG.find(t => t.id === activeTab);
      if (!tabConfig) return true;

      if (tabConfig.id === "all") {
        // "All" tab already filtered by shippingPipelineOrders to only show confirmed orders
        // Just return true since shippingPipelineOrders is already filtered
        return true;
      }

      if (tabConfig.id === "ready") {
        // In Shipping page, "ready" means confirmed orders that haven't been sent to shipping provider yet
        // (i.e., status is Confirmed/Confirmé and shipping_status is empty)
        return isConfirmedOrderStatus(o.status) && (!o.shipping_status || String(o.shipping_status).trim() === "");
      }

      // Normalize the shipping status for comparison
      const rawStatus = o.shipping_status || "";
      const normalizedStatus = normalizeShippingStatus(rawStatus);
      return normalizedStatus && tabConfig.canonicalIds.includes(normalizedStatus);
    });
  }, [shippingPipelineOrders, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    SHIPPING_TAB_CONFIG.forEach(t => counts[t.id] = 0);
    counts['all'] = shippingPipelineOrders.length;

    for (const orderParam of shippingPipelineOrders) {
      const o = orderParam as any;
      if (isConfirmedOrderStatus(o.status) && (!o.shipping_status || String(o.shipping_status).trim() === "")) {
        counts['ready']++;
      } else {
        const rawStatus = o.shipping_status || "";
        const normalizedStatus = normalizeShippingStatus(rawStatus);

        // Find matching tab
        for (const tab of SHIPPING_TAB_CONFIG) {
          if (tab.canonicalIds.includes(normalizedStatus || rawStatus)) {
            counts[tab.id]++;
            break;
          }
        }
      }
    }
    return counts;
  }, [shippingPipelineOrders]);

  // ─── Render ─────────────────────────────────────────────────────────────
  const { workspace } = useAuth();
  
  // Check if shipping module is enabled
  if (!isShippingModuleEnabled(workspace)) {
    return <ShippingModuleDisabled />;
  }

  return (
    <div className="flex flex-col h-full">

      <PageHeader
        title="Shipping CRM"
        subtitle="Manage your delivery tracking."
      />

      <div
        className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {SHIPPING_TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id] || 0;
          let label: string;
          if (tab.labelId === "all") {
            label = "All";
          } else if (tab.labelId === "ready") {
            label = "Ready To Send";
          } else {
            label = getShippingStatusLabel(tab.labelId, language as ShippingLanguage);
          }
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-1.5
                text-[12px] font-medium transition-all duration-150 whitespace-nowrap border
                ${isActive
                  ? tab.id === "all" ? "bg-base-raised text-ink border-base-border" : "bg-brand-accent text-white border-brand-accent/20"
                  : "bg-base-surface border-base-border text-ink-muted hover:text-ink hover:bg-base-raised"
                }
              `}
            >
              {label}
              <span
                className={`
                  inline-flex items-center justify-center rounded-full
                  min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none
                  ${isActive ? "bg-white/20 text-white" : "bg-base-raised text-ink-faint"}
                `}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {loading && filteredOrders.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[74px] rounded-xl bg-base-surface border border-base-border animate-pulse"
              />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-base-surface border border-base-border rounded-xl">
            <EmptyState
              icon={<Inbox size={20} />}
              title={`No orders — "${activeTab}"`}
              subtitle="Statuses will update here as they are processed."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredOrders.map((o: any) => {
              const orderNumber = o.order_number as string;
              const customerName = o.customer?.name ?? o.customer_name ?? "—";
              const phone = o.phone ?? o.customer?.phone ?? "—";
              const city = o.city ?? "—";
              const dateStr = new Date(o.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              });

              // ─── Formatting WhatsApp Link ──────────────────────────────
              const cleanPhone = phone.replace(/\D/g, "");
              const waPhone = cleanPhone.startsWith("0") ? "212" + cleanPhone.substring(1) : cleanPhone;
              const waMessage = encodeURIComponent("Hello, we would like to inform you about the delivery status of your order.");
              // ───────────────────────────────────────────────────────────

              const currentDispStatus = displayStatus(o);
              const isDirty = currentDispStatus !== (o.delivery_status || "pending");
              const isSaving = savingOrders[orderNumber] ?? false;
              const isDismissing = dismissed.has(orderNumber);
              const hasTrackingNumber = o.tracking_number && o.tracking_number.trim() !== "";

              return (
                <div
                  key={orderNumber}
                  id={`order-row-${orderNumber}`}
                  style={{
                    transition: "opacity 400ms ease, transform 400ms ease",
                    opacity: isDismissing ? 0 : 1,
                    transform: isDismissing ? "translateX(24px)" : "translateX(0)",
                    pointerEvents: isDismissing ? "none" : undefined,
                  }}
                  className="
                    group flex flex-col md:flex-row md:items-center justify-between gap-3
                    px-4 py-3.5 rounded-xl border border-base-border bg-base-surface
                    hover:border-brand/30 hover:bg-base-raised/40
                    shadow-sm
                  "
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2 overflow-x-auto whitespace-nowrap">
                      <span className="font-mono font-bold text-[13.5px] text-ink tracking-tight">
                        {orderNumber}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-base-raised border border-base-border px-2 py-0.5 text-[11.5px] font-semibold text-ink-muted">
                        {customerName}
                      </span>
                      <ShippingStatusBadge status={o.shipping_status} size="sm" />
                      {isDirty && (
                        <span className="text-[10.5px] text-amber-600 font-medium italic">
                          unsaved
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                      <span className="flex items-center gap-1 font-mono">
                        📞 {phone}
                      </span>
                      {city !== "—" && (
                        <span className="flex items-center gap-1">
                          📍 {city}
                        </span>
                      )}
                      {o.address ? (
                        <span className="flex items-center gap-1">
                          🏠 {o.address}
                        </span>
                      ) : null}
                      {(o.product_variant || o.sku) && (
                        <span className="flex items-center gap-1 truncate max-w-[150px] font-medium text-ink/80 rounded bg-base-border/30 px-1 py-0.5 mt-[-2px]">
                          📦 {o.product_variant || o.sku}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-bold text-emerald-600 text-[12.5px]">
                        {mad(o.total)}
                      </span>
                      <span className="flex items-center gap-1">
                        🗓 {dateStr}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">

                    {/* ── Bouton Appeler ── */}
                    <a
                      id={`btn-call-${orderNumber}`}
                      href={phone !== "—" ? `tel:${phone}` : undefined}
                      className="
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                        bg-sky-500/10 border border-sky-500/20 text-sky-400
                        hover:bg-sky-500/20 hover:border-sky-500/35
                        text-[12px] font-semibold transition-all
                      "
                    >
                      <Phone size={12} strokeWidth={2.5} />
                      Call
                    </a>

                    {/* ── Bouton WhatsApp ── */}
                    <a
                      id={`btn-wa-${orderNumber}`}
                      href={phone !== "—" ? `https://wa.me/${waPhone}?text=${waMessage}` : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                        bg-emerald-500/10 border border-emerald-500/20 text-emerald-500
                        hover:bg-emerald-500/20 hover:border-emerald-500/35
                        text-[12px] font-semibold transition-all
                      "
                    >
                      <MessageCircle size={12} strokeWidth={2.5} />
                      WhatsApp
                    </a>

                    <StatusSelect
                      value={currentDispStatus}
                      onChange={(val) => handleDraftChange(orderNumber, val)}
                      disabled={hasTrackingNumber}
                      className={`
                        appearance-none rounded-lg px-3 py-1.5
                        text-[11.5px] font-semibold cursor-pointer
                        outline-none transition-all
                        ${isDirty ? "!border-red-500/60 shadow-[0_0_10px_rgba(239,68,68,0.4)]" : ""}
                        ${hasTrackingNumber ? "!opacity-50 !cursor-not-allowed" : ""}
                      `}
                      title={hasTrackingNumber ? "Status is managed by shipping provider (has tracking number)" : undefined}
                    />

                    {hasTrackingNumber && (
                      <div className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        Tracked
                      </div>
                    )}

                    <button
                      id={`btn-save-${orderNumber}`}
                      onClick={() => handleSave(o)}
                      disabled={isSaving || hasTrackingNumber}
                      title={hasTrackingNumber ? "Cannot save: order has tracking number" : undefined}
                      className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                        text-[12px] font-medium border transition-all duration-200
                        disabled:opacity-60 disabled:cursor-not-allowed
                        bg-brand/10 text-brand border-brand/20 hover:bg-brand/20 hover:border-brand/40
                      `}
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw size={11} className="animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={12} />
                          Save
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
