import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clipboard, KeyRound, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { toast } from "../../../components/Toast";
import { clientLicensing, type ClientLicense, type ClientLicenseInput } from "../../../lib/clientLicensing";
import { normalizeThemeDomain } from "../../../lib/themeDomain";
import { fieldClass, formatDate, formatMoney, labelClass, primaryButton, secondaryButton, StatusBadge } from "./licenseUi";

const CURRENCIES = ["USD", "MAD", "EUR", "SAR", "AED"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function emptyForm(): ClientLicenseInput {
  return { client_name: "", phone: "", email: "", theme_name: "", price: "", currency: "MAD", notes: "", order_reference: "", payment_notes: "", domains: [""] };
}

function fromLicense(license: ClientLicense): ClientLicenseInput {
  return {
    client_name: license.client_name,
    phone: license.phone,
    email: license.email || "",
    theme_name: license.theme_name,
    price: license.price,
    currency: license.currency,
    notes: license.notes || "",
    order_reference: license.order_reference || "",
    payment_notes: license.payment_notes || "",
  };
}

export function ClientLicenseFormModal({ license, onClose, onSaved }: { license?: ClientLicense; onClose: () => void; onSaved: (license: ClientLicense) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<ClientLicenseInput>(() => license ? fromLicense(license) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ license: ClientLicense; code: string } | null>(null);
  const domains = form.domains || [""];

  const update = (field: keyof ClientLicenseInput, value: string | string[]) => setForm((current) => ({ ...current, [field]: value }));
  const updateDomain = (index: number, value: string) => update("domains", domains.map((domain, position) => position === index ? value : domain));
  const removeDomain = (index: number) => update("domains", domains.filter((_, position) => position !== index));

  const submit = async () => {
    setError("");
    if (!form.client_name.trim() || !form.phone.trim() || !form.theme_name.trim() || String(form.price).trim() === "") {
      setError("Complete all required client, theme, and sale fields.");
      return;
    }
    let normalizedDomains: string[] | undefined;
    if (!license) {
      try {
        normalizedDomains = domains.map(normalizeThemeDomain);
        if (new Set(normalizedDomains).size !== normalizedDomains.length) throw new Error("Remove duplicate domains");
      } catch (domainError) {
        setError(errorMessage(domainError));
        return;
      }
    }
    setSaving(true);
    try {
      if (license) {
        const result = await clientLicensing.update(license.id, form);
        toast.success("Client license updated. The license key did not change.");
        onSaved(result.license);
        onClose();
      } else {
        const result = await clientLicensing.create({ ...form, domains: normalizedDomains });
        setCreated(result);
        onSaved(result.license);
        toast.success("Client license created.");
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return <Modal title="License created" onClose={onClose}>
      <div className="mx-auto max-w-2xl py-3 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 size={30} /></div>
        <h3 className="mt-4 text-xl font-black text-ink">License created successfully</h3>
        <p className="mt-1 text-sm text-ink-muted">This permanent key authorizes the domains below and remains available from the client detail page.</p>
        <div className="mt-6 rounded-2xl border border-brand-accent/20 bg-brand-accent/[0.05] p-5 text-left">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Client</p><p className="mt-1 font-bold">{created.license.client_name}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Theme</p><p className="mt-1 font-bold">{created.license.theme_name}</p></div>
          </div>
          <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">License</p><code className="mt-2 block break-all rounded-xl bg-base-surface px-4 py-3 text-sm font-black text-brand-accent">{created.code}</code></div>
          <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Authorized domains</p><div className="mt-2 flex flex-wrap gap-2">{created.license.domains.filter((domain) => domain.status !== "removed").map((domain) => <span key={domain.id} className="rounded-full border border-base-border bg-base-surface px-3 py-1.5 font-mono text-xs">{domain.hostname}</span>)}</div></div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className={primaryButton} onClick={async () => { await navigator.clipboard.writeText(created.code); toast.success("License copied."); }}><Clipboard size={16} /> Copy license</button>
          <button className={secondaryButton} onClick={() => navigate(`/admin/client-licenses/${created.license.id}`)}>View client</button>
          <button className={secondaryButton} onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>;
  }

  return <Modal title={license ? "Edit client license" : "Add client & generate license"} onClose={onClose}>
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      <section>
        <div className="mb-3 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-accent/10 text-xs font-black text-brand-accent">1</span><div><h3 className="text-sm font-black">Client information</h3><p className="text-xs text-ink-muted">Customer identity and contact details.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Client name *<input className={fieldClass} value={form.client_name} onChange={(event) => update("client_name", event.target.value)} placeholder="Ahmed Store" /></label>
          <label className={labelClass}>Phone number *<input className={fieldClass} value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+212 6XX XX XX XX" /></label>
          <label className={labelClass}>Email<input type="email" className={fieldClass} value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="client@example.com" /></label>
          <label className={`${labelClass} sm:col-span-2`}>Notes<textarea rows={3} className={`${fieldClass} resize-y`} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional internal client notes" /></label>
        </div>
      </section>

      <section className="border-t border-base-border pt-6">
        <div className="mb-3 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-accent/10 text-xs font-black text-brand-accent">2</span><div><h3 className="text-sm font-black">Theme & sale</h3><p className="text-xs text-ink-muted">Theme is stored as a text field; no theme catalog is created.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>Theme name *<input className={fieldClass} value={form.theme_name} onChange={(event) => update("theme_name", event.target.value)} placeholder="LYBRA Editorial Pro" /></label>
          <label className={labelClass}>Sale price *<input type="number" min="0" step="0.01" className={fieldClass} value={form.price} onChange={(event) => update("price", event.target.value)} placeholder="99.00" /></label>
          <label className={labelClass}>Currency *<select className={fieldClass} value={form.currency} onChange={(event) => update("currency", event.target.value)}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className={labelClass}>Order/reference number<input className={fieldClass} value={form.order_reference} onChange={(event) => update("order_reference", event.target.value)} placeholder="ORDER-1024" /></label>
          <label className={labelClass}>Payment notes<input className={fieldClass} value={form.payment_notes} onChange={(event) => update("payment_notes", event.target.value)} placeholder="Paid by bank transfer" /></label>
        </div>
      </section>

      {!license && <section className="border-t border-base-border pt-6">
        <div className="mb-3 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-accent/10 text-xs font-black text-brand-accent">3</span><div><h3 className="text-sm font-black">Allowed domains</h3><p className="text-xs text-ink-muted">URLs are normalized to hostnames. Add as many domains as needed.</p></div></div>
        <div className="space-y-3">
          {domains.map((domain, index) => <div key={index} className="flex items-center gap-2">
            <label className="min-w-0 flex-1"><span className="sr-only">Domain #{index + 1}</span><input className={`${fieldClass} mt-0 font-mono`} value={domain} onChange={(event) => updateDomain(index, event.target.value)} placeholder={index === 0 ? "https://ahmedstore.com/products" : "shop.ahmedstore.com"} /></label>
            {domains.length > 1 && <button type="button" onClick={() => removeDomain(index)} aria-label={`Remove domain ${index + 1}`} className="grid h-10 w-10 place-items-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>}
          </div>)}
        </div>
        <button type="button" onClick={() => update("domains", [...domains, ""])} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand-accent"><Plus size={15} /> Add domain</button>
      </section>}

      {license && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">Editing client or sale information does not change the permanent license key. Domains are managed separately.</div>}
      <div className="flex justify-end gap-2 border-t border-base-border pt-4"><button className={secondaryButton} onClick={onClose}>Cancel</button><button className={primaryButton} disabled={saving} onClick={() => void submit()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}{license ? "Save changes" : "Generate license"}</button></div>
    </div>
  </Modal>;
}

export function ImportLicenseModal({ onClose, onRestored }: { onClose: () => void; onRestored: (license: ClientLicense) => void }) {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<ClientLicense | null>(null);
  const [error, setError] = useState("");

  const domains = useMemo(() => result?.domains.filter((domain) => domain.status !== "removed") || [], [result]);
  const search = async () => {
    setSearching(true); setError(""); setSearched(false); setResult(null);
    try {
      const response = await clientLicensing.lookup(key.trim());
      setSearched(true);
      setResult(response.license || null);
    } catch (lookupError) { setError(errorMessage(lookupError)); }
    finally { setSearching(false); }
  };
  const restore = async () => {
    if (!result) return;
    setRestoring(true); setError("");
    try {
      const response = await clientLicensing.setStatus(result.id, "restore");
      setResult(response.license); onRestored(response.license);
      toast.success("The original license is active again. No customer theme update is required.");
    } catch (restoreError) { setError(errorMessage(restoreError)); }
    finally { setRestoring(false); }
  };

  return <Modal title="Import existing license" onClose={onClose}>
    <div className="mx-auto max-w-2xl py-2">
      <div className="rounded-2xl border border-base-border bg-base-raised/60 p-5">
        <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><RotateCcw size={19} /></div><div><h3 className="font-black">Recover the original license</h3><p className="mt-1 text-sm leading-6 text-ink-muted">Paste the exact key already installed in the customer theme. This search never creates a duplicate or a replacement key.</p></div></div>
        <label className={`${labelClass} mt-5`}>Existing license key<input autoFocus className={`${fieldClass} font-mono uppercase`} value={key} onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && key.trim()) void search(); }} placeholder="ECO-LIC-7K9F-4Q2M-X81A" /></label>
        <button className={`${primaryButton} mt-3 w-full`} disabled={!key.trim() || searching} onClick={() => void search()}>{searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search license</button>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {searched && !result && <div className="mt-4 rounded-2xl border border-base-border p-6 text-center"><h3 className="font-black">License not found</h3><p className="mt-2 text-sm text-ink-muted">No active, disabled, archived, or revoked record matches this key. A new record was not created.</p></div>}
      {result && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Existing license found</p><h3 className="mt-1 text-lg font-black">{result.client_name}</h3></div><StatusBadge status={result.status} /></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Theme</p><p className="mt-1 text-sm font-bold">{result.theme_name}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Price</p><p className="mt-1 text-sm font-bold">{formatMoney(result.price, result.currency)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Created</p><p className="mt-1 text-sm font-bold">{formatDate(result.created_at)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Domains</p><p className="mt-1 text-sm font-bold">{domains.length}</p></div>
        </div>
        <code className="mt-4 block break-all rounded-xl border border-base-border bg-base-surface px-4 py-3 text-sm font-black text-brand-accent">{result.license_key || result.license_display}</code>
        {result.status === "active" && <p className="mt-4 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800">This license is already active.</p>}
        {result.status === "revoked" && <p className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm font-bold text-red-800">This license was permanently revoked and cannot be restored through Import License.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={secondaryButton} onClick={() => navigate(`/admin/client-licenses/${result.id}`)}>View client</button>{(result.status === "archived" || result.status === "disabled") && <button className={primaryButton} disabled={restoring} onClick={() => void restore()}>{restoring && <Loader2 size={16} className="animate-spin" />} Restore license</button>}</div>
      </div>}
    </div>
  </Modal>;
}
