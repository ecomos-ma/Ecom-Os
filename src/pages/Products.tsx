import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Edit2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { supabase } from "../lib/supabase";
import type { Product } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

function mad(n: number) {
  return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

export default function Products() {
  const { workspace } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    if (!workspace?.id) return;
    setLoading(true);
    
    console.log('[Products] Fetching products with workspace_id:', workspace.id);
    console.log('[Products] Workspace object:', workspace);
    
    supabase
      .from("products")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        console.log('[Products] Products query result:', {
          data: data,
          error: error,
          count: data?.length || 0
        });
        console.log('[Products] Products data details:', JSON.stringify(data, null, 2));
        console.log('[Products] Products error details:', JSON.stringify(error, null, 2));
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  };

  useEffect(load, [workspace?.id]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this product?")) return;
    setDeletingId(id);
    await supabase.from("products").delete().eq("id", id);
    setDeletingId(null);
    load();
  };

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setShowModal(true);
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Product catalog with purchase cost and initial stock."
        action={
          <button
            onClick={() => {
              setEditingProduct(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand/90"
          >
            <Plus size={14} /> New Product
          </button>
        }
      />

      {!loading && products.length === 0 ? (
        <div className="py-12 md:py-24">
          <EmptyState
            title="No products yet"
            description="Add your products to manage inventory, costs and order fulfillment."
            primaryAction={
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setShowModal(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand/90"
              >
                <Plus size={14} /> Add Product
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-base-border text-left text-[12px] text-ink-muted">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Selling Price</th>
              <th className="px-4 py-3 font-medium">Initial Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                  Loading…
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-base-border last:border-0 hover:bg-base-raised/40 group">
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-sky-400">
                    {p.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-muted">{mad(p.cost)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">{mad(p.price)}</td>
                  <td className="px-4 py-3 font-mono text-ink-muted">{p.stock}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium border
                      ${p.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                      {p.status === "active" ? "Active" : p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(p)}
                        className="p-1.5 rounded text-ink-muted hover:text-brand hover:bg-brand/10"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(p.id, e)}
                        disabled={deletingId === p.id}
                        className="p-1.5 rounded text-red-500/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        {deletingId === p.id
                          ? <RefreshCw size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="md:hidden flex flex-col gap-3 pb-8">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-4 w-32 bg-base-raised rounded mb-2" />
                  <div className="h-3 w-20 bg-base-raised rounded" />
                </div>
                <div className="h-8 w-8 bg-base-raised rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-10 w-full bg-base-raised rounded-xl" />
                <div className="h-10 w-full bg-base-raised rounded-xl" />
              </div>
            </div>
          ))
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              onClick={() => handleEdit(p)}
              className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl relative overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="text-[16px] font-bold text-ink mb-0.5">{p.name}</div>
                  <div className="text-[13px] text-sky-400 font-mono">{p.sku ?? "No SKU"}</div>
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  disabled={deletingId === p.id}
                  className="p-2 rounded-full bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-40"
                >
                  {deletingId === p.id
                    ? <RefreshCw size={15} className="animate-spin" />
                    : <Trash2 size={15} />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 bg-base-raised/30 rounded-xl p-3">
                <div>
                  <div className="text-[11px] text-ink-muted mb-0.5">Selling Price</div>
                  <div className="font-mono text-[14px] font-bold text-ink">{mad(p.price)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-muted mb-0.5">Cost</div>
                  <div className="font-mono text-[14px] font-semibold text-ink-muted">{mad(p.cost)}</div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-muted">Stock:</span>
                  <span className="font-mono text-[14px] font-semibold text-ink">{p.stock}</span>
                </div>
                <span className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-bold border
                      ${p.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400 border-none uppercase"
                    : "bg-zinc-500/10 text-zinc-400 border-none uppercase"}`}>
                  {p.status === "active" ? "ACTIVE" : p.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

        </>
      )}

      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function ProductModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const { workspace } = useAuth();
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [cost, setCost] = useState(product?.cost?.toString() ?? "");
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [stock, setStock] = useState(product?.stock?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!product;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace?.id) return;
    setError(null);

    if (!name.trim() || cost.trim() === "" || price.trim() === "" || stock.trim() === "") {
      setError("Please fill in all required fields before saving.");
      return;
    }

    setBusy(true);

    const payload: any = {
      name: name.trim(),
      sku: sku.trim() || null,
      cost: Number(cost),
      price: Number(price),
      stock: Number(stock),
      low_stock_threshold: Math.floor(Number(stock) * 0.1),
      status: "active",
      workspace_id: workspace.id,
    };

    if (isEdit && product) {
      if (cost.trim() === "") payload.cost = product.cost ?? 0;
      if (price.trim() === "") payload.price = product.price ?? 0;
      if (stock.trim() === "") payload.stock = product.stock ?? 0;
    }

    let res;
    if (isEdit) {
      res = await supabase.from("products").update(payload).eq("id", product!.id);
    } else {
      res = await supabase.from("products").insert(payload);
    }

    setBusy(false);
    if (res.error) {
      setError(res.error.message);
    } else {
      onSaved();
    }
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "New Product"} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Product Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Joint Cream 159 MAD"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Ex: joint-cream"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Cost (MAD)</label>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Selling Price (MAD)</label>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Initial Stock</label>
          <input
            type="number"
            required
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Ex: 100"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
          />
          <div className="mt-1 text-[11px] text-ink-faint">
            Remaining stock is dynamically adjusted based on active deliveries.
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-brand py-2 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
        >
          {busy ? "Saving…" : isEdit ? "Update" : "Create Product"}
        </button>
      </form>
    </Modal>
  );
}
