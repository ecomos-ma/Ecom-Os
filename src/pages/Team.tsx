import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getAppUrlForPath } from "../lib/appUrl";
import { useAuth } from "../hooks/useAuth";
import { useTeamData, type TeamMember } from "../hooks/useTeamData";
import { ALL_ALLOWED_SECTIONS, normalizeAllowedSections, ROLE_LABELS, ROLE_OPTIONS } from "../lib/rbac";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import type { WorkspaceInvitation, TeamRole } from "../lib/types";
import { getUserInitials } from "../services/avatarService";
import { CallReviewPanel } from "./confirmation/CallReviewPanel";
import {
  UserPlus, Clock, X, Send, CheckCircle, XCircle, Trash2, Edit3, Lock,
  Unlock, Users, Trophy, Activity, LayoutDashboard, Shield, Star,
  TrendingUp, Package, Wifi, Coffee, AlertCircle, ChevronRight,
  Search, RefreshCw, Award, Zap, Target, BarChart2, MessageSquare,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "assignment" | "leaderboard" | "auditlog" | "callreview";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  online: { label: "Online", color: "text-emerald-400", dot: "bg-emerald-400" },
  offline: { label: "Offline", color: "text-ink-faint", dot: "bg-ink-faint" },
  busy: { label: "Busy", color: "text-amber-400", dot: "bg-amber-400" },
  break: { label: "On Break", color: "text-blue-400", dot: "bg-blue-400" },
  lunch: { label: "Lunch", color: "text-purple-400", dot: "bg-purple-400" },
  vacation: { label: "Vacation", color: "text-cyan-400", dot: "bg-cyan-400" },
  idle: { label: "Idle", color: "text-orange-400", dot: "bg-orange-400" },
};

const RANK_COLORS: Record<string, string> = {
  Bronze: "text-amber-700",
  Silver: "text-gray-400",
  Gold: "text-yellow-400",
  Platinum: "text-cyan-300",
  Diamond: "text-blue-400",
  Master: "text-purple-400",
  Grandmaster: "text-red-400",
  Legend: "text-orange-400",
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot} ${status === "online" ? "animate-pulse" : ""}`} />
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-9 w-9 text-[12px]" : size === "lg" ? "h-16 w-16 text-[20px]" : "h-11 w-11 text-[14px]";
  const dotSz = size === "sm" ? "h-2.5 w-2.5 bottom-0 right-0" : "h-3 w-3 bottom-0.5 right-0.5";
  const cfg = STATUS_CONFIG[member.agent_status] ?? STATUS_CONFIG.offline;
  return (
    <div className="relative flex-shrink-0">
      {member.avatar_url ? (
        <img src={member.avatar_url} alt={member.full_name ?? ""} className={`${sz} rounded-full object-cover`} />
      ) : (
        <div className={`${sz} flex items-center justify-center rounded-full bg-gradient-to-br from-brand/30 to-brand/10 font-bold text-brand`}>
          {getUserInitials(member.full_name)}
        </div>
      )}
      <span className={`absolute ${dotSz} rounded-full border-2 border-base-surface ${cfg.dot} ${member.agent_status === "online" ? "animate-pulse" : ""}`} />
    </div>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    owner: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    supervisor: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    agent: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  const cls = map[role] ?? map.agent;
  const labels: Record<string, string> = { owner: "Owner", supervisor: "Supervisor", agent: "Agent" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>
      {role === "owner" && <Shield size={9} />}
      {role === "supervisor" && <Star size={9} />}
      {labels[role] ?? role}
    </span>
  );
}

// ─── Stat Mini Card ───────────────────────────────────────────────────────────

function MiniStat({ label, value, icon, color = "text-ink" }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-base-border bg-base-raised/50 p-3 text-center">
      <div className={`${color} opacity-70`}>{icon}</div>
      <div className={`text-[18px] font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10.5px] text-ink-muted">{label}</div>
    </div>
  );
}

// ─── Member Card ─────────────────────────────────────────────────────────────

function MemberCard({
  member,
  perf,
  onEdit,
  onSelect,
  isOwner,
}: {
  member: TeamMember;
  perf?: any;
  onEdit: (m: TeamMember) => void;
  onSelect: (m: TeamMember) => void;
  isOwner: boolean;
}) {
  return (
    <div
      className="group relative rounded-2xl border border-base-border bg-base-surface/80 backdrop-blur-sm p-4 transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/5 cursor-pointer"
      onClick={() => onSelect(member)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink leading-tight truncate max-w-[140px]">
              {member.full_name || "Unknown"}
            </div>
            <div className="text-[11px] text-ink-muted truncate max-w-[140px]">{member.email}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusDot status={member.agent_status} />
              <span className={`text-[10.5px] font-medium ${STATUS_CONFIG[member.agent_status]?.color ?? "text-ink-faint"}`}>
                {STATUS_CONFIG[member.agent_status]?.label ?? "Offline"}
              </span>
            </div>
          </div>
        </div>
        <RoleBadge role={member.role} />
      </div>

      {/* Performance mini row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-base-raised px-2 py-1.5 text-center">
          <div className="text-[13px] font-bold text-ink font-mono">{perf?.total_assigned ?? 0}</div>
          <div className="text-[9.5px] text-ink-muted">Assigned</div>
        </div>
        <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5 text-center">
          <div className="text-[13px] font-bold text-emerald-400 font-mono">{perf?.confirmed ?? 0}</div>
          <div className="text-[9.5px] text-ink-muted">Confirmed</div>
        </div>
        <div className="rounded-lg bg-brand/10 px-2 py-1.5 text-center">
          <div className="text-[13px] font-bold text-brand font-mono">
            {perf ? `${perf.confirmation_rate.toFixed(0)}%` : "—"}
          </div>
          <div className="text-[9.5px] text-ink-muted">Rate</div>
        </div>
      </div>

      {/* Status / Rank */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Award size={12} className={RANK_COLORS[member.rank] ?? "text-amber-700"} />
          <span className={`text-[11px] font-semibold ${RANK_COLORS[member.rank] ?? "text-amber-700"}`}>{member.rank}</span>
          <span className="text-[10px] text-ink-faint">· {member.xp} XP</span>
        </div>
        {member.status === "disabled" && (
          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger font-semibold">Suspended</span>
        )}
      </div>

      {/* Action overlay on hover */}
      {isOwner && !member.is_owner && (
        <div className="absolute inset-0 rounded-2xl bg-base-surface/95 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(member); }}
            className="flex items-center gap-1.5 rounded-xl bg-brand/10 text-brand px-3 py-2 text-[12px] font-medium hover:bg-brand/20"
          >
            <Edit3 size={13} /> Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(member); }}
            className="flex items-center gap-1.5 rounded-xl bg-base-raised px-3 py-2 text-[12px] font-medium text-ink hover:bg-base-border"
          >
            <ChevronRight size={13} /> Profile
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Team() {
  const { workspace, profile, session } = useAuth();
  const navigate = useNavigate();
  const {
    members, invitations, assignments, activityLog, performanceMap, loading,
    reload, updateMemberStatus, updateMemberRole, removeMember, setInvitations,
  } = useTeamData();

  const isOwner = profile?.role === "founder" || profile?.role === "owner";
  const isAdmin = isOwner || ["supervisor", "admin", "manager"].includes(profile?.role || "");

  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (!selectedMember) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedMember]);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", role: "agent" as TeamRole, allowedSections: ["Dashboard"] });
  const [inviteBusy, setInviteBusy] = useState(false);

  // Assignment
  const [assignMode, setAssignMode] = useState<"manual" | "auto" | "roundrobin">("manual");
  const [unassignedOrders, setUnassignedOrders] = useState<any[]>([]);
  const [assignLoadingId, setAssignLoadingId] = useState<string | null>(null);

  // Load unassigned orders for assignment tab
  useEffect(() => {
    if (!workspace?.id || tab !== "assignment") return;
    supabase
      .from("orders")
      .select("id, order_number, total, city, status, shipping_status, delivery_status, created_at")
      .eq("workspace_id", workspace.id)
      .is("assigned_to", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setUnassignedOrders(data ?? []));
  }, [workspace?.id, tab]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredMembers = members.filter(
    (m) => !search || m.full_name?.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = members.filter(m => m.agent_status === "online" || m.agent_status === "busy").length;
  const activeCount = members.filter(m => m.status === "active").length;
  const totalAssigned = assignments.filter(a => a.result === "pending").length;
  const totalConfirmed = Object.values(performanceMap).reduce((s, p) => s + p.confirmed, 0);

  const leaderboard = [...members]
    .map(m => ({ member: m, perf: performanceMap[m.id] }))
    .sort((a, b) => (b.perf?.confirmation_rate ?? 0) - (a.perf?.confirmation_rate ?? 0));

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!inviteForm.email || !workspace?.id || !session?.user?.id) { toast.error("Fill in all fields."); return; }
    setInviteBusy(true);
    try {
      const allowedSections = inviteForm.role === "supervisor" ? ALL_ALLOWED_SECTIONS : normalizeAllowedSections(inviteForm.allowedSections);
      
      // Generate a unique token for the invitation
      const token = crypto.randomUUID();
      
      // Create invitation directly (RLS policies are now fixed)
      const { data: invitation, error } = await supabase.from("workspace_invitations").insert({
        id: token,
        workspace_id: workspace.id,
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        allowed_sections: allowedSections,
        invited_by: session.user.id,
        status: "pending",
      }).select().single();

      if (error) throw error;

      // Generate invite link
      const inviteLink = getAppUrlForPath(`/invite?token=${encodeURIComponent(token)}`);

      // Skip Edge Function call for now - provide manual link
      toast.success(`Invitation created! Share this link: ${inviteLink}`);

      setShowInviteModal(false);
      setInviteForm({ fullName: "", email: "", role: "agent", allowedSections: ["Dashboard"] });
      reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to send invite");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    await updateMemberRole(editingMember.id, editingMember.role, editingMember.allowed_sections);
    toast.success("Member updated.");
    setEditingMember(null);
  };

  const handleToggleStatus = async (m: TeamMember) => {
    if (m.is_owner) return;
    await updateMemberStatus(m.id, m.status !== "active");
    toast.success(m.status === "active" ? "Member suspended." : "Member activated.");
  };

  const handleRemove = async (m: TeamMember) => {
    if (m.is_owner) return;
    if (!confirm(`Remove ${m.full_name || m.email} from the team?`)) return;
    await removeMember(m.id);
    if (selectedMember?.id === m.id) setSelectedMember(null);
    toast.success("Member removed.");
  };

  const handleAssignOrder = async (orderId: string, agentId: string) => {
    if (!session?.user?.id || !workspace?.id) return;
    setAssignLoadingId(orderId);
    try {
      // Assign on order itself
      await supabase.from("orders").update({ assigned_to: agentId }).eq("id", orderId).eq("workspace_id", workspace.id);
      // Log assignment
      await supabase.from("order_assignments").insert({
        workspace_id: workspace.id,
        order_id: orderId,
        assigned_to: agentId,
        assigned_by: session.user.id,
        result: "pending",
      });
      setUnassignedOrders(prev => prev.filter(o => o.id !== orderId));
      toast.success("Order assigned.");
    } catch (e: any) {
      toast.error("Failed to assign order.");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const handleAutoDistribute = async () => {
    if (!workspace?.id || !session?.user?.id) return;
    const agents = members.filter(m => m.status === "active" && m.role !== "owner" && m.allowed_sections.includes("Confirmation"));
    if (!agents.length) { toast.error("No active confirmation agents."); return; }
    const sorted = [...agents].sort((a, b) => (performanceMap[a.id]?.active_count ?? 0) - (performanceMap[b.id]?.active_count ?? 0));
    let idx = 0;
    for (const order of unassignedOrders) {
      await handleAssignOrder(order.id, sorted[idx % sorted.length].id);
      idx++;
    }
    toast.success("Orders auto-distributed!");
  };

  // ────────────────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    { id: "assignment", label: "Order Assignment", icon: <Target size={14} /> },
    { id: "leaderboard", label: "Leaderboard", icon: <Trophy size={14} /> },
    { id: "auditlog", label: "Audit Log", icon: <Activity size={14} /> },
    ...(isAdmin ? [{ id: "callreview" as const, label: "Call Review", icon: <MessageSquare size={14} /> }] : []),
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Management"
        subtitle="Manage your team, assign orders, and track performance."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              className="rounded-lg border border-base-border bg-base-raised p-2 text-ink-muted hover:text-ink transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand/90 transition-colors"
              >
                <UserPlus size={15} /> Invite Member
              </button>
            )}
          </div>
        }
      />

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Members Online", value: onlineCount, icon: <Wifi size={16} />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Active Members", value: activeCount, icon: <Users size={16} />, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Pending Orders", value: totalAssigned, icon: <Package size={16} />, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Total Confirmed", value: totalConfirmed, icon: <CheckCircle size={16} />, color: "text-brand", bg: "bg-brand/10" },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-base-border bg-base-surface/80 p-4 flex items-center gap-3">
            <div className={`rounded-xl ${bg} p-2.5 ${color}`}>{icon}</div>
            <div>
              <div className="text-[22px] font-bold font-mono text-ink leading-none">{value}</div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-base-border overflow-x-auto pb-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-all -mb-px
              ${tab === t.id ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink hover:border-base-border"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ──────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full rounded-xl border border-base-border bg-base-raised py-2 pl-9 pr-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-base-raised animate-pulse" />
              ))}
            </div>
          ) : members.length <= 1 ? (
            <div className="py-16 md:py-24">
              <EmptyState 
                title="Working solo" 
                description="Invite team members to assign orders, share workload, and track performance." 
                primaryAction={
                  isAdmin ? (
                    <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand/90">
                      <UserPlus size={14} /> Invite Member
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-16 md:py-24">
              <EmptyState 
                title="No members found" 
                description="Try adjusting your search to find team members." 
                primaryAction={
                  <button onClick={() => setSearch("")} className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-[13px] font-medium text-ink hover:bg-base-border">Clear Search</button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMembers.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  perf={performanceMap[m.id]}
                  onEdit={setEditingMember}
                  onSelect={setSelectedMember}
                  isOwner={isAdmin}
                />
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {invitations.filter(i => i.status === "pending").length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
              <div className="px-4 py-3 flex items-center gap-2 text-[13px] font-semibold text-amber-400">
                <Clock size={14} /> Pending Invitations ({invitations.filter(i => i.status === "pending").length})
              </div>
              {invitations.filter(i => i.status === "pending").map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-[13px] text-ink font-medium">{inv.email}</div>
                    <div className="text-[11px] text-ink-muted">{inv.role} · Sent {new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await supabase.from("workspace_invitations").delete().eq("id", inv.id);
                        reload();
                        toast.success("Invitation cancelled.");
                      }}
                      className="rounded-lg border border-danger/20 bg-danger/10 px-2.5 py-1.5 text-[11.5px] text-danger hover:bg-danger/20"
                    >
                      <X size={12} />
                    </button>
                    <button className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11.5px] text-ink-muted hover:text-ink">
                      <Send size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Order Assignment ──────────────────────────────────────────── */}
      {tab === "assignment" && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-base-border bg-base-surface/80">
            <span className="text-[13px] font-semibold text-ink">Distribution Mode:</span>
            <div className="flex bg-base-raised/80 rounded-xl p-1 gap-1">
              {(["manual", "auto", "roundrobin"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setAssignMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all capitalize ${assignMode === mode ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}
                >
                  {mode === "roundrobin" ? "Round Robin" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            {assignMode === "auto" && (
              <button
                onClick={handleAutoDistribute}
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 px-3 py-2 text-[12.5px] font-medium hover:bg-emerald-500/25"
              >
                <Zap size={13} /> Auto Distribute All
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Unassigned orders */}
            <div className="rounded-2xl border border-base-border bg-base-surface/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-base-border flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-400" /> Unassigned Orders ({unassignedOrders.length})
                </span>
              </div>
              <div className="max-h-[400px] overflow-y-auto divide-y divide-base-border/50">
                {unassignedOrders.length === 0 ? (
                  <div className="py-12"><EmptyState title="No unassigned orders 🎉" description="All confirmed orders are currently assigned to agents." compact /></div>
                ) : unassignedOrders.map(order => (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-[13px] font-medium text-ink">#{order.order_number}</div>
                      <div className="text-[11px] text-ink-muted">{order.city || "—"} · {Number(order.total).toLocaleString()} MAD</div>
                    </div>
                    {assignMode === "manual" && (
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) handleAssignOrder(order.id, e.target.value); }}
                        className="rounded-lg border border-base-border bg-base-raised px-2 py-1.5 text-[12px] text-ink focus:outline-none"
                        disabled={assignLoadingId === order.id}
                      >
                        <option value="">Assign to…</option>
                        {members.filter(m => m.status === "active" && m.role !== "owner").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.full_name || m.email} ({performanceMap[m.id]?.active_count ?? 0} active)
                          </option>
                        ))}
                      </select>
                    )}
                    {assignLoadingId === order.id && <RefreshCw size={13} className="animate-spin text-ink-muted" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Agent workload */}
            <div className="rounded-2xl border border-base-border bg-base-surface/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-base-border">
                <span className="text-[13px] font-semibold text-ink flex items-center gap-2">
                  <BarChart2 size={14} className="text-brand" /> Agent Workload
                </span>
              </div>
              <div className="divide-y divide-base-border/50">
                {members.filter(m => m.status === "active" && m.role !== "owner").map(m => {
                  const perf = performanceMap[m.id];
                  const pct = perf ? Math.min(100, (perf.active_count / m.max_active_orders) * 100) : 0;
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <MemberAvatar member={m} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12.5px] font-medium text-ink truncate">{m.full_name || m.email}</span>
                          <span className="text-[11px] text-ink-muted ml-2 shrink-0">{perf?.active_count ?? 0}/{m.max_active_orders}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-base-raised overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct > 80 ? "bg-danger" : pct > 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Leaderboard ──────────────────────────────────────────────── */}
      {tab === "leaderboard" && (
        <div className="rounded-2xl border border-base-border bg-base-surface/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-base-border flex items-center gap-2">
            <Trophy size={16} className="text-yellow-400" />
            <span className="text-[14px] font-bold text-ink">Performance Leaderboard</span>
            <span className="text-[12px] text-ink-muted ml-auto">Based on all-time order data</span>
          </div>
          <div className="divide-y divide-base-border/50">
            {leaderboard.map(({ member, perf }, i) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-base-raised/40 transition-colors cursor-pointer"
                onClick={() => setSelectedMember(member)}
              >
                <div className={`text-[18px] font-black font-mono w-8 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-ink-faint"}`}>
                  {i + 1}
                </div>
                <MemberAvatar member={member} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{member.full_name || member.email}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-ink-muted">{perf?.total_assigned ?? 0} assigned</span>
                    <span className="text-[11px] text-emerald-400">{perf?.confirmed ?? 0} confirmed</span>
                    <span className="text-[11px] text-brand">{Number(perf?.revenue_generated ?? 0).toLocaleString()} MAD</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-bold text-ink font-mono">{perf ? `${perf.confirmation_rate.toFixed(1)}%` : "—"}</div>
                  <div className="text-[10px] text-ink-muted">Confirm Rate</div>
                </div>
                <div className={`text-right ${RANK_COLORS[member.rank] ?? "text-amber-700"}`}>
                  <Award size={18} />
                  <div className="text-[9.5px] mt-0.5 font-semibold">{member.rank}</div>
                </div>
                {i < 3 && (
                  <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i === 0 ? "bg-yellow-500/15 text-yellow-400" : i === 1 ? "bg-gray-500/15 text-gray-300" : "bg-amber-600/15 text-amber-500"}`}>
                    {i === 0 ? "🏆 #1" : i === 1 ? "🥈 #2" : "🥉 #3"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Audit Log ────────────────────────────────────────────────── */}
      {tab === "auditlog" && (
        <div className="rounded-2xl border border-base-border bg-base-surface/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-base-border flex items-center gap-2">
            <Activity size={16} className="text-brand" />
            <span className="text-[14px] font-bold text-ink">Activity Timeline</span>
            <span className="text-[12px] text-ink-muted ml-auto">Last 200 events</span>
          </div>
          {activityLog.length === 0 ? (
            <div className="py-16">
              <EmptyState title="No activity yet" description="Activity logs will appear here as members interact with the platform." />
            </div>
          ) : (
            <div className="divide-y divide-base-border/50 max-h-[600px] overflow-y-auto">
              {activityLog.map(entry => {
                const m = members.find(m => m.id === entry.profile_id);
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    {m ? <MemberAvatar member={m} size="sm" /> : (
                      <div className="h-9 w-9 rounded-full bg-base-raised flex items-center justify-center text-ink-muted flex-shrink-0">
                        <span className="text-xs">?</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-semibold text-ink">{m?.full_name || m?.email || "Unknown"}</span>
                        <span className="text-[11px] text-ink-muted">{entry.action}</span>
                        {entry.entity_label && (
                          <span className="text-[11px] text-brand">#{entry.entity_label}</span>
                        )}
                      </div>
                      {(entry.old_value || entry.new_value) && (
                        <div className="text-[10.5px] text-ink-muted mt-0.5">
                          {entry.old_value && <span className="line-through mr-1">{entry.old_value}</span>}
                          {entry.new_value && <span className="text-emerald-400">→ {entry.new_value}</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-[10.5px] text-ink-faint shrink-0">
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Member Profile Side Panel ─────────────────────────────────────── */}
      {tab === "callreview" && isAdmin && workspace?.id && (
        <CallReviewPanel
          workspaceId={workspace.id}
          agents={members.map((member) => ({
            id: member.id,
            fullName: member.full_name || member.email || "Agent",
            avatarUrl: member.avatar_url,
            role: member.role,
          }))}
          onOpenOrder={(orderId) => navigate(`/confirmation?order=${encodeURIComponent(orderId)}`)}
        />
      )}

      {selectedMember && (
        <div className="app-modal-backdrop fixed inset-0 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setSelectedMember(null)} role="dialog" aria-modal="true" aria-label="Member profile">
          <div
            className="h-dvh w-full max-w-[420px] overflow-y-auto overscroll-contain border-l border-base-border bg-base-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-border bg-base-surface/95 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm">
              <span className="text-[14px] font-bold text-ink">Member Profile</span>
              <button onClick={() => setSelectedMember(null)} aria-label="Close member profile" className="grid h-11 w-11 place-items-center rounded-xl text-ink-muted hover:bg-base-raised hover:text-ink"><X size={16} /></button>
            </div>

            {/* Profile hero */}
            <div className="px-5 py-6 border-b border-base-border">
              <div className="flex items-center gap-4 mb-4">
                <MemberAvatar member={selectedMember} size="lg" />
                <div>
                  <div className="text-[18px] font-bold text-ink">{selectedMember.full_name || "Unknown User"}</div>
                  <div className="text-[12.5px] text-ink-muted">{selectedMember.email}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <RoleBadge role={selectedMember.role} />
                    <span className={`text-[11px] font-medium ${STATUS_CONFIG[selectedMember.agent_status]?.color ?? "text-ink-faint"}`}>
                      <StatusDot status={selectedMember.agent_status} /> {STATUS_CONFIG[selectedMember.agent_status]?.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${RANK_COLORS[selectedMember.rank] ? `bg-${selectedMember.rank.toLowerCase()}-500/10` : "bg-amber-500/10"}`}>
                <Award size={16} className={RANK_COLORS[selectedMember.rank] ?? "text-amber-600"} />
                <span className={`text-[13px] font-bold ${RANK_COLORS[selectedMember.rank] ?? "text-amber-600"}`}>{selectedMember.rank}</span>
                <span className="text-[12px] text-ink-muted ml-auto">{selectedMember.xp} XP</span>
              </div>
            </div>

            {/* Performance stats */}
            <div className="px-5 py-4 border-b border-base-border">
              <div className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide mb-3">Performance</div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Assigned" value={performanceMap[selectedMember.id]?.total_assigned ?? 0} icon={<Package size={14} />} />
                <MiniStat label="Confirmed" value={performanceMap[selectedMember.id]?.confirmed ?? 0} icon={<CheckCircle size={14} />} color="text-emerald-400" />
                <MiniStat label="Rate" value={`${(performanceMap[selectedMember.id]?.confirmation_rate ?? 0).toFixed(1)}%`} icon={<TrendingUp size={14} />} color="text-brand" />
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-ink-muted">Revenue Generated</span>
                  <span className="text-[12px] font-bold font-mono text-ink">{Number(performanceMap[selectedMember.id]?.revenue_generated ?? 0).toLocaleString()} MAD</span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 border-b border-base-border space-y-3">
              <div className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide mb-3">Details</div>
              {[
                { label: "Department", value: selectedMember.department || "—", icon: <Users size={13} /> },
                { label: "Phone", value: selectedMember.phone || "—", icon: <MessageSquare size={13} /> },
                { label: "Shift", value: selectedMember.shift, icon: <Coffee size={13} /> },
                { label: "Daily Limit", value: `${selectedMember.daily_limit} orders/day`, icon: <Target size={13} /> },
                { label: "Joined", value: selectedMember.joined_at ? new Date(selectedMember.joined_at).toLocaleDateString() : "—", icon: <Clock size={13} /> },
                { label: "Last Seen", value: selectedMember.last_seen_at ? new Date(selectedMember.last_seen_at).toLocaleDateString() : "—", icon: <Activity size={13} /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2 text-ink-muted">{icon} {label}</div>
                  <span className="text-ink font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Allowed Sections */}
            <div className="px-5 py-4 border-b border-base-border">
              <div className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide mb-3">Access</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedMember.allowed_sections.map(s => (
                  <span key={s} className="rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] text-brand font-medium">{s}</span>
                ))}
              </div>
            </div>

            {/* Actions */}
            {isAdmin && selectedMember.role !== "owner" && (
              <div className="px-5 py-4 space-y-2">
                <div className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide mb-3">Actions</div>
                <button
                  onClick={() => { setEditingMember({ ...selectedMember }); setSelectedMember(null); }}
                  className="w-full flex items-center gap-2 rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-base-border"
                >
                  <Edit3 size={14} /> Edit Role & Permissions
                </button>
                <button
                  onClick={() => { handleToggleStatus(selectedMember); setSelectedMember(null); }}
                  className={`w-full flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors ${selectedMember.status === "active"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}
                >
                  {selectedMember.status === "active" ? <><Lock size={14} /> Suspend Member</> : <><Unlock size={14} /> Activate Member</>}
                </button>
                {isOwner && (
                  <button
                    onClick={() => { handleRemove(selectedMember); }}
                    className="w-full flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-2.5 text-[13px] font-medium text-danger hover:bg-danger/20"
                  >
                    <Trash2 size={14} /> Remove from Team
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Member Modal ─────────────────────────────────────────────── */}
      {editingMember && (
        <Modal title="Edit Team Member" onClose={() => setEditingMember(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-base-border bg-base-raised p-3">
              <MemberAvatar member={editingMember} size="sm" />
              <div>
                <div className="text-[13px] font-semibold text-ink">{editingMember.full_name || "Unknown"}</div>
                <div className="text-[11.5px] text-ink-muted">{editingMember.email}</div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Role</label>
              <select
                value={editingMember.role}
                onChange={e => setEditingMember({ ...editingMember, role: e.target.value })}
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              >
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="mb-2 text-[12px] font-medium text-ink-muted">Allowed Sections</div>
              <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {ALL_ALLOWED_SECTIONS.map(section => (
                  <label key={section} className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[12.5px] text-ink transition hover:border-brand">
                    <input
                      type="checkbox"
                      checked={(editingMember.allowed_sections ?? []).includes(section)}
                      onChange={() => {
                        const curr = editingMember.allowed_sections ?? [];
                        setEditingMember({
                          ...editingMember,
                          allowed_sections: curr.includes(section) ? curr.filter(s => s !== section) : [...curr, section],
                        });
                      }}
                      className="h-4 w-4 rounded border-base-border text-brand"
                    />
                    {section}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveEdit}
              className="w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-medium text-white hover:bg-brand/90"
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ── Invite Modal ──────────────────────────────────────────────────── */}
      {showInviteModal && (
        <Modal title="Invite Team Member" onClose={() => setShowInviteModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Full Name</label>
              <input
                value={inviteForm.fullName}
                onChange={e => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                placeholder="Sara El Idrissi"
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Email *</label>
              <input
                value={inviteForm.email}
                onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="sara@yourstore.ma"
                type="email"
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Role</label>
              <select
                value={inviteForm.role}
                onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as TeamRole, allowedSections: e.target.value === "supervisor" ? ALL_ALLOWED_SECTIONS : inviteForm.allowedSections })}
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              >
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {inviteForm.role !== "supervisor" && (
              <div>
                <div className="mb-2 text-[12px] font-medium text-ink-muted">Allowed Sections</div>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {ALL_ALLOWED_SECTIONS.map(section => (
                    <label key={section} className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[12.5px] text-ink transition hover:border-brand">
                      <input
                        type="checkbox"
                        checked={inviteForm.allowedSections.includes(section)}
                        onChange={() => {
                          const curr = inviteForm.allowedSections;
                          setInviteForm({ ...inviteForm, allowedSections: curr.includes(section) ? curr.filter(s => s !== section) : [...curr, section] });
                        }}
                        className="h-4 w-4 rounded border-base-border text-brand"
                      />
                      {section}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleInvite}
              disabled={inviteBusy}
              className="w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
            >
              {inviteBusy ? "Sending…" : "Send Invitation"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
