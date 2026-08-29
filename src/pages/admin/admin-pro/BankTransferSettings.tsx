import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  Landmark,
  LayoutTemplate,
  Loader2,
  Paintbrush,
  PencilLine,
  Plus,
  QrCode,
  Save,
  Smartphone,
  Trash2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { errorMessage, PageHeading } from "./shared";

type PaymentMethodRow = {
  id: string;
  slug: string;
  display_name: string;
  bank_name: string | null;
  account_name: string | null;
  rib: string | null;
  iban: string | null;
  qr_code_path: string | null;
  instructions: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentMethodForm = {
  id: string | null;
  slug: string;
  display_name: string;
  bank_name: string;
  account_name: string;
  rib: string;
  iban: string;
  qr_code_path: string | null;
  instructions: string;
  sort_order: number;
  is_active: boolean;
};

type CheckoutSettings = {
  headline: string;
  subheadline: string;
  accent_color: string;
  button_label: string;
  trust_note: string;
  support_whatsapp: string;
  default_plan: "starter" | "growth" | "pro" | "scale";
  default_billing: "monthly" | "yearly";
  show_card: boolean;
  show_paypal: boolean;
};

const checkoutDefaults: CheckoutSettings = {
  headline: "Choose the plan that fits your operation",
  subheadline: "Activate your Ecom OS workspace with a secure Moroccan bank transfer.",
  accent_color: "#e73773",
  button_label: "Confirm plan & continue",
  trust_note: "Your workspace activates after our team verifies your transfer.",
  support_whatsapp: "0770877821",
  default_plan: "growth",
  default_billing: "monthly",
  show_card: true,
  show_paypal: true,
};

const defaultForm = (): PaymentMethodForm => ({
  id: null,
  slug: "",
  display_name: "",
  bank_name: "",
  account_name: "",
  rib: "",
  iban: "",
  qr_code_path: null,
  instructions: "Make the bank transfer using the details below, then upload your receipt.",
  sort_order: 100,
  is_active: true,
});

export function PaymentMethodsPage() {
  const [activeView, setActiveView] = useState<"accounts" | "checkout">("accounts");

  return (
    <div className="mx-auto max-w-[1540px] p-4 md:p-6 lg:p-8">
      <PageHeading
        eyebrow="Billing"
        title="Payment methods"
        description="Manage collection accounts and shape the customer checkout from one focused workspace."
      />
      <div className="mb-6 grid gap-3 rounded-2xl border border-base-border bg-base-surface p-2 shadow-sm sm:grid-cols-2">
        <button type="button" onClick={() => setActiveView("accounts")} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${activeView === "accounts" ? "border-brand-accent/30 bg-brand-accent/[0.08] text-ink shadow-sm" : "border-transparent text-ink-muted hover:bg-base-raised"}`}>
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${activeView === "accounts" ? "bg-brand-accent text-white" : "bg-base-raised text-ink-faint"}`}><WalletCards size={18} /></span>
          <span><span className="block text-sm font-bold">Bank accounts</span><span className="mt-0.5 block text-xs opacity-70">Add, edit, order and permanently remove payment methods.</span></span>
        </button>
        <button type="button" onClick={() => setActiveView("checkout")} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${activeView === "checkout" ? "border-brand-accent/30 bg-brand-accent/[0.08] text-ink shadow-sm" : "border-transparent text-ink-muted hover:bg-base-raised"}`}>
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${activeView === "checkout" ? "bg-brand-accent text-white" : "bg-base-raised text-ink-faint"}`}><LayoutTemplate size={18} /></span>
          <span><span className="block text-sm font-bold">Checkout design</span><span className="mt-0.5 block text-xs opacity-70">Control checkout copy, color, plans and optional methods.</span></span>
        </button>
      </div>
      {activeView === "accounts" ? <BankTransferSettings /> : <CheckoutPresentationEditor />}
    </div>
  );
}

function CheckoutPresentationEditor() {
  const [form, setForm] = useState<CheckoutSettings>(checkoutDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.rpc("get_payment_checkout_settings_v1").then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(loadError.message);
      if (data && typeof data === "object") setForm({ ...checkoutDefaults, ...(data as Partial<CheckoutSettings>) });
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: saveError } = await supabase.rpc("update_payment_checkout_settings_v1", { p_settings: form });
      if (saveError) throw saveError;
      if (data && typeof data === "object") setForm({ ...checkoutDefaults, ...(data as Partial<CheckoutSettings>) });
      setMessage("Checkout presentation saved. Customers will see the new settings immediately.");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPanel />;

  return (
    <section className="overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-sm">
      <div className="grid xl:grid-cols-[1.15fr_.85fr]">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><Paintbrush size={19} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-accent">Checkout presentation</p>
              <h2 className="mt-1 text-xl font-bold">Edit the customer payment page</h2>
              <p className="mt-1 text-sm text-ink-muted">Copy, brand color, defaults and optional preview methods are managed here.</p>
            </div>
          </div>

          {error && <p className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          {message && <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</p>}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Checkout headline" value={form.headline} onChange={(headline) => setForm((current) => ({ ...current, headline }))} wide />
            <Field label="Supporting text" value={form.subheadline} onChange={(subheadline) => setForm((current) => ({ ...current, subheadline }))} wide />
            <Field label="Primary button label" value={form.button_label} onChange={(button_label) => setForm((current) => ({ ...current, button_label }))} />
            <Field label="Support WhatsApp" value={form.support_whatsapp} onChange={(support_whatsapp) => setForm((current) => ({ ...current, support_whatsapp }))} />
            <Field label="Trust message" value={form.trust_note} onChange={(trust_note) => setForm((current) => ({ ...current, trust_note }))} wide />
            <label className="text-sm font-semibold">
              Brand accent
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-base-border bg-base-raised px-2">
                <input type="color" value={form.accent_color} onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))} className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0" />
                <input value={form.accent_color} onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
              </span>
            </label>
            <SelectField label="Default plan" value={form.default_plan} options={["starter", "growth", "pro", "scale"]} onChange={(default_plan) => setForm((current) => ({ ...current, default_plan: default_plan as CheckoutSettings["default_plan"] }))} />
            <SelectField label="Default billing" value={form.default_billing} options={["monthly", "yearly"]} onChange={(default_billing) => setForm((current) => ({ ...current, default_billing: default_billing as CheckoutSettings["default_billing"] }))} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Toggle checked={form.show_card} onChange={(show_card) => setForm((current) => ({ ...current, show_card }))} icon={CreditCard} title="Show card preview" detail="Keep card as a secondary, non-live option." />
            <Toggle checked={form.show_paypal} onChange={(show_paypal) => setForm((current) => ({ ...current, show_paypal }))} icon={Smartphone} title="Show PayPal preview" detail="Keep PayPal as a secondary, non-live option." />
          </div>

          <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/15 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving checkout…" : "Save checkout settings"}
          </button>
        </div>

        <div className="border-t border-base-border bg-base-raised/50 p-5 xl:border-l xl:border-t-0 md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Live style preview</p>
          <div className="mt-4 overflow-hidden rounded-[24px] bg-white shadow-xl ring-1 ring-black/5">
            <div className="p-6 text-white" style={{ background: `linear-gradient(135deg, #1c1236 0%, ${form.accent_color} 100%)` }}>
              <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">Ecom OS billing</span>
              <h3 className="mt-5 text-2xl font-black leading-tight">{form.headline || checkoutDefaults.headline}</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">{form.subheadline || checkoutDefaults.subheadline}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {["Starter", "Growth", "Pro", "Scale"].map((plan) => <div key={plan} className="rounded-xl border border-white/15 bg-white/10 p-3 text-xs font-bold">{plan}</div>)}
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: form.accent_color }}>
                <Landmark size={18} style={{ color: form.accent_color }} />
                <div><p className="text-xs font-black text-slate-900">Bank transfer</p><p className="text-[10px] text-slate-500">Primary payment method</p></div>
                <Check size={16} className="ml-auto" style={{ color: form.accent_color }} />
              </div>
              <div className="mt-4 h-10 rounded-xl text-center text-xs font-bold leading-10 text-white" style={{ backgroundColor: form.accent_color }}>{form.button_label || checkoutDefaults.button_label}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BankTransferSettings() {
  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [form, setForm] = useState<PaymentMethodForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrInputKey, setQrInputKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PaymentMethodRow | null>(null);
  const localQrPreview = useMemo(() => qrFile ? URL.createObjectURL(qrFile) : "", [qrFile]);

  useEffect(() => () => {
    if (localQrPreview) URL.revokeObjectURL(localQrPreview);
  }, [localQrPreview]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("payment_methods")
        .select("id, slug, display_name, bank_name, account_name, rib, iban, qr_code_path, instructions, sort_order, is_active, archived_at, created_at, updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      setRows((data as PaymentMethodRow[]) || []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const activeMethods = useMemo(() => rows.filter((row) => row.is_active && !row.archived_at), [rows]);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data: savedData, error: rpcError } = await supabase.rpc("upsert_payment_method_v1", {
        p_id: form.id,
        p_slug: form.slug,
        p_display_name: form.display_name,
        p_bank_name: form.bank_name,
        p_account_name: form.account_name,
        p_rib: form.rib,
        p_iban: form.iban,
        p_instructions: form.instructions,
        p_sort_order: form.sort_order,
        p_is_active: form.is_active,
      });
      if (rpcError) throw rpcError;
      const savedMethod = savedData as { id?: string } | null;
      const savedId = savedMethod?.id || form.id;
      if (!savedId) throw new Error("The bank account was saved, but its identifier was not returned.");

      if (qrFile) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(qrFile.type)) throw new Error("QR code must be a PNG, JPG or WebP image.");
        if (qrFile.size > 2 * 1024 * 1024) throw new Error("QR code image must be smaller than 2 MB.");
        const extension = qrFile.name.split(".").pop()?.toLowerCase() || "png";
        const qrPath = `payment-methods/${savedId}/qr-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-method-assets")
          .upload(qrPath, qrFile, { contentType: qrFile.type, cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        const { error: qrUpdateError } = await supabase.rpc("update_payment_method_qr_v1", {
          p_id: savedId,
          p_qr_code_path: qrPath,
        });
        if (qrUpdateError) {
          await supabase.storage.from("payment-method-assets").remove([qrPath]);
          throw qrUpdateError;
        }
      }

      setMessage(qrFile ? "Bank transfer method and payment QR code saved." : form.id ? "Bank transfer method updated." : "Bank transfer method created.");
      setForm(defaultForm());
      setQrFile(null);
      setQrInputKey((current) => current + 1);
      setEditorOpen(false);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const editMethod = (method: PaymentMethodRow) => {
    setMessage("");
    setError("");
    setQrFile(null);
    setQrInputKey((current) => current + 1);
    setForm({ id: method.id, slug: method.slug, display_name: method.display_name, bank_name: method.bank_name || "", account_name: method.account_name || "", rib: method.rib || "", iban: method.iban || "", qr_code_path: method.qr_code_path, instructions: method.instructions || defaultForm().instructions, sort_order: method.sort_order, is_active: method.is_active });
    setEditorOpen(true);
  };

  const startNewMethod = () => {
    setMessage("");
    setError("");
    setForm(defaultForm());
    setQrFile(null);
    setQrInputKey((current) => current + 1);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setForm(defaultForm());
    setQrFile(null);
    setQrInputKey((current) => current + 1);
    setEditorOpen(false);
  };

  const deleteMethod = async () => {
    if (!pendingDelete) return;
    const method = pendingDelete;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const { data, error: deleteError } = await supabase.rpc("delete_payment_method_v1", { p_id: method.id });
      if (deleteError) throw deleteError;
      const result = data as { id?: string; deleted?: boolean } | null;
      if (!result?.deleted || result.id !== method.id) throw new Error("This payment method was not deleted. Check your billing administrator permission and try again.");

      let qrCleanupFailed = false;
      if (method.qr_code_path) {
        const { error: storageError } = await supabase.storage.from("payment-method-assets").remove([method.qr_code_path]);
        qrCleanupFailed = !!storageError;
      }

      setRows((current) => current.filter((row) => row.id !== method.id));
      if (form.id === method.id) closeEditor();
      setPendingDelete(null);
      setMessage(qrCleanupFailed ? `${method.display_name} was permanently deleted. Its old QR image could not be cleaned up.` : `${method.display_name} was permanently deleted.`);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  const removeQrCode = async () => {
    if (!form.id || !form.qr_code_path) {
      setQrFile(null);
      setQrInputKey((current) => current + 1);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: qrError } = await supabase.rpc("update_payment_method_qr_v1", { p_id: form.id, p_qr_code_path: null });
      if (qrError) throw qrError;
      setForm((current) => ({ ...current, qr_code_path: null }));
      setQrFile(null);
      setQrInputKey((current) => current + 1);
      setMessage("Payment QR code removed from checkout.");
      await load();
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPanel />;

  return (
    <section className="rounded-2xl border border-base-border bg-base-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b border-base-border p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><Landmark size={20} /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Collection accounts</p><h2 className="mt-1 text-xl font-bold">Bank transfer methods</h2><p className="mt-1 text-sm text-ink-muted">Only active accounts appear on checkout. Lower display order appears first.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-base-border bg-base-raised px-3 py-1.5 text-xs font-semibold text-ink-muted"><strong className="text-ink">{rows.length}</strong> total</span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700"><strong>{activeMethods.length}</strong> active</span>
          <button type="button" onClick={startNewMethod} className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-accent/15"><Plus size={16} /> Add bank account</button>
        </div>
      </div>

      {(error || message) && <div className="px-5 pt-5 md:px-6">{error && <p className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</p>}{message && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</p>}</div>}

      <div className={`grid gap-5 p-5 md:p-6 ${editorOpen ? "xl:grid-cols-[minmax(0,1.25fr)_minmax(390px_.75fr)]" : "grid-cols-1"}`}>
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Configured accounts</h3><p className="mt-1 text-xs text-ink-muted">Edit account details or permanently delete methods you no longer use.</p></div></div>
          <div className="space-y-3">
            {!rows.length ? <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-base-border bg-base-raised/30 p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-accent/10 text-brand-accent"><WalletCards size={22} /></span><h4 className="mt-4 font-bold">No payment account yet</h4><p className="mt-1 max-w-sm text-sm text-ink-muted">Add your first bank account to enable bank transfer on checkout.</p><button type="button" onClick={startNewMethod} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-bold text-white"><Plus size={15} /> Add bank account</button></div></div> : rows.map((method, index) => (
              <article key={method.id} className={`rounded-2xl border p-4 transition ${method.is_active && !method.archived_at ? "border-base-border bg-base-raised/35 hover:border-emerald-500/30" : "border-base-border bg-base-raised/70 opacity-75"}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-[210px] flex-1 items-center gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${method.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-base-surface text-ink-faint"}`}><Building2 size={18} /></span>
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate font-bold text-ink">{method.display_name}</h4>{index === 0 && method.is_active && !method.archived_at && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white">Default</span>}<span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${method.is_active && !method.archived_at ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-ink-muted"}`}>{method.is_active && !method.archived_at ? "Active" : "Inactive"}</span></div><p className="mt-1 truncate text-xs text-ink-muted">{method.bank_name || "Bank not entered"} · {method.slug}</p></div>
                  </div>
                  <div className="grid flex-[1.4] gap-2 sm:grid-cols-3"><CompactInfo label="Account holder" value={method.account_name || "—"} /><CompactInfo label="RIB / IBAN" value={method.rib || method.iban || "—"} /><CompactInfo label="QR & order" value={`${method.qr_code_path ? "QR ready" : "No QR"} · #${method.sort_order}`} /></div>
                  <div className="flex shrink-0 items-center gap-2 lg:ps-2"><button type="button" onClick={() => editMethod(method)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-base-border px-3 text-xs font-bold text-ink-muted hover:border-brand-accent/30 hover:text-brand-accent" aria-label={`Edit ${method.display_name}`}><PencilLine size={14} /> Edit</button><button type="button" onClick={() => setPendingDelete(method)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/20 px-3 text-xs font-bold text-danger hover:bg-danger/10" aria-label={`Delete ${method.display_name}`}><Trash2 size={14} /> Delete</button></div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {editorOpen && <aside className="self-start rounded-2xl border border-base-border bg-base-raised/40 p-4 xl:sticky xl:top-6">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-accent">{form.id ? "Edit account" : "New account"}</p><h3 className="mt-1 text-lg font-bold">{form.id ? form.display_name || "Bank account" : "Add bank transfer method"}</h3></div><button type="button" onClick={closeEditor} className="rounded-lg border border-base-border p-2 text-ink-faint hover:text-ink" aria-label="Close editor"><X size={16} /></button></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Method name" value={form.display_name} onChange={(display_name) => setForm((current) => ({ ...current, display_name }))} />
            <Field label="Slug" value={form.slug} onChange={(slug) => setForm((current) => ({ ...current, slug }))} />
            <Field label="Bank name" value={form.bank_name} onChange={(bank_name) => setForm((current) => ({ ...current, bank_name }))} />
            <Field label="Account holder" value={form.account_name} onChange={(account_name) => setForm((current) => ({ ...current, account_name }))} />
            <Field label="RIB" value={form.rib} onChange={(rib) => setForm((current) => ({ ...current, rib }))} />
            <Field label="IBAN" value={form.iban} onChange={(iban) => setForm((current) => ({ ...current, iban }))} />
            <Field label="Display order" value={String(form.sort_order)} onChange={(value) => setForm((current) => ({ ...current, sort_order: Number(value) || 100 }))} />
          </div>
          <label className="mt-3 block text-sm font-semibold">Customer instructions<textarea rows={3} value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} className="mt-2 w-full rounded-xl border border-base-border bg-base-surface p-3 text-sm outline-none focus:border-brand-accent" /></label>
          <div className="mt-3 rounded-2xl border border-base-border bg-base-surface p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><QrCode size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Payment QR code</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">Upload the bank’s official payment QR. It will appear beside the RIB and IBAN on checkout.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[92px_1fr] sm:items-center">
              <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-dashed border-base-border bg-white p-2">
                {localQrPreview ? <img src={localQrPreview} alt="New payment QR preview" className="h-full w-full object-contain" /> : form.qr_code_path ? <img src={paymentAssetUrl(form.qr_code_path)} alt="Payment QR preview" className="h-full w-full object-contain" /> : <QrCode size={38} className="text-ink-faint" />}
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-ink px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-90"><Upload size={15} />{form.qr_code_path || qrFile ? "Replace QR image" : "Upload QR image"}<input key={qrInputKey} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setQrFile(event.target.files?.[0] || null)} /></label>
                {(form.qr_code_path || qrFile) && <button type="button" onClick={() => void removeQrCode()} className="ms-2 inline-flex items-center gap-1.5 rounded-xl border border-danger/20 px-3 py-2.5 text-xs font-bold text-danger hover:bg-danger/5"><Trash2 size={14} /> Remove</button>}
                <p className="mt-2 text-[11px] text-ink-faint">PNG, JPG or WebP · maximum 2 MB · square image recommended</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-base-border pt-4"><label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} /> Active on checkout</label><div className="flex gap-2"><button type="button" onClick={closeEditor} className="rounded-xl border border-base-border px-4 py-2.5 text-sm font-bold text-ink-muted">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : form.id ? "Save changes" : "Create account"}</button></div></div>
        </aside>}
      </div>

      {pendingDelete && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-payment-method-title" className="w-full max-w-md rounded-2xl border border-danger/20 bg-base-surface p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><AlertTriangle size={20} /></span><div><h3 id="delete-payment-method-title" className="text-lg font-bold">Delete payment method?</h3><p className="mt-1 text-sm leading-6 text-ink-muted"><strong className="text-ink">{pendingDelete.display_name}</strong> will be permanently removed from this page and from customer checkout.</p></div></div>{activeMethods.length === 1 && pendingDelete.is_active && !pendingDelete.archived_at && <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700">This is your last active bank account. Checkout will have no bank transfer account after deletion.</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setPendingDelete(null)} className="rounded-xl border border-base-border px-4 py-2.5 text-sm font-bold text-ink-muted disabled:opacity-50">Keep method</button><button type="button" disabled={deleting} onClick={() => void deleteMethod()} className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{deleting ? "Deleting…" : "Delete permanently"}</button></div></div></div>}
    </section>
  );
}

function Field({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <label className={`text-sm font-semibold ${wide ? "md:col-span-2" : ""}`}>{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="field mt-2 w-full" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="field mt-2 w-full capitalize">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Toggle({ checked, onChange, icon: Icon, title, detail }: { checked: boolean; onChange: (checked: boolean) => void; icon: typeof CreditCard; title: string; detail: string }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-brand-accent/30 bg-brand-accent/[0.06]" : "border-base-border bg-base-raised/40"}`}><Icon size={18} className={checked ? "text-brand-accent" : "text-ink-faint"} /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-ink-muted">{detail}</span></span><span className={`relative h-5 w-9 rounded-full ${checked ? "bg-brand-accent" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} /></span></button>;
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-base-border/70 bg-base-surface px-3 py-2.5"><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-ink-faint">{label}</span><span className="mt-1 block truncate text-xs font-semibold text-ink" title={value}>{value}</span></div>;
}

function paymentAssetUrl(path: string) {
  return supabase.storage.from("payment-method-assets").getPublicUrl(path).data.publicUrl;
}

function LoadingPanel() {
  return <div className="grid h-44 place-items-center rounded-2xl border border-base-border bg-base-surface"><Loader2 className="animate-spin text-brand-accent" /></div>;
}
