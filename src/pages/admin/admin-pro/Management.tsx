import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Download, ExternalLink, FileText, Loader2, Mail, PauseCircle, PlayCircle, Search, ShieldAlert, ShieldCheck, UserRound, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShippingStatusBadge } from "../../../components/ShippingStatusBadge";
import { founderAdmin, type FounderMembership, type FounderOrderV2, type FounderUser360, type FounderUserV2 } from "../../../lib/founderAdmin";
import { supabase } from "../../../lib/supabase";
import { useSupportMode } from "../../../contexts/SupportModeContext";
import { usePlatformAdmin } from "../../../components/PlatformAdminRoute";
import { currency, dateTime, EmptyState, PageHeading, RefreshButton, StatusBadge, errorMessage } from "./shared";

type AccountState = "active" | "suspended" | "closed";

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const [users, setUsers] = useState<FounderUserV2[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(params.get("search") || "");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [hasWorkspace, setHasWorkspace] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("user"));
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await founderAdmin.platformUsers({ page: page + 1, pageSize: limit, query, platformRole: role, accountState: status, hasWorkspace: hasWorkspace === "" ? undefined : hasWorkspace === "yes" });
      setUsers(response.rows || []); setTotal(response.total || 0);
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, [page, query, role, status, hasWorkspace]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const interval = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(interval); }, [load]);
  useEffect(() => { const requested = params.get("user"); if (requested) setSelectedId(requested); }, [params]);
  const selectUser = (id: string) => { setSelectedId(id); const next = new URLSearchParams(params); next.set("user", id); setParams(next, { replace: true }); };
  const closeDrawer = () => { setSelectedId(null); const next = new URLSearchParams(params); next.delete("user"); setParams(next, { replace: true }); };
  const updateFilter = (setter: (value: string) => void, value: string) => { setPage(0); setter(value); };

  return <div className="mx-auto max-w-[1480px] p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Management" title="Users" description="Every account, membership, workspace health signal, and sensitive intervention is managed from this founder-only view. Results are paginated and filtered by protected database RPCs." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_150px_150px_170px]">
      <SearchBox value={query} onChange={(value) => updateFilter(setQuery, value)} placeholder="Search name or exact email…" />
      <Filter value={role} onChange={(value) => updateFilter(setRole, value)} label="Role"><option value="">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="employee">Employee</option><option value="user">User</option></Filter>
      <Filter value={status} onChange={(value) => updateFilter(setStatus, value)} label="Account status"><option value="">All states</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></Filter>
      <Filter value={hasWorkspace} onChange={(value) => updateFilter(setHasWorkspace, value)} label="Membership"><option value="">Any membership</option><option value="yes">Has workspace</option><option value="no">No workspace</option></Filter>
    </div>
    {error ? <EmptyState title="Could not load users" copy={error} /> : <section className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-base-border px-4 py-3"><p className="text-sm font-semibold">{total.toLocaleString()} users</p><p className="text-xs text-ink-faint">Open a row for the complete workspace and activity record.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-base-raised text-[11px] uppercase tracking-wide text-ink-faint"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Memberships</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3 text-right">Open</th></tr></thead><tbody>
        {loading ? <LoadingRow columns={7} /> : users.length ? users.map((user) => <tr key={user.id} className="border-t border-base-border transition hover:bg-base-raised/60"><td className="px-4 py-3"><button onClick={() => selectUser(user.id)} className="flex items-center gap-3 text-left">{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full border border-base-border object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-accent/10 text-xs font-bold text-brand-accent">{(user.full_name || user.email || "U").slice(0, 2).toUpperCase()}</span>}<span><span className="block font-semibold hover:text-brand-accent">{user.full_name || "Unnamed user"}</span><span className="block text-xs text-ink-muted">{user.email || "No email available"}</span></span></button></td><td className="px-4 py-3"><p className="max-w-52 truncate font-medium">{user.memberships[0]?.workspace_name || "No workspace"}</p><p className="text-xs text-ink-muted">{user.memberships.length ? `${user.memberships.length} workspace${user.memberships.length === 1 ? "" : "s"}` : "Membership missing"}</p></td><td className="px-4 py-3"><StatusBadge value={user.role} /></td><td className="px-4 py-3"><StatusBadge value={user.status} /></td><td className="px-4 py-3 text-xs text-ink-muted">{formatOptionalDate(user.last_active)}</td><td className="px-4 py-3 text-xs text-ink-muted">{dateTime.format(new Date(user.created_at))}</td><td className="px-4 py-3 text-right"><button onClick={() => selectUser(user.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-xs font-bold text-ink-muted hover:border-brand-accent/40 hover:text-brand-accent"><UserRound size={14} /> 360°</button></td></tr>) : <EmptyRow columns={7} title="No users match these filters" copy="Try broadening the search or clearing a filter." />}
      </tbody></table></div>
      <Pagination page={page} total={total} limit={limit} loading={loading} onChange={setPage} />
    </section>}
    {selectedId && <UserDrawer profileId={selectedId} onClose={closeDrawer} onChanged={() => void load()} />}
  </div>;
}

function UserDrawer({ profileId, onClose, onChanged }: { profileId: string; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate();
  const { start: startSupportMode } = useSupportMode();
  const { can } = usePlatformAdmin();
  const [data, setData] = useState<FounderUser360 | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [action, setAction] = useState<AccountState | null>(null);
  const [authAction, setAuthAction] = useState<"ban" | "unban" | "force_logout" | "hard_delete" | null>(null);
  const [workspacePicker, setWorkspacePicker] = useState(false);
  const [roleEditor, setRoleEditor] = useState(false);
  const [supportingWorkspace, setSupportingWorkspace] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [magicLinkBusy, setMagicLinkBusy] = useState(false);
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [paymentRequestBusy, setPaymentRequestBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await founderAdmin.platformUser360(profileId)); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, [profileId]);
  useEffect(() => { void load(); }, [load]);
  const addNote = async () => { if (!note.trim()) return; setSavingNote(true); try { await founderAdmin.addUserNote(profileId, note); setNote(""); await load(); } catch (err) { window.alert(errorMessage(err)); } finally { setSavingNote(false); } };
  const openWorkspace = async (membership: FounderMembership) => {
    if (!data) return;
    setSupportingWorkspace(membership.workspace_id); setFeedback("");
    try {
      await startSupportMode(membership.workspace_id, data.user.id, "Opened from Admin User 360", 30);
      navigate("/dashboard");
    } catch (err) { setFeedback(errorMessage(err)); } finally { setSupportingWorkspace(null); }
  };
  const sendMagicLink = async () => {
    if (!data?.user.email) {
      setFeedback("This user does not have a valid email on file.");
      return;
    }
    setMagicLinkBusy(true);
    setFeedback("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: data.user.email,
        options: { emailRedirectTo: `${window.location.origin}/choose-plan` },
      });
      if (error) throw error;
      setFeedback("Magic link sent to the user’s email.");
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setMagicLinkBusy(false);
    }
  };
  const toggleSuspendState = async () => {
    if (!data) return;
    const isSuspended = data.user.status === "suspended";
    const confirmed = window.confirm(isSuspended ? "Reactivate this user and restore platform access?" : "Suspend this user and block platform access immediately?");
    if (!confirmed) return;
    setSuspendBusy(true);
    setFeedback("");
    try {
      await founderAdmin.setUserState(
        data.user.id,
        isSuspended ? "active" : "suspended",
        isSuspended ? "Reactivated by admin from user management" : "Suspended by admin from user management",
        isSuspended ? "Your account has been reactivated." : "Your account has been suspended. Please contact support to restore access.",
        null,
      );
      setFeedback(isSuspended ? "User reactivated successfully." : "User suspended successfully. Access is now blocked.");
      await load();
      onChanged();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setSuspendBusy(false);
    }
  };
  const sendPaymentRequest = async () => {
    if (!data) return;
    const planCode = data.subscription?.plan?.code || (data.user as any)?.subscription_plan || "growth";
    const billingCycle = data.subscription?.billing_cycle || "monthly";
    const confirmed = window.confirm(`Send a ${billingCycle} payment request for the ${planCode} plan to this user?`);
    if (!confirmed) return;
    setPaymentRequestBusy(true);
    setFeedback("");
    try {
      const { error } = await supabase.rpc("create_subscription_payment_request_v1", {
        p_plan_code: planCode,
        p_billing_cycle: billingCycle,
        p_request_type: "initial_activation",
        p_payment_method: "bank_transfer",
        p_transaction_reference: null,
        p_user_note: `Created by admin from User 360 for ${data.user.email || "account"}`,
      });
      if (error) throw error;
      setFeedback(`Payment request created for ${planCode} (${billingCycle}). The user will see the existing payment flow when needed.`);
      await load();
      onChanged();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setPaymentRequestBusy(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="User workspace 360">
    <button onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Close user details" />
    <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-base-border bg-base p-5 shadow-2xl md:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-accent">Workspace 360°</p><h2 className="mt-1 text-xl font-bold">{data?.user.full_name || "User profile"}</h2><p className="mt-1 text-sm text-ink-muted">{data?.user.email || "Loading account record…"}</p></div><button onClick={onClose} className="rounded-lg border border-base-border p-2 text-ink-muted hover:bg-base-raised" aria-label="Close"><X size={18} /></button></div>
      {loading ? <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div> : error || !data ? <div className="mt-6"><EmptyState title="Could not load this user" copy={error || "No user was returned."} /></div> : <>
        <div className="mt-6 grid gap-3 sm:grid-cols-3"><Info label="Account state" value={data.user.status} badge /><Info label="Role" value={data.user.role} badge /><Info label="Joined" value={dateTime.format(new Date(data.user.created_at))} /></div>
        <div className="mt-3 text-sm"><ActivityStatus value={data.user.last_active} /></div>
        {feedback && <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${feedback.toLowerCase().includes("success") || feedback.toLowerCase().includes("sent") || feedback.toLowerCase().includes("created") ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-danger/20 bg-danger/10 text-danger"}`}>{feedback}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void sendMagicLink()} disabled={magicLinkBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-accent/10 px-3 py-2 text-xs font-bold text-brand-accent disabled:opacity-50"><Mail size={14} />{magicLinkBusy ? "Sending…" : "Send Magic Link"}</button>
          <button onClick={() => void toggleSuspendState()} disabled={suspendBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 disabled:opacity-50"><ShieldAlert size={14} />{suspendBusy ? "Processing…" : data.user.status === "suspended" ? "Reactivate User" : "Suspend User"}</button>
          <button onClick={() => void sendPaymentRequest()} disabled={paymentRequestBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-50"><CreditCard size={14} />{paymentRequestBusy ? "Sending…" : "Send Payment Request"}</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setRoleEditor(true)} className="rounded-lg border border-brand-accent/30 bg-brand-accent/10 px-3 py-2 text-xs font-bold text-brand-accent">Change role</button><button disabled={!data.memberships.length || Boolean(supportingWorkspace)} onClick={() => data.memberships.length === 1 ? void openWorkspace(data.memberships[0]) : setWorkspacePicker(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{supportingWorkspace ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}{supportingWorkspace ? "Opening…" : "Open workspace"}</button></div>
        {data.user.reason && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm"><p className="font-semibold text-amber-800 dark:text-amber-200">Account control reason</p><p className="mt-1 text-ink-muted">{data.user.reason}</p>{data.user.user_message && <p className="mt-2 text-xs text-ink-faint">User message: {data.user.user_message}</p>}</div>}
        <section className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold">Memberships & business health</h3><span className="text-xs text-ink-faint">{data.memberships.length} linked</span></div><div className="mt-3 space-y-3">{data.memberships.length ? data.memberships.map((membership) => <article key={membership.workspace_id} className="rounded-xl border border-base-border bg-base-surface p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{membership.workspace_name}</p><p className="mt-1 text-xs text-ink-muted">{membership.plan} · {membership.member_role} · {membership.stage || "operating"}</p></div><div className="flex gap-1.5"><StatusBadge value={membership.workspace_status} /><StatusBadge value={membership.is_owner ? "owner" : "member"} /></div></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Orders" value={membership.orders.toLocaleString()} /><Info label="Revenue" value={currency.format(Number(membership.revenue || 0))} /></div><button disabled={Boolean(supportingWorkspace)} onClick={() => void openWorkspace(membership)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-bold text-white hover:bg-brand-accentHover disabled:opacity-50">{supportingWorkspace === membership.workspace_id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Open workspace</button></article>) : <EmptyState title="No workspace memberships" copy="This user has not joined a workspace yet." />}</div></section>
        <section className="mt-6"><h3 className="font-bold">Account controls</h3><p className="mt-1 text-sm text-ink-muted">Operational state and Auth state are separate. Every action is server enforced, reasoned, root protected, and audited.</p><div className="mt-3 flex flex-wrap gap-2">{can("users.manage") && data.user.status !== "active" && data.user.status !== "banned" && <ControlButton onClick={() => setAction("active")} icon={PlayCircle} label="Restore access" tone="good" />}{can("users.manage") && data.user.status !== "suspended" && data.user.status !== "banned" && <ControlButton onClick={() => setAction("suspended")} icon={PauseCircle} label="Suspend account" tone="warning" />}{can("users.manage") && data.user.status !== "closed" && data.user.status !== "banned" && <ControlButton onClick={() => setAction("closed")} icon={X} label="Close account" tone="danger" />}{can("users.ban") && (data.user.banned ? <ControlButton onClick={() => setAuthAction("unban")} icon={PlayCircle} label="Unban Auth user" tone="good" /> : <ControlButton onClick={() => setAuthAction("ban")} icon={PauseCircle} label="Ban Auth user" tone="danger" />)}{can("users.manage") && <ControlButton onClick={() => setAuthAction("force_logout")} icon={X} label="Force logout" tone="warning" />}{can("users.delete") && <ControlButton onClick={() => setAuthAction("hard_delete")} icon={X} label="Hard delete" tone="danger" />}</div></section>
        <section className="mt-6 rounded-xl border border-base-border bg-base-surface p-4"><h3 className="font-bold">Internal notes</h3><div className="mt-3 flex gap-2"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal note…" className="min-w-0 flex-1 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-sm outline-none focus:border-brand-accent/60" /><button disabled={savingNote || !note.trim()} onClick={() => void addNote()} className="rounded-lg bg-brand-accent px-3 text-sm font-bold text-white disabled:opacity-50">Save</button></div><div className="mt-4 space-y-3">{data.notes.length ? data.notes.map((item) => <div key={item.id} className="rounded-lg bg-base-raised p-3"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-ink-faint">{dateTime.format(new Date(item.created_at))}</p></div>) : <p className="text-sm text-ink-muted">No notes yet.</p>}</div></section>
        <section className="mt-6"><h3 className="font-bold">Recent account activity</h3><div className="mt-3 space-y-2">{data.activity.length ? data.activity.map((event) => <div key={event.id} className="rounded-lg bg-base-raised p-3"><p className="text-sm font-semibold capitalize">{event.action.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-ink-muted">{event.reason || "Account action"} · {dateTime.format(new Date(event.created_at))}</p></div>) : <p className="text-sm text-ink-muted">No recorded founder actions for this account.</p>}</div></section>
        {workspacePicker && <WorkspacePicker memberships={data.memberships} loading={Boolean(supportingWorkspace)} onClose={() => setWorkspacePicker(false)} onSelect={(membership) => { setWorkspacePicker(false); void openWorkspace(membership); }} />}
        {roleEditor && <RoleEditor user={data.user} memberships={data.memberships} onClose={() => setRoleEditor(false)} onSaved={async (platformRole, membership) => { await founderAdmin.updateUserRoleV3(data.user.id, platformRole, membership?.workspace_id, membership?.member_role); setFeedback("Role saved. Permissions update on the user’s next request."); setRoleEditor(false); await load(); onChanged(); }} />}
        {action && <AccountActionDialog user={data.user} state={action} onClose={() => setAction(null)} onComplete={async (reason, message, until) => { await founderAdmin.setUserState(data.user.id, action, reason, message, until); setAction(null); await load(); onChanged(); }} />}
        {authAction && <AuthActionDialog user={data.user} action={authAction} onClose={() => setAuthAction(null)} onComplete={async (reason) => { await founderAdmin.platformAccountAction(data.user.id, authAction, reason); setAuthAction(null); if (authAction === "hard_delete") { onClose(); onChanged(); return; } await load(); onChanged(); }} />}
      </>}
    </aside>
  </div>;
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<FounderOrderV2[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("order"));
  const limit = 25;
  const filters = useMemo(() => ({ search: query, status, workspaceId, startDate: from || undefined, endDate: to || undefined, sort }), [query, status, workspaceId, from, to, sort]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await founderAdmin.globalOrdersV3({ ...filters, page: page + 1, pageSize: limit }); setOrders(response.orders || []); setTotal(response.total_count || 0); } catch (err) { if (import.meta.env.DEV) console.error("[Admin Global Orders] founder_global_orders_v3 failed", err); setError("We couldn’t retrieve global orders. Refresh to retry, or deploy the founder Admin migrations if this is the first use."); } finally { setLoading(false); } }, [filters, page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const channel = supabase.channel("founder-global-orders-live").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => setTick((value) => value + 1)).subscribe(); return () => { void channel.unsubscribe(); }; }, []);
  useEffect(() => { if (tick) void load(); }, [tick, load]);
  useEffect(() => { const requested = params.get("order"); if (requested) setSelectedId(requested); }, [params]);
  const update = (setter: (value: string) => void, value: string) => { setPage(0); setter(value); };
  const selectOrder = (id: string) => { setSelectedId(id); const next = new URLSearchParams(params); next.set("order", id); setParams(next, { replace: true }); };
  const closeDetail = () => { setSelectedId(null); const next = new URLSearchParams(params); next.delete("order"); setParams(next, { replace: true }); };
  const exportAll = async () => {
    setExporting(true);
    try {
      const csv = ["Order,Workspace,Customer,Phone,City,Total,Status,Created", ...orders.map((row) => [row.order_number, row.workspace_name || "", row.customer_name || "", row.phone || "", row.city || "", row.total, row.status, row.created_at].map(csvCell).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ecomos-orders-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) { window.alert(errorMessage(err)); } finally { setExporting(false); }
  };
  return <div className="mx-auto max-w-[1580px] p-4 md:p-6 lg:p-8"><PageHeading eyebrow="Live operations" title="Order Spy" description="Watch every order across every seller in one secure, live feed. Search, filter and inspect the complete customer and fulfillment context." action={<div className="flex gap-2"><button disabled={exporting || !orders.length} onClick={() => void exportAll()} className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-3 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"><Download size={16} /> {exporting ? "Exporting…" : "Export visible"}</button><RefreshButton onClick={() => void load()} loading={loading} /></div>} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.055] px-4 py-3"><span className="flex items-center gap-2 text-xs font-black text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live cross-seller monitoring</span><span className="text-xs text-ink-muted"><strong className="text-ink">{total.toLocaleString()}</strong> matching orders · updates arrive automatically</span></div>
    <div className="mb-4 grid gap-2 rounded-2xl border border-base-border bg-base-surface p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_150px_180px_150px_150px_150px]"><SearchBox value={query} onChange={(value) => update(setQuery, value)} placeholder="Order, phone, customer, tracking, or workspace…" /><Filter label="Status" value={status} onChange={(value) => update(setStatus, value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option><option value="LIVRE">Livré</option><option value="CONFIRME">Confirmé</option></Filter><input value={workspaceId} onChange={(event) => update(setWorkspaceId, event.target.value)} placeholder="Workspace ID" aria-label="Workspace ID" className="rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm outline-none focus:border-brand-accent/60" /><input type="date" value={from} onChange={(event) => update(setFrom, event.target.value)} aria-label="Orders from date" className="rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm outline-none focus:border-brand-accent/60" /><input type="date" value={to} onChange={(event) => update(setTo, event.target.value)} aria-label="Orders to date" className="rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm outline-none focus:border-brand-accent/60" /><Filter label="Sort orders" value={sort} onChange={(value) => update(setSort, value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Filter></div>
    {error ? <EmptyState title="Could not load global orders" copy={error} /> : <section className="overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-sm"><div className="flex items-center justify-between border-b border-base-border px-4 py-3"><p className="text-sm font-black">Platform order feed</p><p className="text-xs text-ink-faint">Page {page + 1} · newest activity first</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-base-raised/75 text-[10px] font-black uppercase tracking-wider text-ink-faint"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Seller workspace</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone / city</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3"></th></tr></thead><tbody>{loading ? <LoadingRow columns={8} /> : orders.length ? orders.map((order) => <tr key={order.id} className="group border-t border-base-border hover:bg-brand-accent/[0.035]"><td className="px-4 py-3 font-mono text-xs font-black text-brand-accent">#{order.order_number}</td><td className="px-4 py-3 font-semibold">{order.workspace_name || "Deleted workspace"}</td><td className="px-4 py-3">{order.customer_name || "—"}</td><td className="px-4 py-3 text-xs text-ink-muted">{order.phone || "—"}{order.city ? ` · ${order.city}` : ""}</td><td className="px-4 py-3 font-black">{currency.format(Number(order.total || 0))}</td><td className="px-4 py-3"><StatusBadge value={order.status} /></td><td className="px-4 py-3 text-xs text-ink-muted">{dateTime.format(new Date(order.created_at))}</td><td className="px-4 py-3 text-right"><button onClick={() => selectOrder(order.id)} className="rounded-xl border border-base-border p-2 text-ink-muted transition group-hover:border-brand-accent/30 group-hover:text-brand-accent" aria-label={`Open order ${order.order_number}`}><FileText size={15} /></button></td></tr>) : <EmptyRow columns={8} title="No orders match these filters" copy="Change a filter or clear the search." />}</tbody></table></div><Pagination page={page} total={total} limit={limit} loading={loading} onChange={setPage} /></section>}
    {selectedId && <OrderDrawer orderId={selectedId} onClose={closeDetail} />}
  </div>;
}

function OrderDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<{ order: Record<string, unknown>; workspace: { id: string; name: string } | null; items: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void founderAdmin.orderDetail(orderId).then((value) => { if (active) setData(value); }).catch((err) => active && setError(errorMessage(err))); return () => { active = false; }; }, [orderId]);
  if (!data && !error) return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Order detail"><button onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Close order detail" /><aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-base-border bg-base p-5 shadow-2xl md:p-6"><div className="grid h-full place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div></aside></div>;
  const order = (data?.order ?? {}) as Record<string, any>;
  const items = data?.items ?? [];
  const customer = typeof order.customer_name === "string" && order.customer_name.trim() ? order.customer_name : typeof (order.customer as Record<string, unknown> | null)?.name === "string" ? String((order.customer as Record<string, unknown>).name) : "Unknown customer";
  const phone = typeof order.phone === "string" && order.phone.trim() ? order.phone : typeof (order.customer as Record<string, unknown> | null)?.phone === "string" ? String((order.customer as Record<string, unknown>).phone) : "—";
  const city = typeof order.city === "string" && order.city.trim() ? order.city : typeof (order.customer as Record<string, unknown> | null)?.city === "string" ? String((order.customer as Record<string, unknown>).city) : "—";
  const address = typeof order.address === "string" && order.address.trim() ? order.address : "No address";
  const total = Number(order.total ?? 0);
  const shippingStatus = typeof order.shipping_status === "string" ? order.shipping_status : typeof order.delivery_status === "string" ? order.delivery_status : "";
  const status = typeof order.status === "string" && order.status.trim() ? order.status : "pending";
  const lineItems = items.length ? items : [];
  const createdAt = order.created_at ? new Date(String(order.created_at)) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? dateTime.format(createdAt) : "—";
  const confirmationMethod = typeof order.confirmation_method === "string" && order.confirmation_method.trim() ? order.confirmation_method : null;
  const workspaceName = typeof data?.workspace?.name === "string" && data.workspace.name.trim() ? data.workspace.name : "Workspace";
  const sourceLabel = String(order.source ?? order.source_platform ?? "manual");
  const paymentLabel = String(order.payment_method ?? order.payment_status ?? "—");
  const shippingLabel = String(order.shipping_status ?? order.delivery_status ?? "—");
  const confirmationLabel = String(order.confirmation_method ?? "—");
  const trackingLabel = String(order.tracking_code ?? order.tracking_number ?? order.tracking ?? "—");
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Order detail"><button onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Close order detail" /><aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-base-border bg-base p-5 shadow-2xl md:p-6"><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-accent">Order detail</p><h2 className="mt-1 text-xl font-bold">{String(order.order_number || order["Order ID"] || "Order")}</h2><p className="mt-1 text-sm text-ink-muted">{data?.workspace?.name || "Workspace"}</p></div><button onClick={onClose} className="rounded-lg border border-base-border p-2 text-ink-muted hover:bg-base-raised"><X size={18} /></button></div>{error ? <div className="mt-6"><EmptyState title="Could not load order" copy={error} /></div> : !data ? <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div> : <><div className="mt-5 flex flex-wrap items-center gap-2"><StatusBadge value={status} />{shippingStatus ? <ShippingStatusBadge status={shippingStatus} /> : null}{confirmationMethod && <span className="inline-flex items-center rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-accent">{confirmationMethod}</span>}</div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Customer" value={customer} /><Info label="Phone" value={phone} /><Info label="City" value={city} /><Info label="Address" value={address} /><Info label="Order total" value={currency.format(total)} /><Info label="Created" value={createdLabel} /></div><section className="mt-6 rounded-xl border border-base-border bg-base-surface p-4"><h3 className="font-bold">Order summary</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Workspace" value={data.workspace?.name || "Unknown"} /><Info label="Source" value={String(order.source ?? order.source_platform ?? "manual")} /><Info label="Payment method" value={String(order.payment_method ?? "—")} /><Info label="Tracking" value={String(order.tracking_number ?? order.coliaty_parcel_code ?? "—")} /></div></section><section className="mt-6"><h3 className="font-bold">Items</h3><div className="mt-3 space-y-2">{lineItems.length ? lineItems.map((item, index) => { const itemName = typeof item.name === "string" && item.name.trim() ? item.name : typeof item.product_variant === "string" && item.product_variant.trim() ? item.product_variant : typeof item.sku === "string" && item.sku.trim() ? item.sku : `Item ${index + 1}`; const itemQuantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0); const itemPrice = item.price == null || Number.isNaN(Number(item.price)) ? null : Number(item.price); const itemSku = typeof item.sku === "string" ? item.sku : ""; return <div key={String(item.id ?? index)} className="rounded-xl border border-base-border bg-base-surface p-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-sm">{itemName}</p><p className="font-mono text-xs text-ink-muted">{itemQuantity > 0 ? `${itemQuantity} x` : ""}{itemPrice != null ? currency.format(itemPrice) : "—"}</p></div>{itemSku && <p className="mt-1 text-xs text-ink-muted">SKU: {itemSku}</p>}</div>; }) : <p className="text-sm text-ink-muted">No item records are attached to this order.</p>}</div></section></>}</aside></div>;
}

function AccountActionDialog({ user, state, onClose, onComplete }: { user: FounderUser360["user"]; state: AccountState; onClose: () => void; onComplete: (reason: string, message: string, until: string | null) => Promise<void> }) {
  const [reason, setReason] = useState(""); const [message, setMessage] = useState(""); const [until, setUntil] = useState(""); const [saving, setSaving] = useState(false);
  const labels = { active: "Restore account access", suspended: "Suspend account", closed: "Close account" };
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onComplete(reason, message, until ? new Date(`${until}T23:59:59`).toISOString() : null); } catch (err) { window.alert(errorMessage(err)); } finally { setSaving(false); } }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><h3 className="text-lg font-bold">{labels[state]}</h3><p className="mt-1 text-sm text-ink-muted">{user.full_name || user.email}. This action is audit logged and changes access immediately.</p><label className="mt-5 block text-sm font-semibold">Audit reason<textarea required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm outline-none focus:border-brand-accent/60" rows={3} /></label>{state !== "active" && <><label className="mt-3 block text-sm font-semibold">Message shown to the user <span className="font-normal text-ink-faint">(optional)</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm outline-none focus:border-brand-accent/60" rows={2} /></label>{state === "suspended" && <label className="mt-3 block text-sm font-semibold">Automatic restore date <span className="font-normal text-ink-faint">(optional)</span><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} className="mt-2 block rounded-lg border border-base-border bg-base-raised px-3 py-2 text-sm" /></label>}</>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving || reason.trim().length < 3} className={`rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${state === "closed" ? "bg-danger" : state === "suspended" ? "bg-amber-600" : "bg-brand-accent"}`}>{saving ? "Saving…" : labels[state]}</button></div></form></div>;
}

function AuthActionDialog({ user, action, onClose, onComplete }: { user: FounderUser360["user"]; action: "ban" | "unban" | "force_logout" | "hard_delete"; onClose: () => void; onComplete: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const copy = {
    ban: { title: "Ban Auth user", impact: "Blocks authentication, revokes refresh sessions, and immediately removes tenant data access." },
    unban: { title: "Unban Auth user", impact: "Removes the GoTrue ban. Operational suspension or closure remains in effect if separately configured." },
    force_logout: { title: "Force logout everywhere", impact: "Revokes refresh sessions and advances the JWT cutoff so currently issued tokens lose tenant access immediately." },
    hard_delete: { title: "Hard delete account", impact: "Permanently deletes the Auth user. This is refused if the user still owns any workspace." },
  }[action];
  const valid = reason.trim().length >= 8 && (action !== "hard_delete" || confirmation === "DELETE");
  return <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await onComplete(reason); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); } }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><h3 className="text-lg font-bold">{copy.title}</h3><p className="mt-1 text-sm text-ink-muted">Target: <strong>{user.full_name || user.email}</strong></p><p className={`mt-4 rounded-xl p-3 text-sm leading-6 ${action === "hard_delete" || action === "ban" ? "bg-danger/10 text-danger" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{copy.impact}</p>{error && <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}<label className="mt-5 block text-sm font-semibold">Audit reason<textarea autoFocus required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm" /></label>{action === "hard_delete" && <label className="mt-4 block text-sm font-semibold">Type DELETE to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 field w-full font-mono" /></label>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving || !valid} className={`rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${action === "unban" ? "bg-emerald-600" : action === "force_logout" ? "bg-amber-600" : "bg-danger"}`}>{saving ? "Applying…" : copy.title}</button></div></form></div>;
}

const ROLE_OPTIONS = ["owner", "admin", "manager", "agent", "employee", "viewer", "user"];

function WorkspacePicker({ memberships, loading, onClose, onSelect }: { memberships: FounderMembership[]; loading: boolean; onClose: () => void; onSelect: (membership: FounderMembership) => void }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Choose workspace"><div className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><h3 className="text-lg font-bold">Choose a workspace</h3><p className="mt-1 text-sm text-ink-muted">Select the workspace you want to view.</p><div className="mt-4 space-y-2">{memberships.map((membership) => <button key={membership.workspace_id} disabled={loading} onClick={() => onSelect(membership)} className="flex w-full items-center justify-between rounded-xl border border-base-border px-3 py-3 text-left hover:border-brand-accent/40 disabled:opacity-50"><span><span className="block text-sm font-bold">{membership.workspace_name}</span><span className="mt-1 block text-xs text-ink-muted">{membership.plan} · {membership.member_role}</span></span><ExternalLink size={16} className="text-brand-accent" /></button>)}</div><div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button></div></div></div>;
}

function RoleEditor({ user, memberships, onClose, onSaved }: { user: FounderUser360["user"]; memberships: FounderMembership[]; onClose: () => void; onSaved: (platformRole: string, membership?: FounderMembership) => Promise<void> }) {
  const [platformRole, setPlatformRole] = useState(user.role || "user");
  const [workspaceId, setWorkspaceId] = useState(memberships[0]?.workspace_id || "");
  const [membershipRole, setMembershipRole] = useState(memberships[0]?.member_role || "user");
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const selected = memberships.find((item) => item.workspace_id === workspaceId);
  const changeWorkspace = (id: string) => { setWorkspaceId(id); setMembershipRole(memberships.find((item) => item.workspace_id === id)?.member_role || "user"); };
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Change user role"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await onSaved(platformRole, selected ? { ...selected, member_role: membershipRole } : undefined); } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); } }} className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><h3 className="text-lg font-bold">Change role</h3><p className="mt-1 text-sm text-ink-muted">Platform and workspace membership roles are separate and audit logged.</p>{error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}<label className="mt-5 block text-sm font-semibold">Platform role<select value={platformRole} onChange={(event) => setPlatformRole(event.target.value)} className="mt-2 field">{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>{memberships.length > 0 && <><label className="mt-4 block text-sm font-semibold">Workspace<select value={workspaceId} onChange={(event) => changeWorkspace(event.target.value)} className="mt-2 field">{memberships.map((membership) => <option key={membership.workspace_id} value={membership.workspace_id}>{membership.workspace_name}</option>)}</select></label><label className="mt-4 block text-sm font-semibold">Workspace membership role<select value={membershipRole} onChange={(event) => setMembershipRole(event.target.value)} className="mt-2 field">{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label></>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-sm font-semibold">Cancel</button><button disabled={saving} className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save role"}</button></div></form></div>;
}

function Pagination({ page, total, limit, loading, onChange }: { page: number; total: number; limit: number; loading: boolean; onChange: (page: number) => void }) { const totalPages = Math.max(1, Math.ceil(total / limit)); return <div className="flex items-center justify-between px-4 py-3"><p className="text-sm text-ink-muted">Page {Math.min(page + 1, totalPages)} of {totalPages}</p><div className="flex gap-2"><button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0 || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronLeft size={17} /></button><button onClick={() => onChange(page + 1)} disabled={page + 1 >= totalPages || loading} className="rounded-lg border border-base-border p-2 disabled:opacity-40"><ChevronRight size={17} /></button></div></div>; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-base-border bg-base-raised px-3"><Search size={16} className="text-ink-faint" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /></div>; }
function Filter({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode }) { return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-sm outline-none focus:border-brand-accent/60">{children}</select>; }
function Info({ label, value, badge = false }: { label: string; value: string; badge?: boolean }) { return <div className="rounded-lg bg-base-raised p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>{badge ? <div className="mt-2"><StatusBadge value={value} /></div> : <p className="mt-1 break-words text-sm font-semibold">{value}</p>}</div>; }
function ControlButton({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: typeof X; label: string; tone: "good" | "warning" | "danger" }) { const className = { good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300", danger: "bg-danger/10 text-danger" }[tone]; return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${className}`}><Icon size={14} />{label}</button>; }
function LoadingRow({ columns }: { columns: number }) { return <tr><td colSpan={columns} className="p-8 text-center"><Loader2 className="mx-auto animate-spin text-brand-accent" /></td></tr>; }
function EmptyRow({ columns, title, copy }: { columns: number; title: string; copy: string }) { return <tr><td colSpan={columns}><EmptyState title={title} copy={copy} /></td></tr>; }
function ActivityStatus({ value }: { value: string | null | undefined }) { const parsed = value ? new Date(value) : null; const age = parsed && !Number.isNaN(parsed.getTime()) ? Date.now() - parsed.getTime() : null; const label = age === null ? "Offline" : age < 120_000 ? "Online" : age < 600_000 ? "Recently active" : "Offline"; const relative = age === null ? "Not recorded" : age < 60_000 ? "just now" : `${Math.floor(age / 60_000)} minutes ago`; return <span title={parsed?.toLocaleString() || "No activity recorded"} className={label === "Online" ? "font-semibold text-emerald-600" : label === "Recently active" ? "font-semibold text-amber-600" : "text-ink-muted"}>{label} · {relative}</span>; }
function formatOptionalDate(value: string | null | undefined) { if (!value) return "Offline · not recorded"; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return "Offline · not recorded"; const age = Date.now() - parsed.getTime(); const state = age < 120_000 ? "Online" : age < 600_000 ? "Recently active" : "Offline"; const relative = age < 60_000 ? "just now" : `${Math.floor(age / 60_000)} minutes ago`; return `${state} · ${relative}`; }
function csvCell(value: unknown) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
