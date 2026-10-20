import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, CheckCircle2, ChevronDown, CircleDollarSign, Clipboard, Globe2, KeyRound, Loader2, MoreHorizontal, Plus, RefreshCw, Search, ShieldBan, SlidersHorizontal, Users, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { usePlatformAdmin } from "../../components/PlatformAdminRoute";
import { clientLicensing, type ClientLicense, type ClientLicenseStatus, type LicenseStats } from "../../lib/clientLicensing";
import { ClientLicenseFormModal, ImportLicenseModal } from "./client-licenses/ClientLicenseModals";
import { UnauthorizedMessageModal } from "./client-licenses/UnauthorizedMessageModal";
import { dangerButton, formatDate, formatMoney, primaryButton, relativeTime, secondaryButton, StatusBadge } from "./client-licenses/licenseUi";

type PendingAction = { license: ClientLicense; action: "disable" | "enable" | "archive" | "restore" | "revoke" };

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong"; }

function revenueLabel(revenue: Record<string, number>) {
  const entries = Object.entries(revenue).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return "—";
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ");
}

export default function ClientLicenses() {
  const { can } = usePlatformAdmin();
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState<ClientLicense[]>([]);
  const [stats, setStats] = useState<LicenseStats | null>(null);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ClientLicenseStatus | "all">("all");
  const [currency, setCurrency] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [globalMessageOpen, setGlobalMessageOpen] = useState(false);
  const [editing, setEditing] = useState<ClientLicense | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [acting, setActing] = useState(false);
  const firstLoad = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else if (firstLoad.current) setLoading(true);
    setError("");
    try {
      const result = await clientLicensing.list({ search: debouncedSearch, status, currency, date_from: dateFrom, date_to: dateTo });
      setLicenses(result.licenses); setStats(result.stats); setCurrencies(result.currencies);
      firstLoad.current = false;
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [currency, dateFrom, dateTo, debouncedSearch, status]);

  useEffect(() => { void load(); }, [load]);

  const cards = useMemo(() => [
    { label: "Total clients", value: stats?.total_clients, icon: Users, color: "text-violet-600 bg-violet-500/10" },
    { label: "Active licenses", value: stats?.active_licenses, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Authorized domains", value: stats?.authorized_domains, icon: Globe2, color: "text-blue-600 bg-blue-500/10" },
    { label: "Total revenue", value: stats ? revenueLabel(stats.total_revenue) : undefined, icon: CircleDollarSign, color: "text-brand-accent bg-brand-accent/10" },
    { label: "Disabled licenses", value: stats?.disabled_licenses, icon: ShieldBan, color: "text-amber-600 bg-amber-500/10" },
    { label: "Archived licenses", value: stats?.archived_licenses, icon: Archive, color: "text-slate-600 bg-slate-500/10" },
  ], [stats]);

  const applySaved = (saved: ClientLicense) => {
    setLicenses((current) => {
      const exists = current.some((license) => license.id === saved.id);
      return exists ? current.map((license) => license.id === saved.id ? saved : license) : [saved, ...current];
    });
    void load(true);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.action === "revoke" && confirmText !== "REVOKE") return;
    setActing(true);
    try {
      const result = await clientLicensing.setStatus(pendingAction.license.id, pendingAction.action);
      toast.success(pendingAction.action === "archive" ? "License archived and remains recoverable." : pendingAction.action === "revoke" ? "License permanently revoked." : `License ${pendingAction.action}d.`);
      applySaved(result.license); setPendingAction(null); setConfirmText("");
    } catch (actionError) { toast.error(errorMessage(actionError)); }
    finally { setActing(false); }
  };

  if (!can("settings.manage")) return <div className="mx-auto max-w-3xl p-8"><h1 className="text-xl font-black">Access denied</h1><p className="mt-2 text-sm text-ink-muted">Client licenses are restricted to platform administrators.</p></div>;

  return <div className="mx-auto max-w-[1600px] p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent">License operations</p><h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Client Licenses</h1><p className="mt-2 text-sm text-ink-muted">Manage customer licenses, authorized domains and theme activations.</p></div>
      <div className="flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => setGlobalMessageOpen(true)}>Default message</button><button className={secondaryButton} onClick={() => setImportOpen(true)}><RefreshCw size={16} /> Import License</button><button className={primaryButton} onClick={() => setAddOpen(true)}><Plus size={16} /> Add Client</button></div>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map(({ label, value, icon: Icon, color }) => <article key={label} className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}><Icon size={18} /></div>{value === undefined ? <div className="h-6 w-14 animate-pulse rounded bg-base-raised" /> : <p className={`text-right font-black ${typeof value === "string" && value.length > 16 ? "max-w-[150px] text-xs leading-5" : "text-2xl"}`}>{value}</p>}</div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.13em] text-ink-faint">{label}</p>
      </article>)}
    </div>

    <section className="mt-6 overflow-visible rounded-2xl border border-base-border bg-base-surface shadow-sm">
      <div className="border-b border-base-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-base-border bg-base-raised pl-10 pr-9 text-sm outline-none focus:border-brand-accent" placeholder="Search client, phone, domain, theme or exact license…" />{search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"><X size={15} /></button>}</label>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value as ClientLicenseStatus | "all")} className="h-11 rounded-xl border border-base-border bg-base-surface px-3 text-sm font-bold outline-none"><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option><option value="revoked">Revoked</option></select>
            <select aria-label="Currency filter" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-11 rounded-xl border border-base-border bg-base-surface px-3 text-sm font-bold outline-none"><option value="all">All currencies</option>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <button className={secondaryButton} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} /> Date <ChevronDown size={14} className={filtersOpen ? "rotate-180" : ""} /></button>
            <button aria-label="Refresh licenses" className={`${secondaryButton} px-3`} onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
        </div>
        {filtersOpen && <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-base-raised/70 p-3"><label className="text-xs font-bold text-ink-muted">Created from<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-ink-muted">Created to<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm" /></label>{(dateFrom || dateTo) && <button className={secondaryButton} onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear dates</button>}</div>}
      </div>

      {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {loading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-base-raised" />)}</div> : licenses.length === 0 ? <div className="px-6 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-base-raised text-ink-faint"><KeyRound size={26} /></div><h2 className="mt-4 font-black">No client licenses found</h2><p className="mt-2 text-sm text-ink-muted">Create a client license or adjust the current search and filters.</p><button className={`${primaryButton} mt-5`} onClick={() => setAddOpen(true)}><Plus size={16} /> Add Client</button></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1260px] border-collapse text-left">
          <thead><tr className="border-b border-base-border bg-base-raised/55 text-[9px] font-black uppercase tracking-[0.14em] text-ink-faint">{["Client", "Phone", "Theme", "License", "Domains", "Price", "Status", "Created", "Last check", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-base-border">{licenses.map((license) => {
            const visibleDomains = license.domains.filter((domain) => domain.status !== "removed");
            return <tr key={license.id} className="group hover:bg-base-raised/35">
              <td className="px-4 py-4"><Link to={`/admin/client-licenses/${license.id}`} className="font-black text-ink hover:text-brand-accent">{license.client_name}</Link>{license.email && <p className="mt-1 max-w-[180px] truncate text-[11px] text-ink-faint">{license.email}</p>}</td>
              <td className="px-4 py-4 text-sm text-ink-muted">{license.phone || "—"}</td>
              <td className="px-4 py-4"><p className="max-w-[180px] truncate text-sm font-bold">{license.theme_name}</p></td>
              <td className="px-4 py-4"><div className="flex items-center gap-2"><code className="max-w-[170px] truncate text-xs font-bold text-ink-muted">{license.license_display}</code><button title="Open client to copy full license" onClick={() => navigate(`/admin/client-licenses/${license.id}`)} className="text-ink-faint hover:text-brand-accent"><Clipboard size={14} /></button></div></td>
              <td className="px-4 py-4"><p className="max-w-[190px] truncate font-mono text-xs">{visibleDomains[0]?.hostname || "—"}</p>{visibleDomains.length > 1 && <p className="mt-1 text-[10px] font-bold text-brand-accent">+{visibleDomains.length - 1} more</p>}</td>
              <td className="px-4 py-4 text-sm font-black">{formatMoney(license.price, license.currency)}</td>
              <td className="px-4 py-4"><StatusBadge status={license.status} /></td>
              <td className="px-4 py-4 text-xs text-ink-muted">{formatDate(license.created_at)}</td>
              <td className="px-4 py-4 text-xs text-ink-muted">{relativeTime(license.last_check_at)}</td>
              <td className="relative px-4 py-4"><button aria-label={`Actions for ${license.client_name}`} onClick={() => setMenuId((current) => current === license.id ? null : license.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-base-border text-ink-muted hover:bg-base-raised"><MoreHorizontal size={17} /></button>{menuId === license.id && <div className="absolute right-4 top-12 z-30 w-48 rounded-xl border border-base-border bg-base-surface p-1.5 shadow-xl">
                <button onClick={() => navigate(`/admin/client-licenses/${license.id}`)} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-base-raised">View client</button>
                <button onClick={() => { setEditing(license); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-base-raised">Edit client</button>
                <button onClick={() => navigate(`/admin/client-licenses/${license.id}#domains`)} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-base-raised">Manage domains</button>
                {license.status === "active" && <button onClick={() => { setPendingAction({ license, action: "disable" }); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-amber-700 hover:bg-amber-50">Disable</button>}
                {license.status === "disabled" && <button onClick={() => { setPendingAction({ license, action: "enable" }); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50">Enable</button>}
                {license.status === "archived" && <button onClick={() => { setPendingAction({ license, action: "restore" }); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50">Restore</button>}
                {license.status !== "archived" && license.status !== "revoked" && <button onClick={() => { setPendingAction({ license, action: "archive" }); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-base-raised">Archive</button>}
                {license.status !== "revoked" && <button onClick={() => { setPendingAction({ license, action: "revoke" }); setMenuId(null); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-red-700 hover:bg-red-50">Revoke</button>}
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>

    {addOpen && <ClientLicenseFormModal onClose={() => setAddOpen(false)} onSaved={applySaved} />}
    {editing && <ClientLicenseFormModal license={editing} onClose={() => setEditing(null)} onSaved={applySaved} />}
    {importOpen && <ImportLicenseModal onClose={() => setImportOpen(false)} onRestored={applySaved} />}
    {globalMessageOpen && <UnauthorizedMessageModal onClose={() => setGlobalMessageOpen(false)} />}
    {pendingAction && <Modal title={pendingAction.action === "revoke" ? "Permanently revoke license" : `${pendingAction.action[0].toUpperCase()}${pendingAction.action.slice(1)} license`} onClose={() => { if (!acting) { setPendingAction(null); setConfirmText(""); } }}>
      <div className="mx-auto max-w-lg py-2"><p className="text-sm leading-6 text-ink-muted">{pendingAction.action === "revoke" ? "Revoking is a permanent security action. The current key will stop authorizing every domain and cannot be restored through Import License." : pendingAction.action === "archive" ? "Archiving temporarily removes this license from active use. All client data and the original key remain recoverable." : pendingAction.action === "restore" ? "The same original license key will become active again. No customer theme changes are required." : pendingAction.action === "disable" ? "The customer theme will stop authorizing until this license is enabled again." : "The existing key will become active again."}</p>
        <div className="mt-4 rounded-xl bg-base-raised px-4 py-3"><p className="font-black">{pendingAction.license.client_name}</p><code className="mt-1 block text-xs text-ink-muted">{pendingAction.license.license_display}</code></div>
        {pendingAction.action === "revoke" && <label className="mt-4 block text-xs font-black uppercase tracking-wider text-red-700">Type REVOKE to confirm<input autoFocus value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-2 w-full rounded-xl border border-red-300 bg-base-surface px-3 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-red-500/20" /></label>}
        <div className="mt-6 flex justify-end gap-2"><button className={secondaryButton} onClick={() => { setPendingAction(null); setConfirmText(""); }}>Cancel</button><button className={pendingAction.action === "revoke" ? dangerButton : primaryButton} disabled={acting || (pendingAction.action === "revoke" && confirmText !== "REVOKE")} onClick={() => void confirmAction()}>{acting && <Loader2 size={16} className="animate-spin" />}{pendingAction.action === "revoke" ? "Revoke permanently" : `Confirm ${pendingAction.action}`}</button></div>
      </div>
    </Modal>}
  </div>;
}
