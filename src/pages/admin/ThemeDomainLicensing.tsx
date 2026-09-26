import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, Edit3, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { usePlatformAdmin } from "../../components/PlatformAdminRoute";
import { normalizeThemeDomain } from "../../lib/themeDomain";
import { themeLicensing, type ThemeLicense } from "../../lib/themeLicensing";

function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong"; }
function time(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never"; }
function statusClass(status: ThemeLicense["status"]) {
  return status === "active" ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700" :
    status === "disabled" ? "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700" :
      "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700";
}

export default function ThemeDomainLicensing() {
  const { can } = usePlatformAdmin();
  const [licenses, setLicenses] = useState<ThemeLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rawCode, setRawCode] = useState("");
  const [editing, setEditing] = useState<ThemeLicense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [domain, setDomain] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setLicenses((await themeLicensing.list()).licenses); }
    catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!can("settings.manage")) return <div className="mx-auto max-w-3xl p-8"><h1 className="text-xl font-black">Access denied</h1><p className="mt-2 text-sm text-ink-muted">Theme licenses are restricted to platform administrators.</p></div>;

  const closeForm = () => { setEditing(null); setLabel(""); setDomain(""); setFormOpen(false); };
  const startCreate = () => { setEditing(null); setLabel(""); setDomain(""); setError(""); setFormOpen(true); };
  const startEdit = (license: ThemeLicense) => { setEditing(license); setLabel(license.label); setDomain(license.domain); setError(""); setFormOpen(true); };
  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const normalized = normalizeThemeDomain(domain);
      if (editing) { await themeLicensing.update(editing.id, { label: label.trim(), domain: normalized }); setNotice("License updated."); }
      else { const result = await themeLicensing.create(label.trim(), normalized); setRawCode(result.code); setNotice("License created. Copy the code now; it cannot be retrieved later."); }
      closeForm(); await load();
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  const action = async (license: ThemeLicense, kind: "enable" | "disable" | "revoke" | "rotate") => {
    if ((kind === "revoke" || kind === "disable") && !window.confirm(kind === "revoke" ? "Revoke this license permanently? The current code will stop working." : "Disable this license? The theme will stop authorizing until enabled again.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      if (kind === "rotate") { const result = await themeLicensing.rotate(license.id); setRawCode(result.code); setNotice("Code rotated. The old code is invalid."); }
      else { await themeLicensing.setStatus(license.id, kind); setNotice(kind === "revoke" ? "License revoked." : kind === "disable" ? "License disabled." : "License enabled."); }
      await load();
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  const copyCode = async () => { await navigator.clipboard.writeText(rawCode); setNotice("License code copied."); };

  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-accent">Private platform control</p><h1 className="mt-1 text-2xl font-black">Theme domain licensing</h1><p className="mt-2 max-w-2xl text-sm text-ink-muted">Control which YouCan storefront domains may load the licensed theme. Raw codes are shown only once.</p></div>
      <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-3 text-sm font-black text-white"><Plus size={16} /> Add domain</button>
    </div>
    {(error || notice) && <div className={error ? "mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" : "mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"}>{error || notice}</div>}
    {rawCode && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-amber-950">Copy this license code now</p><p className="mt-1 text-sm text-amber-800">It is displayed once and cannot be retrieved later. Rotation invalidates the previous code.</p></div><button onClick={() => setRawCode("")} aria-label="Close"><X size={18} /></button></div><div className="mt-4 flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-3 text-xs text-amber-950">{rawCode}</code><button onClick={() => void copyCode()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white"><Clipboard size={15} /> Copy</button></div></div>}
    <section className="mt-6 overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-base-border px-5 py-4"><div><h2 className="font-black">Licensed domains</h2><p className="mt-1 text-xs text-ink-muted">{licenses.length} license{licenses.length === 1 ? "" : "s"}</p></div><button onClick={() => void load()} disabled={loading} className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-ink"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></div>
      {loading ? <div className="grid place-items-center p-14"><Loader2 className="animate-spin text-brand-accent" /></div> : licenses.length === 0 ? <div className="p-14 text-center"><ShieldCheck className="mx-auto text-ink-faint" /><p className="mt-3 font-bold">No domain licenses yet</p><p className="mt-1 text-sm text-ink-muted">Add the first storefront domain to begin.</p></div> : <div className="divide-y divide-base-border">{licenses.map((license) => <div key={license.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto] lg:items-center"><div><div className="flex items-center gap-2"><p className="font-black">{license.label}</p><span className={statusClass(license.status)}>{license.status}</span></div><p className="mt-1 font-mono text-xs text-ink-muted">{license.domain}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Created</p><p className="mt-1 text-xs">{time(license.created_at)}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Last check</p><p className="mt-1 text-xs">{time(license.last_checked_at)}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><button onClick={() => startEdit(license)} className="inline-flex items-center gap-1 rounded-lg border border-base-border px-2.5 py-2 text-xs font-bold"><Edit3 size={13} /> Edit</button>{license.status === "active" ? <button onClick={() => void action(license, "disable")} disabled={saving} className="rounded-lg border border-amber-200 px-2.5 py-2 text-xs font-bold text-amber-700">Disable</button> : license.status === "disabled" ? <button onClick={() => void action(license, "enable")} disabled={saving} className="rounded-lg border border-emerald-200 px-2.5 py-2 text-xs font-bold text-emerald-700">Enable</button> : null}{license.status !== "revoked" && <button onClick={() => void action(license, "rotate")} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-2 text-xs font-bold text-violet-700"><KeyRound size={13} /> Rotate</button>}{license.status !== "revoked" && <button onClick={() => void action(license, "revoke")} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-bold text-red-700"><Trash2 size={13} /> Revoke</button>}</div></div>)}</div>}
    </section>
    {formOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{editing ? "Edit domain license" : "Add domain license"}</h2><button onClick={closeForm}><X size={18} /></button></div><p className="mt-2 text-sm text-ink-muted">Use the exact storefront hostname. Protocol, path, port, trailing dot, and www are normalized automatically.</p><label className="mt-5 block text-xs font-black uppercase tracking-wider text-ink-muted">Label<input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-2 w-full rounded-xl border border-base-border bg-base-raised px-3 py-3 text-sm outline-none focus:border-brand-accent" placeholder="YouCan store" /></label><label className="mt-4 block text-xs font-black uppercase tracking-wider text-ink-muted">Domain<input value={domain} onChange={(event) => setDomain(event.target.value)} className="mt-2 w-full rounded-xl border border-base-border bg-base-raised px-3 py-3 font-mono text-sm outline-none focus:border-brand-accent" placeholder="store.example.com" /></label><div className="mt-6 flex justify-end gap-2"><button onClick={closeForm} className="rounded-xl border border-base-border px-4 py-3 text-sm font-bold">Cancel</button><button onClick={() => void save()} disabled={saving || !label.trim() || !domain.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}<Check size={15} /> {editing ? "Save changes" : "Create license"}</button></div></div></div>}
  </div>;
}
