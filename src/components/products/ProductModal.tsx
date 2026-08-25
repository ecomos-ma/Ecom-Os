import { FormEvent, useState, useEffect, useRef } from "react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { Package, DollarSign, Layers, Warehouse, AlertCircle, UploadCloud, CheckCircle2, TrendingUp, Sparkles } from "lucide-react";

export function ProductModal({
    product,
    onClose,
    onSaved
}: {
    product: any | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { workspace } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        sku: "",
        barcode: "",
        variant: "",
        category: "",
        supplier: "",
        cost: "",
        price: "",
        currency: "MAD",
        initial_stock: "",
        low_stock_threshold: "5",
        warehouse: "",
        description: "",
        notes: "",
        status: "active" as const,
        inventory_tracking_enabled: true,
        image_url: ""
    });

    const [busy, setBusy] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEdit = !!product;

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name || "",
                sku: product.sku || "",
                barcode: product.barcode || "",
                variant: product.variant || "",
                category: product.category || "",
                supplier: product.supplier || "",
                cost: product.cost?.toString() || "",
                price: product.price?.toString() || "",
                currency: product.currency || "MAD",
                initial_stock: product.initial_stock?.toString() || product.stock?.toString() || "",
                low_stock_threshold: product.low_stock_threshold?.toString() || "5",
                warehouse: product.warehouse || "",
                description: product.description || "",
                notes: product.notes || "",
                status: product.status || "active",
                inventory_tracking_enabled: Boolean(product.inventory_tracking_enabled),
                image_url: product.image_url || ""
            });
        }
    }, [product]);

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Auto-generate SKU from name if empty and creating
    const generateSku = () => {
        if (!formData.name.trim()) return;
        const cleanSku = formData.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        setFormData(prev => ({ ...prev, sku: cleanSku }));
    };

    // Calculate profit live
    const costNum = Number(formData.cost) || 0;
    const priceNum = Number(formData.price) || 0;
    const profit = priceNum - costNum;
    const margin = priceNum > 0 ? ((profit / priceNum) * 100).toFixed(1) : "0.0";

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !workspace?.id) return;
        setUploadingImage(true);
        try {
            const ext = file.name.split(".").pop() || "jpg";
            const path = `${workspace.id}/modal-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
            setFormData(prev => ({ ...prev, image_url: urlData.publicUrl }));
        } catch (err: any) {
            setError("Image upload failed: " + err.message);
        } finally {
            setUploadingImage(false);
        }
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!workspace?.id) return;
        setError(null);

        const { name, cost, price, initial_stock } = formData;
        if (!name.trim() || cost.trim() === "" || price.trim() === "" || initial_stock.trim() === "") {
            setError("Please complete Product Name, Cost, Price, and Initial Stock.");
            return;
        }

        setBusy(true);

        const payload: any = {
            name: name.trim(),
            sku: formData.sku.trim() || null,
            barcode: formData.barcode.trim() || null,
            variant: formData.variant.trim() || null,
            category: formData.category.trim() || null,
            supplier: formData.supplier.trim() || null,
            currency: formData.currency.trim(),
            cost: Number(cost),
            price: Number(price),
            initial_stock: Number(initial_stock),
            low_stock_threshold: Number(formData.low_stock_threshold) || 0,
            warehouse: formData.warehouse.trim() || null,
            description: formData.description.trim() || null,
            notes: formData.notes.trim() || null,
            status: formData.status,
            inventory_tracking_enabled: formData.inventory_tracking_enabled,
            image_url: formData.image_url.trim() || null,
            workspace_id: workspace.id,
        };

        if (!isEdit) {
            Object.assign(payload, {
                stock: Number(initial_stock),
                reserved_stock: 0,
                out_for_delivery_stock: 0,
                delivered_stock: 0,
                returned_stock: 0,
                cancelled_stock: 0,
                manual_added_stock: 0,
                manual_removed_stock: 0,
                damaged_stock: 0,
                lost_stock: 0
            });
        }

        const res = isEdit
            ? await supabase.from("products").update(payload).eq("id", product!.id).eq("workspace_id", workspace.id).select("id").maybeSingle()
            : await supabase.from("products").insert(payload).select("id").maybeSingle();

        setBusy(false);
        if (res.error) {
            setError(res.error.message);
        } else if (!res.data) {
            setError("Product save returned no result. Please try again.");
        } else {
            onSaved();
        }
    };

    return (
        <Modal title={isEdit ? `Edit: ${product?.name || "Product"}` : "Create New Product"} onClose={onClose}>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

            <form onSubmit={onSubmit} className="flex flex-col gap-5 max-h-[80vh] overflow-y-auto px-1 pr-2 [scrollbar-width:thin]">

                {/* Top Banner with Image Preview & Profit Calculator */}
                <div className="rounded-xl border border-base-border bg-base-raised p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative h-16 w-16 flex-none rounded-xl overflow-hidden border border-dashed border-brand/40 bg-brand/5 flex items-center justify-center cursor-pointer group hover:border-brand transition-colors"
                        >
                            {formData.image_url ? (
                                <img src={formData.image_url} alt="Product" className="h-full w-full object-cover" />
                            ) : (
                                <UploadCloud size={20} className="text-brand/70 group-hover:scale-110 transition-transform" />
                            )}
                            {uploadingImage && (
                                <div className="absolute inset-0 bg-base-surface/80 flex items-center justify-center">
                                    <div className="h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-[13px] font-semibold text-ink">Product Media</div>
                            <div className="text-[11px] text-ink-muted">Click to upload product image</div>
                        </div>
                    </div>

                    {/* Live Profit Preview */}
                    {priceNum > 0 && (
                        <div className="flex items-center gap-3 bg-base-surface border border-base-border rounded-lg px-3 py-2 w-full md:w-auto justify-around">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-ink-muted">Est. Profit</div>
                                <div className={`text-[13px] font-bold font-mono ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                    {profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2)} MAD
                                </div>
                            </div>
                            <div className="h-6 w-px bg-base-border" />
                            <div>
                                <div className="text-[10px] uppercase font-bold text-ink-muted">Margin</div>
                                <div className={`text-[13px] font-bold font-mono ${Number(margin) >= 30 ? "text-emerald-500" : Number(margin) > 0 ? "text-amber-500" : "text-red-500"}`}>
                                    {margin}%
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 1: Basic Identification */}
                <div className="space-y-3">
                    <h3 className="text-[12px] font-bold uppercase tracking-wider text-brand flex items-center gap-1.5">
                        <Package size={14} /> Basic Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Product Name *</label>
                            <input
                                required
                                value={formData.name}
                                onChange={e => handleChange("name", e.target.value)}
                                placeholder="Ex: Joint Relief Cream"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[12px] font-medium text-ink-muted">SKU</label>
                                {!isEdit && (
                                    <button
                                        type="button"
                                        onClick={generateSku}
                                        className="text-[11px] text-brand hover:underline flex items-center gap-0.5"
                                    >
                                        <Sparkles size={11} /> Auto-generate
                                    </button>
                                )}
                            </div>
                            <input
                                value={formData.sku}
                                onChange={e => handleChange("sku", e.target.value)}
                                placeholder="Ex: joint-relief-cream"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Category</label>
                            <input
                                value={formData.category}
                                onChange={e => handleChange("category", e.target.value)}
                                placeholder="Ex: Health & Beauty"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Barcode / EAN</label>
                            <input
                                value={formData.barcode}
                                onChange={e => handleChange("barcode", e.target.value)}
                                placeholder="Ex: 611123456789"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Section 2: Pricing & Economics */}
                <div className="space-y-3">
                    <h3 className="text-[12px] font-bold uppercase tracking-wider text-brand flex items-center gap-1.5">
                        <DollarSign size={14} /> Economics & Pricing
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Purchase Cost (MAD) *</label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.cost}
                                onChange={e => handleChange("cost", e.target.value)}
                                placeholder="Ex: 45.00"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Selling Price (MAD) *</label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.price}
                                onChange={e => handleChange("price", e.target.value)}
                                placeholder="Ex: 199.00"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono font-semibold text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Section 3: Inventory Settings */}
                <div className="space-y-3">
                    <h3 className="text-[12px] font-bold uppercase tracking-wider text-brand flex items-center gap-1.5">
                        <Warehouse size={14} /> Inventory & Stock Controls
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Initial Stock Units *</label>
                            <input
                                required
                                type="number"
                                min="0"
                                value={formData.initial_stock}
                                onChange={e => handleChange("initial_stock", e.target.value)}
                                placeholder="Ex: 150"
                                disabled={isEdit}
                                title={isEdit ? "Initial stock cannot be changed here. Use Stock Adjustments." : ""}
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand/50 focus:outline-none disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Low Stock Alert Threshold</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.low_stock_threshold}
                                onChange={e => handleChange("low_stock_threshold", e.target.value)}
                                placeholder="Ex: 10"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] font-mono text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Warehouse / Location</label>
                            <input
                                value={formData.warehouse}
                                onChange={e => handleChange("warehouse", e.target.value)}
                                placeholder="Ex: Casablanca Warehouse A"
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Status</label>
                            <select
                                value={formData.status}
                                onChange={e => handleChange("status", e.target.value)}
                                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                            >
                                <option value="active">Active (Available)</option>
                                <option value="draft">Draft (Hidden)</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    <div className="rounded-xl border border-base-border bg-base-raised/60 p-3 mt-2">
                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={formData.inventory_tracking_enabled}
                                onChange={e => handleChange("inventory_tracking_enabled", e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-base-border text-brand focus:ring-brand accent-brand"
                            />
                            <span>
                                <span className="block text-[13px] font-semibold text-ink">Enable automated inventory tracking</span>
                                <span className="block text-[11.5px] text-ink-muted mt-0.5">
                                    Stock decreases automatically upon delivery and restores upon returns.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>

                {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-[12.5px] text-red-500 flex items-center gap-2">
                        <AlertCircle size={15} className="flex-none" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white shadow-md hover:bg-brand/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                    >
                        {busy ? (
                            <>
                                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                Saving Product...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} />
                                {isEdit ? "Update Product Catalog" : "Create & Add Product"}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
