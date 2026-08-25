import { ChevronRight, ImageOff, Package, Phone, UserRound } from "lucide-react";
import { StatusBadge } from "../../components/StatusBadge";
import type { ConfirmationOrder } from "./types";
import { useI18n } from "../../i18n";

function ProductPreview({ order }: { order: ConfirmationOrder }) {
  const visibleProducts = order.products.slice(0, 3);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex -space-x-2 shrink-0">
        {visibleProducts.map((product, index) => (
          <div key={`${product.id || product.sku || product.name}-${index}`} className="h-9 w-9 overflow-hidden rounded-xl border-2 border-base-surface bg-base-raised shadow-sm">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-faint"><ImageOff size={14} /></span>
            )}
          </div>
        ))}
        {!visibleProducts.length && <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-base-raised text-ink-faint"><Package size={15} /></div>}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-ink">{order.products[0]?.name || order.productVariant || order.sku || "Product unavailable"}</div>
        <div className="mt-0.5 truncate text-[11px] text-ink-muted">
          {order.products.length > 1 ? `${order.products.length} products` : order.products[0]?.variant || order.sku || "No SKU"}
        </div>
      </div>
    </div>
  );
}

function AgentAvatar({ order }: { order: ConfirmationOrder }) {
  const agent = order.assignedAgent;
  if (!agent) return <span className="text-[11.5px] text-ink-faint">Unassigned</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{agent.fullName.slice(0, 1).toUpperCase()}</span>
      )}
      <span className="max-w-[100px] truncate text-[11.5px] text-ink-muted">{agent.fullName}</span>
    </div>
  );
}

export function ConfirmationOrdersTable({
  orders,
  loading,
  onOpen,
  selectedId,
}: {
  orders: ConfirmationOrder[];
  loading: boolean;
  onOpen: (order: ConfirmationOrder) => void;
  selectedId?: string | null;
}) {
  const { formatCurrency, formatDate } = useI18n();
  const money = (value: number) => formatCurrency(Number(value || 0));
  const when = (value: string) => formatDate(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-base-border bg-base-surface">
        {[...Array(8)].map((_, index) => <div key={index} className="h-[72px] border-b border-base-border/70 last:border-0 animate-pulse bg-base-raised/30" />)}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-dashed border-base-border bg-base-surface px-6 py-16 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-base-raised text-ink-muted"><Package size={20} /></div>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">No matching confirmation orders</h2>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-muted">Try another queue, status, or date range. New workspace orders appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1030px] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-base-raised/90 backdrop-blur">
            <tr className="border-b border-base-border text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Confirmation</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const selected = selectedId === order.id;
              return (
                <tr
                  key={order.id}
                  onClick={() => onOpen(order)}
                  className={`group cursor-pointer border-b border-base-border/60 transition-colors last:border-0 ${selected ? "bg-brand/5" : "hover:bg-base-raised/55"}`}
                >
                  <td className="px-4 py-3.5 align-middle">
                    <div className="font-mono text-[12.5px] font-bold text-ink">#{order.orderNumber}</div>
                    <div className="mt-0.5 text-[10.5px] text-ink-muted">{when(order.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3.5 align-middle"><ProductPreview order={order} /></td>
                  <td className="px-4 py-3.5 align-middle">
                    <div className="flex min-w-[160px] items-center gap-2">
                      <UserRound size={14} className="shrink-0 text-ink-faint" />
                      <div className="min-w-0">
                        <div className="max-w-[150px] truncate text-[12.5px] font-semibold text-ink">{order.customerName}</div>
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-ink-muted"><Phone size={10} /> {order.phone || "No phone"} · {order.city || "No city"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-middle font-mono text-[12.5px] font-semibold text-ink">{money(order.total)}</td>
                  <td className="px-4 py-3.5 align-middle"><StatusBadge status={order.status} size="sm" /></td>
                  <td className="px-4 py-3.5 align-middle"><AgentAvatar order={order} /></td>
                  <td className="px-4 py-3.5 align-middle">
                    {order.lastActivity ? (
                      <div className="max-w-[170px]">
                        <div className="truncate text-[11px] text-ink">{order.lastActivity.text}</div>
                        <div className="mt-0.5 text-[10px] text-ink-faint">{when(order.lastActivity.createdAt)}</div>
                      </div>
                    ) : <span className="text-[11px] text-ink-faint">No CRM activity yet</span>}
                  </td>
                  <td className="px-4 py-3.5 align-middle text-right">
                    <button onClick={(event) => { event.stopPropagation(); onOpen(order); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/10">
                      View <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
