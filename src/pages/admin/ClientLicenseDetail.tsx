import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, Archive, ArrowLeft, CheckCircle2, Clipboard, Edit3, Globe2, KeyRound, Loader2, Mail, MessageSquareText, Phone, Plus, RefreshCw, RotateCw, ShieldBan, Trash2, UserRound } from "lucide-react";
import { Modal } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { usePlatformAdmin } from "../../components/PlatformAdminRoute";
import { clientLicensing, type ClientLicense, type LicenseDomain } from "../../lib/clientLicensing";
import { normalizeThemeDomain } from "../../lib/themeDomain";
import { ClientLicenseFormModal } from "./client-licenses/ClientLicenseModals";
import { UnauthorizedMessageModal } from "./client-licenses/UnauthorizedMessageModal";
import { dangerButton, DomainStatusBadge, fieldClass, formatDate, formatMoney, labelClass, primaryButton, relativeTime, secondaryButton, StatusBadge } from "./client-licenses/licenseUi";

type Confirmation = { kind: "disable" | "enable" | "archive" | "restore" | "rotate" | "revoke" | "domain-remove"; domain?: LicenseDomain };

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong"; }
function eventTitle(type: string) {
  const labels: Record<string, string> = {
    LICENSE_CREATED: "License created", LICENSE_VALIDATED: "Domain validation succeeded", DOMAIN_ADDED: "Domain added",
    DOMAIN_REMOVED: "Domain removed", DOMAIN_DISABLED: "Domain disabled", DOMAIN_ENABLED: "Domain enabled",
    DOMAIN_MISMATCH: "Unauthorized domain blocked", LICENSE_VALIDATION_BLOCKED: "License validation blocked",
    LICENSE_DISABLED: "License disabled", LICENSE_ENABLED: "License enabled", LICENSE_ARCHIVED: "License archived",
    LICENSE_RESTORED: "License restored", LICENSE_IMPORTED: "License imported", LICENSE_ROTATED: "License rotated",
    LICENSE_REVOKED: "License revoked", CLIENT_UPDATED: "Client information updated", LEGACY_LICENSE_MIGRATED: "Legacy license migrated",
    UNAUTHORIZED_MESSAGE_UPDATED: "Unauthorized theme message updated",
  };
  return labels[type] || type.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

export default function ClientLicenseDetail() {
  const { can } = usePlatformAdmin();
  const { id = "" } = useParams();
  const [license, setLicense] = useState<ClientLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [messageEditorOpen, setMessageEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setLicense((await clientLicensing.get(id)).license); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const useResult = (next: ClientLicense, message: string) => { setLicense(next); toast.success(message); };
  const statusAction = async (action: "disable" | "enable" | "archive" | "restore" | "revoke") => {
    if (!license) return;
    setWorking(true);
    try { useResult((await clientLicensing.setStatus(license.id, action)).license, action === "restore" ? "Original license restored. No customer theme update is required." : `License ${action}d.`); setConfirmation(null); setConfirmText(""); }
    catch (actionError) { toast.error(errorMessage(actionError)); }
    finally { setWorking(false); }
  };
  const rotate = async () => {
    if (!license) return;
    setWorking(true);
    try {
      const result = await clientLicensing.rotate(license.id);
      useResult(result.license, "License rotated. Update the customer theme with the new key.");
      setConfirmation(null);
    } catch (rotateError) { toast.error(errorMessage(rotateError)); }
    finally { setWorking(false); }
  };
  const domainAction = async (hostname: string, action: "add" | "disable" | "enable" | "remove") => {
    if (!license) return;
    setWorking(true);
    try {
      const normalized = normalizeThemeDomain(hostname);
      useResult((await clientLicensing.domainAction(license.id, normalized, action)).license, `Domain ${action === "add" ? "added" : action === "remove" ? "removed" : `${action}d`}. The license key did not change.`);
      setAddDomainOpen(false); setNewDomain(""); setConfirmation(null);
    } catch (domainError) { toast.error(errorMessage(domainError)); }
    finally { setWorking(false); }
  };

  if (!can("settings.manage")) return <div className="mx-auto max-w-3xl p-8"><h1 className="text-xl font-black">Access denied</h1></div>;
  if (loading) return <div className="mx-auto max-w-[1400px] space-y-4 p-6">{Array.from({ length: 5 }, (_, index) => <div key={index} className={`animate-pulse rounded-2xl bg-base-raised ${index === 0 ? "h-28" : "h-48"}`} />)}</div>;
  if (!license) return <div className="mx-auto max-w-3xl p-8"><Link to="/admin/client-licenses" className="text-sm font-bold text-brand-accent">← Client Licenses</Link><div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6"><h1 className="font-black">License unavailable</h1><p className="mt-2 text-sm text-red-700">{error || "The client license could not be found."}</p></div></div>;

  const activeDomains = license.domains.filter((domain) => domain.status !== "removed");
  return <div className="mx-auto max-w-[1400px] p-4 md:p-6 lg:p-8">
    <Link to="/admin/client-licenses" className="inline-flex items-center gap-2 text-sm font-bold text-ink-muted hover:text-brand-accent"><ArrowLeft size={16} /> Client Licenses</Link>
    <header className="mt-4 flex flex-col gap-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black md:text-3xl">{license.client_name}</h1><StatusBadge status={license.status} /></div><p className="mt-2 text-sm text-ink-muted"><span className="font-bold text-ink">Theme:</span> {license.theme_name}</p></div>
      <div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => setEditing(true)}><Edit3 size={16} /> Edit client</button><button className={secondaryButton} onClick={() => void load()}><RefreshCw size={16} /> Refresh</button></div>
    </header>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><UserRound size={19} /></div><div><h2 className="font-black">Client information</h2><p className="text-xs text-ink-muted">Customer profile and internal notes</p></div></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Client name</p><p className="mt-1 text-sm font-bold">{license.client_name}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Created</p><p className="mt-1 text-sm font-bold">{formatDate(license.created_at, true)}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Phone</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><Phone size={14} className="text-ink-faint" /> {license.phone || "Not provided"}</p></div>
            <div><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Email</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><Mail size={14} className="text-ink-faint" /> {license.email || "Not provided"}</p></div>
          </div>
          <div className="mt-5 border-t border-base-border pt-4"><p className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{license.notes || "No notes added."}</p></div>
        </section>

        <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><KeyRound size={19} /></div><div><h2 className="font-black">License</h2><p className="text-xs text-ink-muted">Permanent client identity and activation controls</p></div></div>
          <div className="mt-5 rounded-2xl border border-brand-accent/20 bg-brand-accent/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-accent">Full exact license key</p>{license.license_key ? <code className="mt-2 block break-all text-lg font-black tracking-wide text-ink">{license.license_key}</code> : <div className="mt-2"><p className="font-bold text-amber-700">Legacy key not yet recoverable</p><p className="mt-1 text-xs leading-5 text-ink-muted">Use Import License and paste the key already embedded in the customer theme. The system will securely attach it to this existing record.</p></div>}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={primaryButton} disabled={!license.license_key} onClick={async () => { if (license.license_key) { await navigator.clipboard.writeText(license.license_key); toast.success("License copied."); } }}><Clipboard size={16} /> Copy license</button>
            {license.status === "active" && <button className={secondaryButton} onClick={() => setConfirmation({ kind: "disable" })}><ShieldBan size={16} /> Disable license</button>}
            {license.status === "disabled" && <button className={secondaryButton} onClick={() => setConfirmation({ kind: "enable" })}><CheckCircle2 size={16} /> Enable license</button>}
            {license.status === "archived" && <button className={secondaryButton} onClick={() => setConfirmation({ kind: "restore" })}><RefreshCw size={16} /> Restore license</button>}
            {license.status !== "archived" && license.status !== "revoked" && <button className={secondaryButton} onClick={() => setConfirmation({ kind: "archive" })}><Archive size={16} /> Archive license</button>}
            {license.status !== "revoked" && <button className={secondaryButton} onClick={() => setConfirmation({ kind: "rotate" })}><RotateCw size={16} /> Rotate license</button>}
            {license.status !== "revoked" && <button className={dangerButton} onClick={() => setConfirmation({ kind: "revoke" })}><Trash2 size={16} /> Revoke</button>}
          </div>
        </section>

        <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><MessageSquareText size={19} /></div><div><h2 className="font-black">Unauthorized theme message</h2><p className="text-xs text-ink-muted">Shown by the customer theme when authorization fails</p></div></div><button className={secondaryButton} onClick={() => setMessageEditorOpen(true)}>Preview & edit</button></div>
          {license.has_custom_unauthorized_message && license.unauthorized_message ? <div className="mt-5 rounded-xl border border-base-border bg-base-raised/60 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-brand-accent">Custom for this client</p><p className="mt-2 font-black">{license.unauthorized_message.title}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{license.unauthorized_message.message}</p><p className="mt-3 text-xs font-bold text-ink-muted">Primary action: {license.unauthorized_message.primary_button_text}</p></div> : <div className="mt-5 rounded-xl border border-dashed border-base-border bg-base-raised/40 p-4"><p className="text-sm font-black">Using the global default message</p><p className="mt-1 text-xs leading-5 text-ink-muted">Set a custom plain-text message any time without changing this permanent license key or customer theme code.</p></div>}
        </section>

        <section id="domains" className="scroll-mt-6 rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><Globe2 size={19} /></div><div><h2 className="font-black">Authorized domains</h2><p className="text-xs text-ink-muted">{activeDomains.length} current hostname{activeDomains.length === 1 ? "" : "s"}</p></div></div><button className={primaryButton} disabled={license.status === "revoked"} onClick={() => setAddDomainOpen(true)}><Plus size={16} /> Add domain</button></div>
          <div className="mt-5 divide-y divide-base-border rounded-xl border border-base-border">{license.domains.length === 0 ? <p className="p-5 text-sm text-ink-muted">No domains recorded.</p> : license.domains.map((domain) => <div key={domain.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${domain.status === "removed" ? "opacity-55" : ""}`}>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><code className="truncate text-sm font-black">{domain.hostname}</code><DomainStatusBadge status={domain.status} /></div><p className="mt-1 text-xs text-ink-muted">Last checked: {relativeTime(domain.last_check_at)}</p></div>
            {domain.status !== "removed" && license.status !== "revoked" && <div className="flex gap-2">{domain.status === "active" ? <button className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700" onClick={() => void domainAction(domain.hostname, "disable")}>Disable</button> : <button className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700" onClick={() => void domainAction(domain.hostname, "enable")}>Enable</button>}<button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700" onClick={() => setConfirmation({ kind: "domain-remove", domain })}>Remove</button></div>}
          </div>)}</div>
          <p className="mt-3 text-xs text-ink-muted">Adding, disabling, or removing a domain never changes the license key.</p>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><Activity size={19} /></div><div><h2 className="font-black">Sale information</h2><p className="text-xs text-ink-muted">Commercial details for this license</p></div></div>
          <dl className="mt-5 space-y-4"><div><dt className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Theme name</dt><dd className="mt-1 text-sm font-bold">{license.theme_name}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Sale price</dt><dd className="mt-1 text-xl font-black text-emerald-600">{formatMoney(license.price, license.currency)}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Order/reference</dt><dd className="mt-1 text-sm font-bold">{license.order_reference || "Not provided"}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wider text-ink-faint">Payment notes</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{license.payment_notes || "No payment notes."}</dd></div></dl>
        </section>

        <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><Activity size={19} /></div><div><h2 className="font-black">Activity timeline</h2><p className="text-xs text-ink-muted">Immutable licensing audit history</p></div></div>
          <div className="mt-5 space-y-0">{(license.events || []).length === 0 ? <p className="text-sm text-ink-muted">No activity recorded.</p> : (license.events || []).map((event, index, events) => <div key={event.id} className="relative flex gap-3 pb-5">{index < events.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-base-border" />}<span className={`relative mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-base-surface ${event.event_type.includes("BLOCKED") || event.event_type.includes("MISMATCH") || event.event_type.includes("REVOKED") ? "bg-red-500" : event.event_type.includes("VALIDATED") || event.event_type.includes("RESTORED") || event.event_type.includes("ENABLED") ? "bg-emerald-500" : "bg-brand-accent"}`} /><div className="min-w-0"><p className="text-sm font-bold">{eventTitle(event.event_type)}</p>{event.hostname && <code className="mt-1 block truncate text-xs text-ink-muted">{event.hostname}</code>}<p className="mt-1 text-[11px] text-ink-faint">{formatDate(event.created_at, true)}</p></div></div>)}</div>
        </section>
      </div>
    </div>

    {editing && <ClientLicenseFormModal license={license} onClose={() => setEditing(false)} onSaved={(updated) => setLicense(updated)} />}
    {messageEditorOpen && <UnauthorizedMessageModal licenseId={license.id} customEnabled={license.has_custom_unauthorized_message} customMessage={license.unauthorized_message} onClose={() => setMessageEditorOpen(false)} onSaved={() => void load()} />}
    {addDomainOpen && <Modal title="Add authorized domain" onClose={() => { if (!working) { setAddDomainOpen(false); setNewDomain(""); } }}><div className="mx-auto max-w-lg py-2"><p className="text-sm leading-6 text-ink-muted">The hostname will be added to this license. The customer theme and permanent key do not need to change.</p><label className={`${labelClass} mt-4`}>Domain<input autoFocus className={`${fieldClass} font-mono`} value={newDomain} onChange={(event) => setNewDomain(event.target.value)} placeholder="newdomain.com" /></label><div className="mt-5 flex justify-end gap-2"><button className={secondaryButton} onClick={() => setAddDomainOpen(false)}>Cancel</button><button className={primaryButton} disabled={!newDomain.trim() || working} onClick={() => void domainAction(newDomain, "add")}>{working && <Loader2 size={16} className="animate-spin" />} Add domain</button></div></div></Modal>}
    {confirmation && <Modal title={confirmation.kind === "rotate" ? "Rotate license key" : confirmation.kind === "revoke" ? "Permanently revoke license" : confirmation.kind === "domain-remove" ? "Remove authorized domain" : `${confirmation.kind[0].toUpperCase()}${confirmation.kind.slice(1)} license`} onClose={() => { if (!working) { setConfirmation(null); setConfirmText(""); } }}><div className="mx-auto max-w-lg py-2">
      <p className="text-sm leading-6 text-ink-muted">{confirmation.kind === "rotate" ? "Rotating this license will invalidate the old key and require updating the customer's theme. This is the only license action that changes the key." : confirmation.kind === "revoke" ? "Revoking is permanent. The existing customer theme will stop authorizing and Import License cannot restore it." : confirmation.kind === "domain-remove" ? `Remove ${confirmation.domain?.hostname} from this license? The domain will be soft-removed and retained in the audit history.` : confirmation.kind === "archive" ? "Archiving stops authorization but preserves the original key and all client data for recovery." : confirmation.kind === "restore" ? "The same original key will become active again without rebuilding the customer theme." : confirmation.kind === "disable" ? "The theme will stop authorizing until this license is enabled again." : "The same key will become active again."}</p>
      {confirmation.kind === "revoke" && <label className="mt-4 block text-xs font-black uppercase tracking-wider text-red-700">Type REVOKE to confirm<input autoFocus className="mt-2 w-full rounded-xl border border-red-300 bg-base-surface px-3 py-3 font-mono text-sm outline-none" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} /></label>}
      <div className="mt-6 flex justify-end gap-2"><button className={secondaryButton} onClick={() => { setConfirmation(null); setConfirmText(""); }}>Cancel</button><button className={confirmation.kind === "revoke" || confirmation.kind === "domain-remove" ? dangerButton : primaryButton} disabled={working || (confirmation.kind === "revoke" && confirmText !== "REVOKE")} onClick={() => { if (confirmation.kind === "rotate") void rotate(); else if (confirmation.kind === "domain-remove" && confirmation.domain) void domainAction(confirmation.domain.hostname, "remove"); else void statusAction(confirmation.kind as "disable" | "enable" | "archive" | "restore" | "revoke"); }}>{working && <Loader2 size={16} className="animate-spin" />}{confirmation.kind === "rotate" ? "Rotate and invalidate old key" : confirmation.kind === "revoke" ? "Revoke permanently" : confirmation.kind === "domain-remove" ? "Remove domain" : `Confirm ${confirmation.kind}`}</button></div>
    </div></Modal>}
  </div>;
}
