import { useState } from "react";
import { 
  Package, 
  Phone, 
  MapPin, 
  ChevronRight, 
  MoreHorizontal,
  Truck
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useI18n } from "../i18n";

interface MobileOrderCardProps {
  order: any;
  onExpand?: () => void;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function MobileOrderCard({
  order,
  onExpand,
  onCall,
  onWhatsApp,
  onConfirm,
  onCancel,
}: MobileOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const { formatCurrency, formatDate } = useI18n();

  return (
    <div className="bg-base-surface rounded-[20px] border border-base-border shadow-sm overflow-hidden active:scale-[0.98] transition-transform duration-200">
      {/* Main Card */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[15px] font-bold text-ink">
                #{order.order_number}
              </span>
              <StatusBadge status={order.status} size="sm" />
            </div>
            <p className="text-[15px] font-semibold text-ink">
              {order.customer?.name || "Unknown Customer"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[16px] font-bold text-brand-accent">
              {formatCurrency(Number(order.total || 0))}
            </p>
            <p className="text-[11px] text-ink-muted">
              {formatDate(order.created_at)}
            </p>
          </div>
        </div>

        {/* Quick Info */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <Phone size={14} />
            {order.phone || order.customer?.phone || "—"}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <MapPin size={14} />
            {order.city || "—"}
          </div>
        </div>

        {/* Product Info */}
        {order.product_variant && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <Package size={14} className="text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-ink">{order.product_variant}</p>
              {order.sku && (
                <p className="text-[11px] text-ink-muted">SKU: {order.sku}</p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onCall}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 text-[13px] font-semibold active:scale-[0.95] transition-transform"
          >
            <Phone size={14} />
            Call
          </button>
          <button
            onClick={onWhatsApp}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-brand/10 border border-brand/20 text-brand text-[13px] font-semibold active:scale-[0.95] transition-transform"
          >
            <Phone size={14} />
            WhatsApp
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-10 h-10 rounded-xl bg-base-raised border border-base-border/50 flex items-center justify-center active:scale-[0.95] transition-transform"
          >
            <ChevronRight size={18} className={`text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-base-border/50 pt-4 animate-in slide-in-from-top duration-200">
          {/* Tracking */}
          {order.tracking_number && (
            <div className="mb-3 p-3 rounded-xl bg-base-raised border border-base-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-brand" />
                  <span className="text-[13px] font-medium text-ink">Tracking</span>
                </div>
                <span className="text-[13px] font-mono text-brand-accent">{order.tracking_number}</span>
              </div>
            </div>
          )}

          {/* Address */}
          {order.address && (
            <div className="mb-3 p-3 rounded-xl bg-base-raised border border-base-border/50">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-brand mt-0.5" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-ink mb-1">Delivery Address</p>
                  <p className="text-[12px] text-ink-muted">{order.address}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-ink">Order Timeline</p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-brand mt-1.5" />
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-ink">Order Created</p>
                  <p className="text-[11px] text-ink-muted">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {order.confirmed_at && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-ink">Confirmed</p>
                    <p className="text-[11px] text-ink-muted">
                      {new Date(order.confirmed_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              {order.delivered_at && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-accent mt-1.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-ink">Delivered</p>
                    <p className="text-[11px] text-ink-muted">
                      {new Date(order.delivered_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4">
            {order.status === "pending" && (
              <>
                <button
                  onClick={onConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-white text-[13px] font-semibold active:scale-[0.95] transition-transform"
                >
                  Confirm
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[13px] font-semibold active:scale-[0.95] transition-transform"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
