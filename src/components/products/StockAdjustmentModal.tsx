import { FormEvent, useState } from "react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { PlusCircle, MinusCircle, AlertOctagon, HelpCircle, CheckCircle2, ShieldAlert } from "lucide-react";

export function StockAdjustmentModal({
    product,
    onClose,
    onSaved
}: {
    product: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { workspace, profile } = useAuth();

    const [type, setType] = useState<"ADD" | "REMOVE" | "DAMAGE" | "LOST">("ADD");
    const [quantity, setQuantity] = useState("");
    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const REASON_PRESETS = [
        "Supplier Restock",
        "Inventory Audit",
        "Damaged Goods",
        "Customer Return",
        "Lost in Transit",
        "Sample / Promo"
    ];

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!workspace?.id || !product.id) return;
        setError(null);

        const qtyNum = Number(quantity);
        if (!quantity || qtyNum <= 0) {
            setError("Quantity must be greater than 0");
            return;
        }
        if (!reason.trim()) {
            setError("Please select or enter a reason for this adjustment");
            return;
        }

        setBusy(true);

        const isAddition = type === "ADD";

        // Save to stock_history log
        const historyPayload = {
            workspace_id: workspace.id,
            product_id: product.id,
            quantity_change: isAddition ? qtyNum : -qtyNum,
            reason: reason.trim(),
            notes: notes.trim() || null,
            user_id: profile?.id,
        };

        // Update Product counter
        let updateField = "";
        if (type === "ADD") updateField = "manual_added_stock";
        else if (type === "REMOVE") updateField = "manual_removed_stock";
        else if (type === "DAMAGE") updateField = "damaged_stock";
        else if (type === "LOST") updateField = "lost_stock";

        try {
            const { data: currProduct } = await supabase
                .from("products")
                .select(updateField)
                .eq("id", product.id)
                .single();

            if (currProduct) {
                const currentCounterValue = (currProduct as any)[updateField] || 0;
                await supabase
                    .from("products")
                    .update({ [updateField]: currentCounterValue + qtyNum })
                    .eq("id", product.id);
            }

            const { error: histError } = await supabase.from("stock_history").insert(historyPayload);
            if (histError) throw histError;

            onSaved();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to save stock adjustment.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={`Stock Adjustment: ${product.name}`} onClose={onClose}>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">

                {/* Product Summary Header */}
                <div className="rounded-xl border border-base-border bg-base-raised p-3 flex items-center justify-between">
                    <div>
                        <div className="text-[13px] font-bold text-ink">{product.name}</div>
                        <div className="text-[11px] font-mono text-sky-500">SKU: {product.sku || "—"}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-ink-muted">Current Ready</div>
                        <div className="text-[15px] font-bold font-mono text-emerald-500">
                            {product.ready_to_ship ?? product.initial_stock ?? 0} units
                        </div>
                    </div>
                </div>

                {/* Type Segmented Pill Selector */}
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">Adjustment Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { id: "ADD", label: "Add Stock", icon: PlusCircle, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" },
                            { id: "REMOVE", label: "Remove", icon: MinusCircle, color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
                            { id: "DAMAGE", label: "Damage", icon: AlertOctagon, color: "text-red-500 bg-red-500/10 border-red-500/30" },
                            { id: "LOST", label: "Lost", icon: ShieldAlert, color: "text-purple-500 bg-purple-500/10 border-purple-500/30" },
                        ].map(t => {
                            const active = type === t.id;
                            const IconComponent = t.icon;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setType(t.id as any)}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[12px] font-semibold border transition-all ${
                                        active ? t.color : "bg-base-raised border-base-border text-ink-muted hover:text-ink"
                                    }`}
                                >
                                    <IconComponent size={14} />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Quantity */}
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">Quantity (Units)</label>
                    <input
                        required
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        placeholder="Ex: 50"
                        className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[14px] font-mono font-bold text-ink focus:border-brand/50 focus:outline-none"
                    />
                </div>

                {/* Reason Presets & Input */}
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">Reason for Adjustment</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {REASON_PRESETS.map(preset => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setReason(preset)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                                    reason === preset
                                        ? "bg-brand/10 border-brand/40 text-brand"
                                        : "bg-base-raised border-base-border text-ink-muted hover:text-ink"
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <input
                        required
                        type="text"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Enter custom reason or select tag above"
                        className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                    />
                </div>

                {/* Notes */}
                <div>
                    <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">Additional Notes (Optional)</label>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Invoice number, batch info, or auditor notes..."
                        className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                    />
                </div>

                {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-[12.5px] text-red-500 flex items-center gap-2">
                        <AlertOctagon size={15} className="flex-none" />
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
                                Saving Stock Adjustment...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} />
                                Confirm Stock Adjustment
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
