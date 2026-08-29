import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Search,
  ShoppingCart,
  Trash2,
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
  const [deleteTarget, setDeleteTarget] = useState<PlatformWorkspace | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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

  const deleteWorkspace = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmation.trim() !== `DELETE ${deleteTarget.name}`) return;

    setDeletingWorkspaceId(deleteTarget.id);
    setError("");
    try {
      await founderAdmin.deletePlatformWorkspace(
        deleteTarget.id,
        `Admin deleted workspace ${deleteTarget.name} from the platform workspaces list.`
      );
      setRows((current) => current.filter((workspace) => workspace.id !== deleteTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMenuOpenId(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingWorkspaceId(null);
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
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-base-raised text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-brand-accent" /></td></tr>
                ) : rows.length ? rows.map((workspace) => (
                  <tr key={workspace.id} className="border-t border-base-border align-top hover:bg-base-raised/50">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/8 text-[11px] font-bold text-brand-accent">
                          {workspace.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{workspace.name}</p>
                          <p className="mt-1 font-mono text-[10px] text-ink-faint">{workspace.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button disabled={!workspace.owner_profile_id} onClick={() => navigate(`/admin/users?user=${workspace.owner_profile_id}`)} className="text-left disabled:cursor-default">
                        <p className="font-medium hover:text-brand-accent">{workspace.owner_name || "Owner not resolved"}</p>
                        <p className="mt-1 text-xs text-ink-muted">{workspace.owner_email || "No email"}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={workspace.plan} />
                      <p className="mt-1 text-[11px] text-ink-faint">{workspace.subscription_status}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={workspace.status} /></td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-semibold">{workspace.orders_month.toLocaleString()}</p>
                        <p className="text-[11px] text-ink-muted">{workspace.orders_today.toLocaleString()} today</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{currency.format(Number(workspace.delivered_revenue_month || 0))}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{workspace.last_activity_at ? dateTime.format(new Date(workspace.last_activity_at)) : "No order activity"}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{dateTime.format(new Date(workspace.created_at))}</td>
                    <td className="px-4 py-3">
                      <div className="relative flex justify-end gap-2">
                        <button disabled={!workspace.owner_profile_id || !can("support.impersonate_read") || Boolean(openingWorkspaceId)} onClick={() => void openWorkspace(workspace)} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/25 bg-brand-accent/8 px-2.5 py-2 text-xs font-bold text-brand-accent transition hover:bg-brand-accent/15 disabled:opacity-35">
                          {openingWorkspaceId === workspace.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                          <span>Open</span>
                        </button>
                        <div className="relative">
                          <button onClick={() => setMenuOpenId((current) => current === workspace.id ? null : workspace.id)} className="rounded-lg border border-base-border p-2 text-ink-muted hover:text-brand-accent" aria-label={`Open actions for ${workspace.name}`}>
                            <MoreHorizontal size={15} />
                          </button>
                          {menuOpenId === workspace.id && (
                            <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-2xl">
                              <button onClick={() => { setMenuOpenId(null); navigate(`/admin/orders?workspace=${workspace.id}`); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-base-raised">
                                <ShoppingCart size={15} /> View orders
                              </button>
                              <button onClick={() => { setMenuOpenId(null); navigate(`/admin/users?user=${workspace.owner_profile_id ?? ""}`); }} disabled={!workspace.owner_profile_id} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-base-raised disabled:cursor-not-allowed disabled:opacity-40">
                                <Users size={15} /> View owner
                              </button>
                              {can("workspaces.manage") && (
                                <button onClick={() => { setMenuOpenId(null); setStatusTarget(workspace); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-base-raised">
                                  {workspace.status === "active" ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                                  {workspace.status === "active" ? "Suspend workspace" : "Restore workspace"}
                                </button>
                              )}
                              {can("workspaces.manage") && (
                                <button onClick={() => { setMenuOpenId(null); setDeleteTarget(workspace); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5">
                                  <Trash2 size={15} /> Delete workspace
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9}><EmptyState title="No workspaces match" copy="Clear a filter or search for another seller." /></td></tr>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Delete workspace">
          <div className="w-full max-w-lg rounded-2xl border border-danger/20 bg-base-surface p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink">Delete workspace</h3>
                <p className="mt-1 text-sm text-ink-muted">This is destructive. It removes the workspace and its tenant-owned data from the platform.</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-ink-muted">
              <p className="font-semibold text-danger">This will remove:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Orders, customers, products and inventory</li>
                <li>Revenue history, subscriptions and billing state</li>
                <li>Integrations, jobs, sync state and notification data</li>
                <li>Workspace memberships and tenant access</li>
              </ul>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-ink">
                Type: <span className="font-mono text-danger">DELETE {deleteTarget.name}</span>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  placeholder={`DELETE ${deleteTarget.name}`}
                  className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm outline-none focus:border-danger"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); setError(""); }} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={deleteConfirmation.trim() !== `DELETE ${deleteTarget.name}` || deletingWorkspaceId === deleteTarget.id} onClick={() => void deleteWorkspace()} className="rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                {deletingWorkspaceId === deleteTarget.id ? "Deleting…" : "Delete workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
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
