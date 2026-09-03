import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { getAppUrlForPath } from "../../lib/appUrl";
import { toast } from "../../components/Toast";
import type { Profile, Workspace, UserRole } from "../../lib/types";
import {
  Search, Copy, ExternalLink, UserCheck, UserX, Trash2,
  Key, Mail, RefreshCw, ChevronDown, LogOut,
} from "lucide-react";

interface AdminUserRow extends Profile {
  email: string | null;
  workspace_name?: string | null;
  order_count?: number;
  customer_count?: number;
}

type ModalType =
  | "activate" | "disable" | "delete" | "changeRole"
  | "resetPassword" | "verifyEmail" | "forceLogout" | null;

const ROLES: UserRole[] = ["supervisor", "owner", "manager", "employee", "agent", "viewer", "user"];

// Audit helper
async function auditLog(action: string, targetId: string, actorId: string | null | undefined) {
  await supabase.from("platform_audit_logs").insert({
    actor_role: "supervisor",
    action,
    target_type: "user",
    target_name: targetId,
    created_at: new Date().toISOString(),
  }).then(() => { });
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { selectWorkspacePreview, profile: adminProfile } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceMap, setWorkspaceMap] = useState<Record<string, Workspace>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>("agent");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    
    // Utiliser d'abord la fonction RPC admin pour contourner RLS
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('admin_get_all_profiles');
    
    let data, error;
    
    if (!rpcError && rpcData) {
      data = rpcData;
      error = null;
      console.log("[AdminUsers] Loaded profiles via RPC");
    } else {
      console.error("[AdminUsers] RPC failed, trying direct query:", rpcError);
      // Fallback: essayer la requête directe
      const result = await supabase
        .from("profiles")
        .select("id, full_name, role, workspace_id, created_at, is_active, deleted_at, email, last_login_at")
        .order("created_at", { ascending: false });
      
      data = result.data;
      error = result.error;
    }

    if (error) { 
      console.error("[AdminUsers] Final error:", error);
      setLoading(false); 
      return; 
    }

    const wids = Array.from(new Set((data ?? []).map((r: any) => r.workspace_id).filter(Boolean) as string[]));
    const { data: wData } = await supabase.from("workspaces").select("id, name, created_at, meta_access_token, meta_ad_account_id").in("id", wids);
    setWorkspaceMap(Object.fromEntries((wData ?? []).map(ws => [ws.id, ws as Workspace])));
    setUsers((data ?? []) as AdminUserRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const wsLabel = useMemo(() => (u: AdminUserRow) => workspaceMap[u.workspace_id ?? ""]?.name ?? "Unassigned", [workspaceMap]);

  const isActive = (u: AdminUserRow) => u.is_active !== false && !u.deleted_at;

  const openModal = (user: AdminUserRow, type: ModalType) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setModalType(type);
  };

  const closeModal = () => { setSelectedUser(null); setModalType(null); setBusy(false); };

  const doToggleStatus = async (active: boolean) => {
    if (!selectedUser) return;
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ is_active: active, deleted_at: active ? null : new Date().toISOString() })
      .eq("id", selectedUser.id);
    if (error) { toast.error("Failed to update status."); setBusy(false); return; }
    setUsers(u => u.map(r => r.id === selectedUser.id ? { ...r, is_active: active, deleted_at: active ? null : new Date().toISOString() } : r));
    await auditLog(active ? "activate_user" : "disable_user", selectedUser.id, adminProfile?.id);
    toast.success(active ? "Account activated." : "Account disabled.");
    closeModal();
  };

  const doDelete = async () => {
    if (!selectedUser) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").delete().eq("id", selectedUser.id);
    if (error) { toast.error("Failed to delete user."); setBusy(false); return; }
    setUsers(u => u.filter(r => r.id !== selectedUser.id));
    await auditLog("delete_user", selectedUser.id, adminProfile?.id);
    toast.success("User deleted.");
    closeModal();
  };

  const doChangeRole = async () => {
    if (!selectedUser) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", selectedUser.id);
    if (error) { toast.error("Failed to change role."); setBusy(false); return; }
    setUsers(u => u.map(r => r.id === selectedUser.id ? { ...r, role: newRole } : r));
    await auditLog(`change_role_to_${newRole}`, selectedUser.id, adminProfile?.id);
    toast.success(`Role changed to ${newRole}.`);
    closeModal();
  };

  const doCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied.`));
  };

  const openDashboard = (user: AdminUserRow) => {
    const ws = workspaceMap[user.workspace_id ?? ""];
    if (ws) { selectWorkspacePreview(user, ws); navigate("/"); }
    else toast.error("No workspace linked.");
  };

  const filtered = useMemo(() => users.filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!(u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.id.includes(q))) return false;
    }
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !isActive(u)) return false;
    if (statusFilter === "disabled" && isActive(u)) return false;
    return true;
  }), [users, search, roleFilter, statusFilter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle={`${users.length} total users across the platform.`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or ID…"
            className="w-full rounded-lg border border-base-border bg-base-surface pl-8 pr-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50 focus:outline-none"
          />
        </div>
        <div className="relative">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="appearance-none rounded-lg border border-base-border bg-base-surface px-3 py-2 pr-8 text-[13px] text-ink focus:outline-none">
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-base-border bg-base-surface px-3 py-2 pr-8 text-[13px] text-ink focus:outline-none">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        </div>
        <span className="text-[12px] text-ink-muted ml-1">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">Loading users…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface">
          <div className="hidden md:grid grid-cols-[2.2fr_1fr_1.2fr_0.8fr_1.2fr_1.6fr] border-b border-base-border bg-base-raised/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            <div>User</div><div>Role</div><div>Workspace</div><div>Status</div><div>Last Login</div><div>Actions</div>
          </div>
          <div className="divide-y divide-base-border/60">
            {filtered.map(user => {
              const active = isActive(user);
              const initials = (user.full_name || user.email || "U").slice(0, 2).toUpperCase();
              return (
                <div key={user.id} className="grid grid-cols-1 md:grid-cols-[2.2fr_1fr_1.2fr_0.8fr_1.2fr_1.6fr] items-center px-4 py-3 gap-3 hover:bg-base-raised/30 transition-colors">
                  {/* User */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-semibold text-brand">{initials}</div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink truncate">{user.full_name || "Unnamed"}</div>
                      <div className="text-[11.5px] text-ink-muted truncate">{user.email || "—"}</div>
                    </div>
                  </div>
                  {/* Role */}
                  <div>
                    <span className="rounded-md bg-base-raised px-2 py-0.5 text-[11.5px] font-medium text-ink-muted capitalize">{user.role}</span>
                  </div>
                  {/* Workspace */}
                  <div className="text-[12.5px] text-ink-muted truncate">{wsLabel(user)}</div>
                  {/* Status */}
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      {active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  {/* Last login */}
                  <div className="text-[12px] text-ink-muted">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}
                  </div>
                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ActionBtn onClick={() => openDashboard(user)} icon={<ExternalLink size={12} />} title="Open Dashboard" />
                    <ActionBtn onClick={() => openModal(user, active ? "disable" : "activate")} icon={active ? <UserX size={12} /> : <UserCheck size={12} />} title={active ? "Disable" : "Activate"} variant={active ? "danger" : "success"} />
                    <ActionBtn onClick={() => openModal(user, "changeRole")} icon={<Key size={12} />} title="Role" />
                    <ActionBtn onClick={() => openModal(user, "resetPassword")} icon={<Mail size={12} />} title="Reset Pwd" />
                    <ActionBtn onClick={() => doCopy(user.id, "User ID")} icon={<Copy size={12} />} title="Copy ID" />
                    <ActionBtn onClick={() => openModal(user, "forceLogout")} icon={<LogOut size={12} />} title="Logout" />
                    <ActionBtn onClick={() => openModal(user, "delete")} icon={<Trash2 size={12} />} title="Delete" variant="danger" />
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-ink-muted">No users match your search.</div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedUser && modalType === "activate" && (
        <ConfirmModal title="Activate Account" onClose={closeModal} busy={busy}
          message={`Activate ${selectedUser.full_name || selectedUser.email}? They will immediately regain access.`}
          confirmLabel="Activate" confirmVariant="success" onConfirm={() => doToggleStatus(true)} />
      )}
      {selectedUser && modalType === "disable" && (
        <ConfirmModal title="Disable Account" onClose={closeModal} busy={busy}
          message={`Disable ${selectedUser.full_name || selectedUser.email}? They will lose access immediately.`}
          confirmLabel="Disable" confirmVariant="danger" onConfirm={() => doToggleStatus(false)} />
      )}
      {selectedUser && modalType === "delete" && (
        <ConfirmModal title="Delete User" onClose={closeModal} busy={busy}
          message={`Permanently delete ${selectedUser.full_name || selectedUser.email}? This cannot be undone.`}
          confirmLabel="Delete Permanently" confirmVariant="danger" onConfirm={doDelete} />
      )}
      {selectedUser && modalType === "forceLogout" && (
        <ConfirmModal title="Force Logout" onClose={closeModal} busy={busy}
          message={`Force log out ${selectedUser.full_name || selectedUser.email}? Their current session will end.`}
          confirmLabel="Force Logout" confirmVariant="danger"
          onConfirm={async () => {
            // Supabase doesn't support force logout server-side from client SDK
            // We mark a flag or simply close — documented as "future ready"
            await auditLog("force_logout", selectedUser.id, adminProfile?.id);
            toast.success("Force logout logged. Implement via Supabase Admin API on your backend.");
            closeModal();
          }} />
      )}
      {selectedUser && modalType === "resetPassword" && (
        <ConfirmModal title="Send Password Reset" onClose={closeModal} busy={busy}
          message={`Send a password reset email to ${selectedUser.email}?`}
          confirmLabel="Send Email" confirmVariant="success"
          onConfirm={async () => {
            if (!selectedUser.email) { toast.error("No email on file."); return; }
            setBusy(true);
            const { error } = await supabase.auth.resetPasswordForEmail(selectedUser.email, {
              redirectTo: getAppUrlForPath("/settings?tab=account"),
            });
            if (error) toast.error("Failed to send reset email.");
            else { await auditLog("send_password_reset", selectedUser.id, adminProfile?.id); toast.success("Password reset email sent."); }
            closeModal();
          }} />
      )}
      {selectedUser && modalType === "changeRole" && (
        <Modal title="Change Role" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">Change the role for <strong className="text-ink">{selectedUser.full_name || selectedUser.email}</strong>.</p>
            <div>
              <label className="text-[12px] text-ink-faint uppercase tracking-wider">New Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                className="mt-1.5 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:outline-none">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="rounded-lg border border-base-border px-3 py-2 text-[13px] text-ink hover:bg-base-raised">Cancel</button>
              <button onClick={doChangeRole} disabled={busy} className="rounded-lg bg-brand px-3 py-2 text-[13px] font-medium text-white disabled:opacity-60 hover:bg-brand/90">
                {busy ? "Saving…" : "Save Role"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ActionBtn({ onClick, icon, title, variant = "default" }: {
  onClick: () => void; icon: React.ReactNode; title: string; variant?: "default" | "danger" | "success";
}) {
  const cls = {
    default: "border-base-border text-ink-muted hover:bg-base-raised hover:text-ink",
    danger: "border-red-500/20 text-red-400 hover:bg-red-500/10",
    success: "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10",
  }[variant];
  return (
    <button onClick={onClick} title={title}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] transition-colors ${cls}`}>
      {icon} {title}
    </button>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmVariant, onConfirm, onClose, busy }: {
  title: string; message: string; confirmLabel: string;
  confirmVariant: "danger" | "success"; onConfirm: () => void; onClose: () => void; busy: boolean;
}) {
  const btnCls = confirmVariant === "danger"
    ? "bg-red-500 hover:bg-red-600 text-white"
    : "bg-emerald-500 hover:bg-emerald-600 text-white";
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] text-ink-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-base-border px-3 py-2 text-[13px] text-ink hover:bg-base-raised">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={`rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-60 ${btnCls}`}>
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
