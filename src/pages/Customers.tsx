import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, MessageCircle, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { Customer, Order } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { useI18n } from "../i18n";

interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  orders: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

function mad(n: number) {
  return `MAD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function Customers() {
  const { workspace } = useAuth();
  const { formatCurrency, formatDateTime } = useI18n();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [whatsappMessages, setWhatsappMessages] = useState<any[]>([]);

  async function openCustomer(customer: CustomerProfile) {
    setSelectedCustomer(customer);
    if (!workspace?.id) return;
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id, order_id, direction, message_type, status, body, created_at")
      .eq("workspace_id", workspace.id)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: true })
      .limit(100);
    setWhatsappMessages(data || []);
  }

  useEffect(() => {
    if (!workspace?.id) return;
    const wid = workspace.id;

    async function load() {
      setLoading(true);
      const [customersRes, ordersRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, city, created_at")
          .eq("workspace_id", wid),
        supabase
          .from("orders")
          .select('id:"Order ID", customer_id, total, status, created_at, shipping_status')
          .eq("workspace_id", wid),
      ]);

      const customerRows = (customersRes.data ?? []) as Customer[];
      const orderRows = (ordersRes.data ?? []) as Order[];

      const customersWithStats: CustomerProfile[] = customerRows.map((customer) => {
        const customerOrders = orderRows.filter((order) => order.customer_id === customer.id);
        const deliveredTotal = customerOrders
          .filter((order) => {
            if (order.shipping_status) {
              const normalizedShipping = order.shipping_status.toLowerCase();
              if (normalizedShipping === "livrÃ©" || normalizedShipping === "delivered") return true;
            }
            return order.status === "delivered";
          })
          .reduce((sum, order) => sum + Number(order.total), 0);

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          city: customer.city,
          orders: customerOrders.length,
          totalSpent: deliveredTotal,
          lastOrderAt: customerOrders.reduce((latest, order) => {
            const created = new Date(order.created_at).getTime();
            return latest === null || created > latest ? created : latest;
          }, null as number | null) ? new Date(
            customerOrders.reduce((latest, order) => {
              const created = new Date(order.created_at).getTime();
              return latest === null || created > latest ? created : latest;
            }, null as number | null) ?? 0
          ).toISOString() : null,
        };
      });

      setCustomers(customersWithStats.sort((a, b) => b.totalSpent - a.totalSpent));
      setOrders(orderRows);
      setLoading(false);
    }

    load();
  }, [workspace?.id]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (customer.phone ?? "").includes(search)
    ),
    [customers, search]
  );

  return (
    <div>
      <PageHeader title="Customers" subtitle="A CRM-style customer panel with order lifetime value and contact history." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-lg border border-base-border bg-base-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">Loading customersâ€¦</div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState title="No customers yet" subtitle="Customers will appear here as orders are created." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <article key={customer.id} onClick={() => openCustomer(customer)} className="cursor-pointer rounded-3xl border border-base-border bg-base-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">{customer.name}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{customer.city ?? "City not set"}</p>
                </div>
                <div className="rounded-full bg-brand-accent/10 px-3 py-1 text-[12px] font-semibold text-brand-accent">{customer.orders} orders</div>
              </div>

              <div className="mt-5 grid gap-3 text-[13px] text-ink-muted">
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Phone</span><span>{customer.phone ?? "â€”"}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Lifetime value</span><span className="font-semibold text-ink">{mad(customer.totalSpent)}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Last order</span><span>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("en-GB") : "No orders"}</span></div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 text-[13px] font-medium text-brand"><span>View order history</span><ChevronRight size={16} /></div>
            </article>
          ))}
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-base-border p-5">
              <div><h2 className="text-[16px] font-bold">{selectedCustomer.name}</h2><p className="mt-1 text-[11px] text-ink-muted">Orders and WhatsApp timeline</p></div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-lg p-2 hover:bg-base-raised"><X size={17} /></button>
            </div>
            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
              <section><h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Order history</h3><div className="space-y-2">{orders.filter((order) => order.customer_id === selectedCustomer.id).map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl border border-base-border p-3"><div><div className="text-[12px] font-semibold">{order.order_number || order.id}</div><div className="text-[10px] text-ink-muted">{formatDateTime(order.created_at)}</div></div><div className="text-right"><StatusBadge status={order.status} size="sm" /><div className="text-[10px] text-ink-muted">{formatCurrency(Number(order.total || 0))}</div></div></div>)}</div></section>
              <section><h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#25D366]"><MessageCircle size={13} />WhatsApp</h3>{whatsappMessages.length === 0 ? <div className="rounded-xl border border-dashed border-base-border p-6 text-center text-[11px] text-ink-muted">No WhatsApp messages for this customer.</div> : <div className="space-y-2">{whatsappMessages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl p-3 text-[11.5px] ${message.direction === "outbound" ? "ml-auto bg-[#25D366]/10" : "bg-base-raised"}`}><div>{message.body || `[${message.message_type}]`}</div><div className="mt-1 text-[9px] text-ink-faint">{message.status} · {new Date(message.created_at).toLocaleString()}</div></div>)}</div>}</section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
