import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import type { Workspace, Profile } from "../../lib/types";
import { Search, ExternalLink, UserCheck, UserX, Trash2, RefreshCw, Users, ShoppingCart, ChevronDown } from "lucide-react";

interface WorkspaceRow extends Workspace {
  owner?: Profile | null;
  memberCount?: number;
  orderCount?: number;
}

async function auditLog(action: string, targetId: string) {
  await supabase.from("platform_audit_logs").insert({
    actor_role: "supervisor",
    action,
    target_type: "workspace",
    target_name: targetId,
    created_at: new Date().toISOString(),
  }).then(() => { });
}

export default function AdminWorkspaces() {
  const navigate = useNavigate();
  const { selectWorkspacePreview, profile: adminProfile } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedWs, setSelectedWs] = useState<WorkspaceRow | null>(null);
  const [modalType, setModalType] = useState<"suspend" | "activate" | "delete" | "transfer" | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    
    // Utiliser d'abord la fonction RPC admin pour contourner RLS
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('admin_get_all_workspaces');
    
    let data, error;
    
    if (!rpcError && rpcData) {
      data = rpcData;
      error = null;
      console.log("[AdminWorkspaces] Loaded workspaces via RPC");
    } else {
      console.error("[AdminWorkspaces] RPC failed, trying direct query:", rpcError);
      // Fallback: essayer la requête directe
      const result = await supabase
        .from("workspaces")
        .select("id, name, created_at, meta_access_token, meta_ad_account_id, is_active, status, created_by")
        .order("created_at", { ascending: false });
      
      data = result.data;
      error = result.error;
    }

    if (error) { 
      console.error("[AdminWorkspaces] Final error:", error);
      setLoading(false); 
      return; 
    }

    // Enrich: member counts, order counts, owner
    const wsRows = (data ?? []) as WorkspaceRow[];
    const enriched = await Promise.all(wsRows.map(async (ws) => {
      const [membersRes, ordersRes, ownerRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id),
        supabase.from("orders").select('"Order ID"', { count: "exact", head: true }).eq("workspace_id", ws.id),
        ws.created_by
          ? supabase.from("profiles").select("id, full_name, email, role").eq("id", ws.created_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        ...ws,
        memberCount: membersRes.count ?? 0,
        orderCount: ordersRes.count ?? 0,
        owner: (ownerRes.data as Profile | null) ?? null,
      };
    }));

    setWorkspaces(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = workspaces.filter(ws => {
    if (search) {
      const q = search.toLowerCase();
      if (!(ws.name.toLowerCase().includes(q) || ws.id.includes(q))) return false;
    }
    if (statusFilter === "active" && ws.is_active === false) return false;
    if (statusFilter === "suspended" && ws.is_active !== false) return false;
    return true;
  });

  const openModal = (ws: WorkspaceRow, type: typeof modalType) => {
    setSelectedWs(ws);
    setModalType(type);
    setNewOwnerEmail("");
  };

  const closeModal = () => { setSelectedWs(null); setModalType(null); setBusy(false); };

  const doToggle = async (active: boolean) => {
    if (!selectedWs) return;
    setBusy(true);
    const { error } = await supabase.from("workspaces")
      .update({ is_active: active, status: active ? "active" : "suspended" })
      .eq("id", selectedWs.id);
    if (error) { toast.error("Failed."); setBusy(false); return; }
    setWorkspaces(w => w.map(r => r.id === selectedWs.id ? { ...r, is_active: active, status: active ? "active" : "suspended" } : r));
    await auditLog(active ? "activate_workspace" : "suspend_workspace", selectedWs.id);
    toast.success(active ? "Workspace activated." : "Workspace suspended.");
    closeModal();
  };

  const doDelete = async () => {
    if (!selectedWs) return;
    setBusy(true);
    const { error } = await supabase.from("workspaces").delete().eq("id", selectedWs.id);
    if (error) { toast.error("Failed to delete workspace."); setBusy(false); return; }
    setWorkspaces(w => w.filter(r => r.id !== selectedWs.id));
    await auditLog("delete_workspace", selectedWs.id);
    toast.success("Workspace deleted.");
    closeModal();
  };

  const doLoginAsOwner = async (ws: WorkspaceRow) => {
    if (!ws.owner) { toast.error("No owner profile found."); return; }
    selectWorkspacePreview(ws.owner, ws);
    navigate("/");
  };

  const doTransfer = async () => {
    if (!selectedWs || !newOwnerEmail) return;
    setBusy(true);
    const { data: target } = await supabase.from("profiles").select("id").ilike("email", newOwnerEmail).maybeSingle();
    if (!target) { toast.error("User not found."); setBusy(false); return; }
    const { error } = await supabase.from("workspaces").update({ created_by: target.id }).eq("id", selectedWs.id);
    if (error) { toast.error("Failed to transfer ownership."); setBusy(false); return; }
    setWorkspaces(w => w.map(r => r.id === selectedWs.id ? { ...r, created_by: target.id } : r));
    await auditLog("transfer_ownership", selectedWs.id);
    toast.success("Ownership transferred.");
    closeModal();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Workspaces" subtitle={`${workspaces.length} total workspaces on the platform.`} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search workspace name or ID…"
            className="w-full rounded-lg border border-base-border bg-base-surface pl-8 pr-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50 focus:outline-none" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-base-border bg-base-surface px-3 py-2 pr-8 text-[13px] text-ink focus:outline-none">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        </div>
        <span className="text-[12px] text-ink-muted">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">Loading workspaces…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ws => {
            const active = ws.is_active !== false && ws.status !== "suspended";
            return (
              <div key={ws.id} className="rounded-xl border border-base-border bg-base-surface p-4 hover:bg-base-raised/20 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[13px] font-semibold text-brand">
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-ink">{ws.name}</div>
                      <div className="text-[11.5px] text-ink-muted font-mono">{ws.id}</div>
                      {ws.owner && (
                        <div className="text-[12px] text-ink-muted mt-0.5">Owner: {ws.owner.full_name || ws.owner.email || "—"}</div>
                      )}
                    </div>
                  </div>

                  {/* Stats + Status */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                      <Users size={13} /> {ws.memberCount ?? 0} members
                    </div>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                      <ShoppingCart size={13} /> {ws.orderCount ?? 0} orders
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${active ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {active ? "Active" : "Suspended"}
                    </span>
                    {ws.meta_access_token && (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-medium bg-sky-500/10 text-sky-400">Meta ✓</span>
                    )}
                    <div className="text-[11.5px] text-ink-faint">{new Date(ws.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-base-border/60">
                  {ws.owner && (
                    <button onClick={() => doLoginAsOwner(ws)} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-2.5 py-1 text-[12px] text-ink hover:bg-base-raised transition-colors">
                      <ExternalLink size={12} /> Login as Owner
                    </button>
                  )}
                  <button onClick={() => openModal(ws, active ? "suspend" : "activate")}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-amber-500/20 text-amber-400 hover:bg-amber-500/10" : "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"}`}>
                    {active ? <><UserX size={12} /> Suspend</> : <><UserCheck size={12} /> Activate</>}
                  </button>
                  <button onClick={() => openModal(ws, "transfer")} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-2.5 py-1 text-[12px] text-ink hover:bg-base-raised transition-colors">
                    <RefreshCw size={12} /> Transfer Ownership
                  </button>
                  <button onClick={() => openModal(ws, "delete")} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 px-2.5 py-1 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-base-border bg-base-surface px-4 py-10 text-center text-[13px] text-ink-muted">No workspaces found.</div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedWs && modalType === "suspend" && (
        <ConfirmModal title="Suspend Workspace" onClose={closeModal} busy={busy}
          message={`Suspend "${selectedWs.name}"? All members will lose access.`}
          confirmLabel="Suspend" confirmVariant="danger" onConfirm={() => doToggle(false)} />
      )}
      {selectedWs && modalType === "activate" && (
        <ConfirmModal title="Activate Workspace" onClose={closeModal} busy={busy}
          message={`Reactivate "${selectedWs.name}"? Members will regain access.`}
          confirmLabel="Activate" confirmVariant="success" onConfirm={() => doToggle(true)} />
      )}
      {selectedWs && modalType === "delete" && (
        <ConfirmModal title="Delete Workspace" onClose={closeModal} busy={busy}
          message={`Permanently delete "${selectedWs.name}"? All data will be lost. This cannot be undone.`}
          confirmLabel="Delete Permanently" confirmVariant="danger" onConfirm={doDelete} />
      )}
      {selectedWs && modalType === "transfer" && (
        <Modal title="Transfer Ownership" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">Transfer ownership of <strong className="text-ink">{selectedWs.name}</strong> to another user.</p>
            <div>
              <label className="text-[12px] text-ink-faint uppercase tracking-wider block mb-1.5">New Owner Email</label>
              <input value={newOwnerEmail} onChange={e => setNewOwnerEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="rounded-lg border border-base-border px-3 py-2 text-[13px] text-ink hover:bg-base-raised">Cancel</button>
              <button onClick={doTransfer} disabled={busy || !newOwnerEmail}
                className="rounded-lg bg-brand px-3 py-2 text-[13px] font-medium text-white disabled:opacity-60 hover:bg-brand/90">
                {busy ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
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
