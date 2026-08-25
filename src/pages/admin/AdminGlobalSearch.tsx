import { useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import { Search, Users, ShoppingCart, Package, Building2, Loader2 } from "lucide-react";

type ResultKind = "user" | "workspace" | "order" | "product" | "customer";

interface SearchHit {
    kind: ResultKind;
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
}

const KIND_ICON: Record<ResultKind, React.ReactNode> = {
    user: <Users size={15} className="text-sky-400" />,
    workspace: <Building2 size={15} className="text-purple-400" />,
    order: <ShoppingCart size={15} className="text-amber-400" />,
    product: <Package size={15} className="text-emerald-400" />,
    customer: <Users size={15} className="text-pink-400" />,
};

const KIND_LABEL: Record<ResultKind, string> = {
    user: "User",
    workspace: "Workspace",
    order: "Order",
    product: "Product",
    customer: "Customer",
};

export default function AdminGlobalSearch() {
    const [q, setQ] = useState("");
    const [results, setResults] = useState<SearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const doSearch = async () => {
        if (!q.trim()) return;
        setLoading(true);
        setSearched(true);
        const hits: SearchHit[] = [];

        const [usersRes, workspacesRes, ordersRes, productsRes, customersRes] = await Promise.all([
            supabase.from("profiles").select("id, full_name, email, role").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10),
            supabase.from("workspaces").select("id, name, created_at").ilike("name", `%${q}%`).limit(10),
            supabase.from("orders").select('id:"Order ID", order_number, status, total, tracking_number, shipping_status').or(`order_number.ilike.%${q}%`).limit(10),
            supabase.from("products").select("id, name, sku, price").or(`name.ilike.%${q}%,sku.ilike.%${q}%`).limit(10),
            supabase.from("customers").select("id, name, phone, city").or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(10),
        ]);

        for (const u of usersRes.data ?? []) {
            hits.push({ kind: "user", id: u.id, title: u.full_name || u.email || "Unknown", subtitle: u.email || u.id, meta: u.role });
        }
        for (const w of workspacesRes.data ?? []) {
            hits.push({ kind: "workspace", id: w.id, title: w.name, subtitle: w.id, meta: new Date(w.created_at).toLocaleDateString() });
        }
        for (const o of ordersRes.data ?? []) {
            hits.push({ kind: "order", id: o.id, title: o.order_number, subtitle: `Status: ${o.status}`, meta: `MAD ${Number(o.total || 0).toLocaleString()}` });
        }
        for (const p of productsRes.data ?? []) {
            hits.push({ kind: "product", id: p.id, title: p.name, subtitle: p.sku || "No SKU", meta: `MAD ${Number(p.price || 0).toLocaleString()}` });
        }
        for (const c of customersRes.data ?? []) {
            hits.push({ kind: "customer", id: c.id, title: c.name, subtitle: c.phone || "No phone", meta: c.city || "" });
        }

        setResults(hits);
        setLoading(false);
    };

    const kindFilter = (kind: ResultKind) => results.filter(r => r.kind === kind);

    return (
        <div className="space-y-5">
            <PageHeader title="Global Search" subtitle="Search across all users, workspaces, orders, products and customers." />

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && doSearch()}
                        placeholder="Search anything… (press Enter)"
                        className="w-full rounded-xl border border-base-border bg-base-surface pl-9 pr-3 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50 focus:outline-none shadow-card"
                    />
                </div>
                <button
                    onClick={doSearch}
                    disabled={loading || !q.trim()}
                    className="rounded-xl bg-brand px-4 py-3 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
                >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : "Search"}
                </button>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-[13px] text-ink-muted">
                    <Loader2 size={14} className="animate-spin" /> Searching across all tables…
                </div>
            )}

            {!loading && searched && results.length === 0 && (
                <div className="rounded-xl border border-base-border bg-base-surface p-8 text-center text-[13px] text-ink-muted">
                    No results for <strong className="text-ink">"{q}"</strong>
                </div>
            )}

            {!loading && results.length > 0 && (
                <div className="space-y-4">
                    <div className="text-[12px] text-ink-muted">{results.length} result{results.length !== 1 ? "s" : ""} found</div>

                    {(["user", "workspace", "order", "product", "customer"] as ResultKind[]).map(kind => {
                        const group = kindFilter(kind);
                        if (group.length === 0) return null;
                        return (
                            <div key={kind} className="rounded-xl border border-base-border bg-base-surface overflow-hidden">
                                <div className="flex items-center gap-2 border-b border-base-border bg-base-raised/70 px-4 py-2.5">
                                    {KIND_ICON[kind]}
                                    <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{KIND_LABEL[kind]}s</span>
                                    <span className="ml-auto text-[11.5px] text-ink-faint">{group.length}</span>
                                </div>
                                <div className="divide-y divide-base-border/50">
                                    {group.map(hit => (
                                        <div key={hit.id} className="flex items-center justify-between px-4 py-3 hover:bg-base-raised/30 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="shrink-0">{KIND_ICON[hit.kind]}</div>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-medium text-ink truncate">{hit.title}</div>
                                                    <div className="text-[11.5px] text-ink-muted truncate">{hit.subtitle}</div>
                                                </div>
                                            </div>
                                            {hit.meta && (
                                                <span className="shrink-0 ml-3 text-[11.5px] text-ink-faint bg-base-raised px-2 py-0.5 rounded-md">{hit.meta}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
