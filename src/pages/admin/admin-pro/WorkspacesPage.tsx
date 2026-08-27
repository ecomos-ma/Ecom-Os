import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  PackageSearch,
  PauseCircle,
  PlayCircle,
  Search,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  founderAdmin,
  type PlatformWorkspace,
} from "../../../lib/founderAdmin";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import { useSupportMode } from "../../../contexts/SupportModeContext";
import {
  currency,
  dateTime,
  EmptyState,
  errorMessage,
  PageHeading,
  RefreshButton,
  StatusBadge,
} from "./shared";

const PAGE_SIZE = 25;

export function WorkspacesPage() {
  const navigate = useNavigate();
  const { can } = usePlatformAdmin();
  const { start } = useSupportMode();
  const [rows, setRows] = useState<PlatformWorkspace[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [timezone, setTimezone] = useState("Africa/Casablanca");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<PlatformWorkspace | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await founderAdmin.platformWorkspaces({
        page: page + 1,
        pageSize: PAGE_SIZE,
        query,
        plan,
        status,
        subscriptionStatus,
      });
      setRows(response.rows || []);
      setTotal(response.total || 0);
      setTimezone(response.timezone || "Africa/Casablanca");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, plan, query, status, subscriptionStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setPage(0);
    setter(value);
  };

  const openWorkspace = async (target: PlatformWorkspace) => {
    if (!target.owner_profile_id || openingWorkspaceId) return;
    setOpeningWorkspaceId(target.id);
    setError("");
    try {
      await start(target.id, target.owner_profile_id, "Opened from Admin Control Center", 30);
      navigate("/dashboard");
    } catch (openError) {
      setError(errorMessage(openError));
      setOpeningWorkspaceId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1720px] p-4 md:p-6 lg:p-8">
      <PageHeading
        eyebrow="Business"
        title="Workspaces"
        description={`Every active and historical seller workspace, with membership-aware counts and commerce KPIs calculated on ${timezone} business boundaries.`}
        action={<RefreshButton onClick={() => void load()} loading={loading} />}
      />

      <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 shadow-sm md:grid-cols-[minmax(260px,1fr)_160px_160px_180px]">
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-base-border bg-base-raised px-3">
          <Search size={16} className="text-ink-faint" />
          <input
            value={query}
            onChange={(event) => updateFilter(setQuery, event.target.value)}
            placeholder="Workspace, owner, or email…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          />
        </label>
        <select aria-label="Plan" value={plan} onChange={(event) => updateFilter(setPlan, event.target.value)} className="field">
          <option value="">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="pro">Pro</option>
          <option value="scale">Scale</option>
          <option value="free">Legacy Free</option>
          <option value="enterprise">Legacy Enterprise</option>
        </select>
        <select aria-label="Workspace status" value={status} onChange={(event) => updateFilter(setStatus, event.target.value)} className="field">
          <option value="">All workspace states</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <select aria-label="Subscription status" value={subscriptionStatus} onChange={(event) => updateFilter(setSubscriptionStatus, event.target.value)} className="field">
          <option value="">All subscriptions</option>
          <option value="active">Active</option>
          <option value="pending_activation">Pending activation</option>
          <option value="trial">Trial</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      {error ? (
        <EmptyState title="Could not load workspaces" copy={error} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-border px-4 py-3">
            <p className="text-sm font-semibold">{total.toLocaleString()} workspaces</p>
            <p className="text-xs text-ink-faint">Revenue is delivered order value for the current Casablanca month.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1900px] text-left text-sm">
              <thead className="bg-base-raised text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Members</th>
                  <th className="px-4 py-3">Orders today</th>
                  <th className="px-4 py-3">Orders month</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Integrations</th>
                  <th className="px-4 py-3">Confirmation</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={15} className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-brand-accent" /></td></tr>
                ) : rows.length ? rows.map((workspace) => (
                  <tr key={workspace.id} className="border-t border-base-border align-top hover:bg-base-raised/50">
                    <td className="px-4 py-3"><p className="font-semibold">{workspace.name}</p><p className="mt-1 font-mono text-[10px] text-ink-faint">{workspace.id}</p></td>
                    <td className="px-4 py-3"><button disabled={!workspace.owner_profile_id} onClick={() => navigate(`/admin/users?user=${workspace.owner_profile_id}`)} className="text-left disabled:cursor-default"><p className="font-medium hover:text-brand-accent">{workspace.owner_name || "Owner not resolved"}</p><p className="mt-1 text-xs text-ink-muted">{workspace.owner_email || "No email"}</p></button></td>
                    <td className="px-4 py-3"><StatusBadge value={workspace.plan} /><p className="mt-1 text-[11px] text-ink-faint">{workspace.subscription_status}</p></td>
                    <td className="px-4 py-3"><StatusBadge value={workspace.status} /></td>
                    <td className="px-4 py-3 font-semibold">{workspace.member_count.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{workspace.orders_today.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{workspace.orders_month.toLocaleString()}</td>
                    <td className="px-4 py-3">{workspace.product_count.toLocaleString()}</td>
                    <td className="px-4 py-3">{workspace.integration_count.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{Number(workspace.confirmation_rate || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-semibold">{Number(workspace.delivery_rate || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-semibold">{currency.format(Number(workspace.delivered_revenue_month || 0))}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{workspace.last_activity_at ? dateTime.format(new Date(workspace.last_activity_at)) : "No order activity"}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{dateTime.format(new Date(workspace.created_at))}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
                      <button disabled={!workspace.owner_profile_id || !can("support.impersonate_read") || Boolean(openingWorkspaceId)} onClick={() => void openWorkspace(workspace)} title="Open workspace" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/25 bg-brand-accent/8 px-2.5 py-2 text-xs font-bold text-brand-accent transition hover:bg-brand-accent/15 disabled:opacity-35">{openingWorkspaceId === workspace.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}<span>Open</span></button>
                      <button onClick={() => navigate(`/admin/orders?workspace=${workspace.id}`)} title="View orders" className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent"><ShoppingCart size={15} /></button>
                      <button disabled={!workspace.owner_profile_id} onClick={() => navigate(`/admin/users?user=${workspace.owner_profile_id}`)} title="Open owner" className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent disabled:opacity-35"><Users size={15} /></button>
                      <button onClick={() => navigate(`/admin/intelligence?workspace=${workspace.id}`)} title="Products and campaigns" className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent"><PackageSearch size={15} /></button>
                      {can("workspaces.manage") && <button onClick={() => setStatusTarget(workspace)} title={workspace.status === "active" ? "Suspend workspace" : "Restore workspace"} className={`rounded-lg border p-2 ${workspace.status === "active" ? "border-amber-500/25 text-amber-600" : "border-emerald-500/25 text-emerald-600"}`}>{workspace.status === "active" ? <PauseCircle size={15} /> : <PlayCircle size={15} />}</button>}
                    </div></td>
                  </tr>
                )) : (
                  <tr><td colSpan={15}><EmptyState title="No workspaces match" copy="Clear a filter or search for another seller." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-base-border px-4 py-3">
            <p className="text-sm text-ink-muted">Page {Math.min(page + 1, totalPages)} of {totalPages}</p>
            <div className="flex gap-2">
              <button aria-label="Previous page" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronLeft size={17} /></button>
              <button aria-label="Next page" onClick={() => setPage((value) => value + 1)} disabled={page + 1 >= totalPages || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronRight size={17} /></button>
            </div>
          </div>
        </section>
      )}

      {statusTarget && <WorkspaceStatusDialog workspace={statusTarget} onClose={() => setStatusTarget(null)} onSaved={async () => { setStatusTarget(null); await load(); }} />}
    </div>
  );
}

function WorkspaceStatusDialog({ workspace, onClose, onSaved }: { workspace: PlatformWorkspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const nextStatus = workspace.status === "active" ? "suspended" : "active";
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={`${nextStatus} workspace`}>
    <form onSubmit={async (event) => {
      event.preventDefault(); setSaving(true); setError("");
      try { await founderAdmin.setPlatformWorkspaceStatus(workspace.id, nextStatus, reason); await onSaved(); }
      catch (saveError) { setError(errorMessage(saveError)); }
      finally { setSaving(false); }
    }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl">
      <h3 className="text-lg font-bold capitalize">{nextStatus} workspace</h3>
      <p className="mt-1 text-sm text-ink-muted">{workspace.name}. This server-side action changes tenant access and is audit logged.</p>
      {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <label className="mt-5 block text-sm font-semibold">Audit reason<textarea required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm outline-none focus:border-brand-accent/60" /></label>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving || reason.trim().length < 8} className={`rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${nextStatus === "suspended" ? "bg-amber-600" : "bg-emerald-600"}`}>{saving ? "Saving…" : `Confirm ${nextStatus}`}</button></div>
    </form>
  </div>;
}
