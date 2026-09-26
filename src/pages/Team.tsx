import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useTeamData, type MemberPerformance, type TeamMember } from "../hooks/useTeamData";
import { useGlobalOrders } from "../contexts/OrdersContext";
import { ALL_ALLOWED_SECTIONS, normalizeAllowedSections, ROLE_LABELS, ROLE_OPTIONS } from "../lib/rbac";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import type { WorkspaceInvitation, TeamRole } from "../lib/types";
import { getUserInitials } from "../services/avatarService";
import { CallReviewPanel } from "./confirmation/CallReviewPanel";
import { assignConfirmationOrders, loadAssignmentMode, reconcileSeparatedAssignments, savePaymentRule, setAssignmentMode, type AssignmentMode } from "../services/agentPayrollService";
import {
  UserPlus, Clock, X, Send, CheckCircle, XCircle, Trash2, Edit3, Lock,
  Unlock, Users, Trophy, Activity, LayoutDashboard, Shield, Star,
  Coffee, AlertCircle, ChevronRight,
  Search, RefreshCw, Award, Zap, Target, BarChart2, MessageSquare,
  Copy, Link2, MonitorUp, Headphones, Mic, PhoneCall, Timer,
  PhoneIncoming, RotateCcw, Inbox, CircleAlert, CalendarClock, Package, BadgeDollarSign,
} from "lucide-react";

async function invitationFunctionError(error: unknown, data: any) {
  if (data?.error) return String(data.error);
  const response = (error as { context?: Response })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // Keep the provider's safe fallback message below.
    }
  }
  return error instanceof Error ? error.message : "Invitation service failed";
}

async function invokeInvitationFunction(body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return supabase.functions.invoke("send-team-invitation", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "invitations" | "assignment" | "leaderboard" | "auditlog" | "callreview";

function canReceiveConfirmationWork(member: TeamMember) {
  if (member.status !== "active" || member.is_owner || !["agent", "supervisor"].includes(member.role)) return false;
  // Empty selections belong to older invitations. Keep those agents usable;
  // explicit selections must include Confirmation before we give them a queue.
  return member.allowed_sections.length === 0 || member.allowed_sections.includes("Confirmation");
}

function isAssignableConfirmationOrder(status: string | null | undefined) {
  return !["cancelled", "confirmed", "shipped", "delivered", "returned", "refused", "blacklisted", "duplicate", "out_of_stock"].includes(
    String(status ?? "pending").trim().toLowerCase(),
  );
}

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

function formatDuration(totalSeconds: number) {
  if (!totalSeconds) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatResponseTime(totalSeconds: number | null | undefined) {
  if (totalSeconds === null || totalSeconds === undefined) return "—";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function localDayStart(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function PercentRing({ value, tone = "emerald" }: { value: number; tone?: "emerald" | "violet" }) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  const stroke = tone === "violet" ? "#8b5cf6" : "#10b981";
  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center">
      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
        <circle cx="22" cy="22" r="17" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${safeValue} 100`} />
      </svg>
      <span className="absolute text-[10px] font-bold text-slate-700 dark:text-slate-200">{Math.round(safeValue)}%</span>
    </div>
  );
}

function AgentMetric({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-xl border border-slate-200/80 px-3 py-2.5 dark:border-slate-700/70 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/75 dark:bg-slate-950/25">{icon}</span>
        <span className="text-[17px] font-bold leading-none text-slate-700 dark:text-slate-100">{value}</span>
      </div>
      <div className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

// ─── Member Card ─────────────────────────────────────────────────────────────

function MemberCard({
  member,
  perf,
  onSelect,
  metricView = "confirmation",
}: {
  member: TeamMember;
  perf?: MemberPerformance;
  onSelect: (m: TeamMember) => void;
  metricView?: "confirmation" | "delivery";
}) {
  const conversionRate = perf?.confirmation_rate ?? 0;
  const deliveryRate = perf?.delivery_rate ?? 0;
  return (
    <button
      type="button"
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900"
      onClick={() => onSelect(member)}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold text-slate-800 dark:text-white">{member.full_name || "Unknown"}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${member.status === "active" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${member.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`} />
                {member.status === "active" ? "Active" : "Suspended"}
              </span>
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold ${STATUS_CONFIG[member.agent_status]?.color ?? "text-ink-faint"}`} title="Live presence from the agent heartbeat">
                <StatusDot status={member.agent_status} /> {STATUS_CONFIG[member.agent_status]?.label ?? "Offline"}
              </span>
            </div>
            <div className="max-w-[220px] truncate text-[10.5px] text-slate-500 dark:text-slate-400">{member.email}</div>
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Conv. rate</div>
          <div className="flex items-center gap-3">
            <PercentRing value={conversionRate} tone="violet" />
            <div><div className="text-[19px] font-bold text-slate-800 dark:text-white">{Math.round(conversionRate)}%</div><div className="text-[9px] text-slate-500">{perf?.confirmed ?? 0} / {perf?.total_assigned ?? 0} confirmed</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Delivery rate</div>
          <div className="flex items-center gap-3">
            <PercentRing value={deliveryRate} />
            <div><div className="text-[19px] font-bold text-slate-800 dark:text-white">{Math.round(deliveryRate)}%</div><div className="text-[9px] text-slate-500">Delivered orders</div></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 px-4 py-2.5 sm:grid-cols-4 dark:border-slate-700">
        <div className="flex items-center gap-2"><PhoneCall size={13} className="text-sky-500" /><div><div className="text-[13px] font-bold text-slate-700 dark:text-slate-100">{perf?.calls ?? 0}</div><div className="text-[9px] text-slate-500">Calls</div></div></div>
        <div className="flex items-center gap-2"><Clock size={13} className="text-violet-500" /><div><div className="text-[13px] font-bold text-slate-700 dark:text-slate-100">{formatDuration(perf?.total_call_seconds ?? 0)}</div><div className="text-[9px] text-slate-500">Total call time</div></div></div>
        <div className="flex items-center gap-2"><Activity size={13} className="text-fuchsia-500" /><div><div className="text-[13px] font-bold text-slate-700 dark:text-slate-100">{formatDuration(perf?.session_seconds ?? 0)}</div><div className="text-[9px] text-slate-500">Session duration</div></div></div>
        <div className="flex items-center gap-2"><Timer size={13} className="text-amber-500" /><div><div className="text-[13px] font-bold text-slate-700 dark:text-slate-100">{formatResponseTime(perf?.avg_response_seconds)}</div><div className="text-[9px] text-slate-500">Avg. first response</div></div></div>
      </div>

      {metricView === "confirmation" ? <>
        <div className="grid grid-cols-2 gap-2 p-4">
          <AgentMetric label="Assigned" value={perf?.total_assigned ?? 0} icon={<Inbox size={14} className="text-slate-500" />} tone="bg-slate-50 dark:bg-slate-800/70" />
          <AgentMetric label="Contacted" value={perf?.contacted ?? 0} icon={<PhoneIncoming size={14} className="text-sky-500" />} tone="bg-sky-50/80 dark:bg-sky-500/10" />
          <AgentMetric label="Confirmed" value={perf?.confirmed ?? 0} icon={<CheckCircle size={14} className="text-emerald-500" />} tone="bg-emerald-50/80 dark:bg-emerald-500/10" />
          <AgentMetric label="Upsells" value={perf?.upsells ?? 0} icon={<Zap size={14} className="text-violet-500" />} tone="bg-violet-50/80 dark:bg-violet-500/10" />
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-4 pb-3">
          <AgentMetric label="In progress" value={perf?.pending ?? 0} icon={<Clock size={12} className="text-amber-500" />} tone="bg-amber-50/80 dark:bg-amber-500/10" />
          <AgentMetric label="Callbacks" value={perf?.callbacks ?? 0} icon={<RotateCcw size={12} className="text-violet-500" />} tone="bg-violet-50/80 dark:bg-violet-500/10" />
          <AgentMetric label="No answer" value={perf?.no_answer ?? 0} icon={<XCircle size={12} className="text-rose-500" />} tone="bg-rose-50/80 dark:bg-rose-500/10" />
          <AgentMetric label="Review" value={perf?.review ?? 0} icon={<CircleAlert size={12} className="text-orange-500" />} tone="bg-orange-50/80 dark:bg-orange-500/10" />
        </div>
      </> : <>
        <div className="grid grid-cols-2 gap-2 p-4">
          <AgentMetric label="Delivered" value={perf?.delivered ?? 0} icon={<CheckCircle size={14} className="text-emerald-500" />} tone="bg-emerald-50/80 dark:bg-emerald-500/10" />
          <AgentMetric label="In delivery" value={perf?.in_delivery ?? 0} icon={<Package size={14} className="text-sky-500" />} tone="bg-sky-50/80 dark:bg-sky-500/10" />
          <AgentMetric label="Returned" value={perf?.returned ?? 0} icon={<RotateCcw size={14} className="text-amber-500" />} tone="bg-amber-50/80 dark:bg-amber-500/10" />
          <AgentMetric label="Delivery rate" value={`${Math.round(deliveryRate)}%`} icon={<Target size={14} className="text-violet-500" />} tone="bg-violet-50/80 dark:bg-violet-500/10" />
        </div>
        <div className="px-4 pb-3 text-[10px] text-ink-muted">Shipping figures are based on the latest delivery and carrier status stored for this agent’s assigned orders.</div>
      </>}

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-[10px] dark:border-slate-700">
        <span className="flex items-center gap-1 text-slate-500"><Activity size={11} /> {perf?.recent_activity_count ?? 0} recent activity</span>
        <span className="font-semibold text-slate-700 group-hover:text-brand dark:text-slate-200">View details →</span>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Team() {
  const { workspace, profile, session } = useAuth();
  const { globalOrders, reloadGlobalOrders } = useGlobalOrders();
  const navigate = useNavigate();
  const {
    members, invitations, activityLog, performanceMap, loading,
    reload, updateMemberStatus, updateMemberRole, removeMember, assignOrder, autoAssignConfirmationOrders, setInvitations,
  } = useTeamData();

  const isOwner = profile?.role === "founder" || profile?.role === "owner";
  const isAdmin = isOwner || ["supervisor", "admin", "manager"].includes(profile?.role || "");

  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [callReviewAgentId, setCallReviewAgentId] = useState("");
  const [metricView, setMetricView] = useState<"confirmation" | "delivery">("confirmation");
  const [auditDay, setAuditDay] = useState<"today" | "yesterday">("today");

  useEffect(() => {
    if (!selectedMember) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedMember]);
  useEffect(() => {
    setSelectedMember((current) => current ? members.find((member) => member.id === current.id) ?? null : null);
  }, [members]);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", role: "agent" as TeamRole, allowedSections: ["Dashboard"] });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState("");

  // Assignment
  const [assignMode, setAssignMode] = useState<"manual" | "auto" | "roundrobin">("manual");
  const [assignLoadingId, setAssignLoadingId] = useState<string | null>(null);
  const [confirmationAssignmentMode, setConfirmationAssignmentMode] = useState<AssignmentMode>("shared");
  const [exclusiveRecipient, setExclusiveRecipient] = useState<"agent" | "whatsapp_automation">("agent");
  const [exclusiveAgentId, setExclusiveAgentId] = useState("");
  const [exclusiveQuantity, setExclusiveQuantity] = useState("20");
  const [exclusiveOrderIds, setExclusiveOrderIds] = useState<Set<string>>(new Set());
  const [memberRules, setMemberRules] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [paymentRuleName, setPaymentRuleName] = useState("Delivered-order commission");
  const [paymentRuleType, setPaymentRuleType] = useState("per_delivered_order");
  const [paymentRuleAmount, setPaymentRuleAmount] = useState("10");
  const [savingPaymentRule, setSavingPaymentRule] = useState(false);
  // Keep assignment on the exact same workspace-wide source as the Orders
  // page. A separate assignment query can drift or be filtered differently.
  const unassignedOrders = useMemo(() => globalOrders
    .filter((order) => !order.assigned_to && !exclusiveOrderIds.has(order.id) && isAssignableConfirmationOrder(order.status)), [globalOrders, exclusiveOrderIds]);

  const reloadExclusiveRecipients = async () => {
    if (!workspace?.id) return;
    const { data } = await supabase.from("order_confirmation_recipients").select("order_id").eq("workspace_id", workspace.id).is("released_at", null);
    setExclusiveOrderIds(new Set((data ?? []).map((row: any) => row.order_id)));
  };

  useEffect(() => {
    if (!workspace?.id || !isOwner) return;
    void Promise.all([loadAssignmentMode(workspace.id).then(setConfirmationAssignmentMode).catch(() => setConfirmationAssignmentMode("shared")), reloadExclusiveRecipients()]);
  }, [workspace?.id, isOwner]);

  useEffect(() => {
    if (!workspace?.id || !isOwner || !selectedMember?.id) { setMemberRules([]); return; }
    void supabase.from("agent_payment_rules").select("id,name,enabled").eq("workspace_id", workspace.id).eq("agent_id", selectedMember.id).order("created_at", { ascending: false }).then(({ data }) => setMemberRules((data ?? []) as typeof memberRules));
  }, [workspace?.id, isOwner, selectedMember?.id]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredMembers = members.filter(
    (m) => !search || m.full_name?.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalCalls = Object.values(performanceMap).reduce((sum, value) => sum + value.calls, 0);
  const totalCallSeconds = Object.values(performanceMap).reduce((sum, value) => sum + value.total_call_seconds, 0);
  const totalSessionSeconds = Object.values(performanceMap).reduce((sum, value) => sum + value.session_seconds, 0);
  const totalContacted = Object.values(performanceMap).reduce((sum, value) => sum + value.contacted, 0);
  const totalAssignedOrders = Object.values(performanceMap).reduce((sum, value) => sum + value.total_assigned, 0);
  const totalConfirmed = Object.values(performanceMap).reduce((s, p) => s + p.confirmed, 0);
  const teamConversionRate = totalAssignedOrders > 0 ? (totalConfirmed / totalAssignedOrders) * 100 : 0;
  const assignmentAgents = members.filter(canReceiveConfirmationWork);
  const pendingInvitationCount = invitations.filter((invitation: any) => invitation.status === "pending").length;
  const auditStart = auditDay === "today" ? localDayStart() : localDayStart(1);
  const auditEnd = auditDay === "today" ? Date.now() : localDayStart();
  const visibleActivityLog = activityLog.filter((entry) => {
    const at = new Date(entry.created_at).getTime();
    return at >= auditStart && at < auditEnd;
  });

  const leaderboard = [...members]
    .map(m => ({ member: m, perf: performanceMap[m.id] }))
    .sort((a, b) => (b.perf?.confirmation_rate ?? 0) - (a.perf?.confirmation_rate ?? 0));

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleInvite = async (delivery: "email" | "link") => {
    if (!inviteForm.email || !workspace?.id || !session?.user?.id) { toast.error("Fill in all fields."); return; }
    setInviteBusy(true);
    try {
      const allowedSections = inviteForm.role === "supervisor" ? ALL_ALLOWED_SECTIONS : normalizeAllowedSections(inviteForm.allowedSections);
      const { data, error } = await invokeInvitationFunction({
        action: "create",
        workspace_id: workspace.id,
        email: inviteForm.email,
        full_name: inviteForm.fullName,
        role: inviteForm.role,
        allowed_sections: allowedSections,
        delivery,
      });
      if (error || data?.error) throw new Error(await invitationFunctionError(error, data));
      if (delivery === "link") {
        if (!data?.invite_url) throw new Error("Invitation link was not returned");
        const inviteUrl = String(data.invite_url);
        setGeneratedInviteUrl(inviteUrl);
        await copyText(inviteUrl);
        toast.success("Invitation link copied.");
      } else {
        if (data?.invite_url) setGeneratedInviteUrl(String(data.invite_url));
        toast.success(data?.invitation?.resent ? "Invitation resent." : "Invitation email sent.");
      }
      reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to send invite");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRevokeInvitation = async (invitation: any) => {
    const { data, error } = await invokeInvitationFunction({ action: "revoke", workspace_id: workspace?.id, invitation_id: invitation.id });
    if (error || data?.error) { toast.error(await invitationFunctionError(error, data)); return; }
    setInvitations((current: any[]) => current.map((item) => item.id === invitation.id ? { ...item, status: "revoked", revoked_at: new Date().toISOString() } : item));
    toast.success("Invitation revoked.");
  };

  const handleDeleteInvitation = async (invitation: any) => {
    if (!confirm(`Delete the invitation for ${invitation.email}?`)) return;
    if (!workspace?.id) return;
    const { data, error } = await invokeInvitationFunction({ action: "delete", workspace_id: workspace.id, invitation_id: invitation.id });
    if (error || data?.error) {
      // Keep deletion working while an older deployed Edge Function is being
      // replaced. RLS still limits this fallback to workspace managers.
      const directDelete = await supabase
        .from("workspace_invitations")
        .delete()
        .eq("workspace_id", workspace.id)
        .eq("id", invitation.id);
      if (directDelete.error) {
        toast.error(await invitationFunctionError(error || directDelete.error, data));
        return;
      }
    }
    setInvitations((current: any[]) => current.filter((item) => item.id !== invitation.id));
    await reload();
    toast.success("Invitation deleted.");
  };

  const handleDeleteAllInvitations = async () => {
    if (!workspace?.id || invitations.length === 0) return;
    if (!confirm("Delete every invitation in this workspace? This removes pending, accepted, expired, and revoked invitation records.")) return;
    const { data, error } = await invokeInvitationFunction({ action: "delete_all", workspace_id: workspace.id });
    if (error || data?.error) {
      const directDelete = await supabase
        .from("workspace_invitations")
        .delete()
        .eq("workspace_id", workspace.id);
      if (directDelete.error) {
        toast.error(await invitationFunctionError(error || directDelete.error, data));
        return;
      }
    }
    setInvitations([]);
    await reload();
    toast.success("All invitations deleted.");
  };

  const handleResendInvitation = async (invitation: any) => {
    const { data, error } = await invokeInvitationFunction({ action: "create", workspace_id: workspace?.id, email: invitation.email, full_name: invitation.full_name || "", role: invitation.role, allowed_sections: invitation.allowed_sections, delivery: "email" });
    if (error || data?.error) toast.error(await invitationFunctionError(error, data));
    else { toast.success("Invitation resent."); reload(); }
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    try {
      await updateMemberRole(editingMember.id, editingMember.role, editingMember.allowed_sections);
      toast.success("Member updated.");
      setEditingMember(null);
    } catch (error: any) {
      toast.error(error?.message || "Member could not be updated.");
    }
  };

  const handleToggleStatus = async (m: TeamMember) => {
    if (m.is_owner) return;
    try {
      await updateMemberStatus(m.id, m.status !== "active");
      toast.success(m.status === "active" ? "Member suspended." : "Member activated.");
    } catch (error: any) {
      toast.error(error?.message || "Member status could not be changed.");
    }
  };

  const handleRemove = async (m: TeamMember) => {
    if (m.is_owner) return;
    if (!confirm(`Remove ${m.full_name || m.email} from the team?`)) return;
    try {
      await removeMember(m.id);
      if (selectedMember?.id === m.id) setSelectedMember(null);
      toast.success("Member removed.");
    } catch (error: any) {
      toast.error(error?.message || "Member could not be removed.");
    }
  };

  const handleAssignOrder = async (orderId: string, agentId: string) => {
    if (!workspace?.id) return;
    setAssignLoadingId(orderId);
    try {
      await assignOrder(orderId, agentId);
      toast.success("Order assigned.");
      await Promise.all([reload(), reloadGlobalOrders(true)]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign order.");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const handleAutoDistribute = async () => {
    if (!workspace?.id) return;
    if (!window.confirm(`Auto-assign available confirmation orders across ${assignmentAgents.length} eligible agents (up to 20 active orders per agent)?`)) return;
    setAssignLoadingId("auto");
    try {
      if (!assignmentAgents.length) throw new Error("Add an active agent with Confirmation access before assigning orders.");
      let result = await autoAssignConfirmationOrders(20);
      const hasAvailableSlot = assignmentAgents.some((member) =>
        (performanceMap[member.id]?.active_count ?? 0) < member.max_active_orders,
      );
      // The direct fallback keeps existing live workspaces usable until the
      // assignment RPC is available. It assigns in round-robin order, so two
      // agents get a 50/50 batch; as one completes orders, their free slot is
      // filled first on the next auto-distribute run.
      if (result?.assigned_count === undefined || (Number(result?.assigned_count ?? 0) === 0 && hasAvailableSlot && unassignedOrders.length > 0)) {
        const eligible = [...assignmentAgents]
          .sort((left, right) => (performanceMap[left.id]?.active_count ?? 0) - (performanceMap[right.id]?.active_count ?? 0));
        const slots = new Map(eligible.map((member) => [member.id, Math.max(0, Math.min(20, member.max_active_orders) - (performanceMap[member.id]?.active_count ?? 0))]));
        let assigned = 0;
        let cursor = 0;
        for (const order of unassignedOrders) {
          const nextAgent = Array.from(
            { length: eligible.length },
            (_, offset) => eligible[(cursor + offset) % eligible.length],
          ).find((member) => (slots.get(member.id) ?? 0) > 0);
          if (!nextAgent) break;
          const nextIndex = eligible.indexOf(nextAgent);
          await assignOrder(order.id, nextAgent.id);
          slots.set(nextAgent.id, (slots.get(nextAgent.id) ?? 1) - 1);
          cursor = (nextIndex + 1) % eligible.length;
          assigned += 1;
        }
        result = { assigned_count: assigned };
      }
      await reload();
      const assigned = Number(result?.assigned_count ?? 0);
      toast.success(assigned ? `${assigned} orders assigned fairly (up to 20 open orders per agent).` : "All eligible agents are at capacity or no unassigned confirmation orders remain.");
    } catch (error: any) {
      toast.error(error?.message || "Automatic assignment failed.");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const changeConfirmationAssignmentMode = async (mode: AssignmentMode) => {
    if (!workspace?.id || mode === confirmationAssignmentMode) return;
    if (!window.confirm(mode === "separated"
      ? "Switch to separated mode? New orders will have one exclusive recipient. Existing assignments stay unchanged until reconciled."
      : "Switch to shared mode? Active exclusive recipients must be reconciled first.")) return;
    try {
      await setAssignmentMode(workspace.id, mode);
      setConfirmationAssignmentMode(mode);
      toast.success(mode === "separated" ? "Separated assignment is now active." : "Shared assignment is now active.");
    } catch (error: any) { toast.error(error?.message || "Assignment mode could not be changed. Resolve current exclusive assignments first."); }
  };

  const reconcileToSharedMode = async () => {
    if (!workspace?.id || !confirm("Release the active separated recipients and return these orders to the shared queue? Assignment history and past commissions will be retained.")) return;
    try {
      const released = await reconcileSeparatedAssignments(workspace.id);
      setConfirmationAssignmentMode("shared"); await Promise.all([reload(), reloadGlobalOrders(true), reloadExclusiveRecipients()]);
      toast.success(`${released} separated recipients were released to the shared workflow.`);
    } catch (error: any) { toast.error(error?.message || "Assignment reconciliation could not be completed."); }
  };

  const handleExclusiveAssignment = async () => {
    if (!workspace?.id) return;
    const quantity = Math.max(0, Math.floor(Number(exclusiveQuantity)));
    if (!quantity) { toast.error("Enter how many eligible orders to assign."); return; }
    if (exclusiveRecipient === "agent" && !exclusiveAgentId) { toast.error("Choose an agent."); return; }
    if (!window.confirm(`Assign up to ${quantity} eligible orders to ${exclusiveRecipient === "agent" ? "the selected agent" : "WhatsApp Automation"}?`)) return;
    setAssignLoadingId("exclusive");
    try {
      const result = await assignConfirmationOrders(workspace.id, exclusiveRecipient, exclusiveRecipient === "agent" ? exclusiveAgentId : null, quantity);
      await Promise.all([reload(), reloadGlobalOrders(true), reloadExclusiveRecipients()]);
      toast.success(`${result.assigned_count} of ${result.requested_count} eligible orders assigned to ${exclusiveRecipient === "agent" ? "the agent" : "WhatsApp Automation"}.`);
    } catch (error: any) { toast.error(error?.message || "Exclusive assignment could not be completed."); }
    finally { setAssignLoadingId(null); }
  };

  const handleSavePaymentRule = async () => {
    if (!workspace?.id || !selectedMember?.id) return;
    const amount = Number(paymentRuleAmount);
    if (!paymentRuleName.trim() || !Number.isFinite(amount) || amount < 0) { toast.error("Enter a rule name and a valid amount."); return; }
    setSavingPaymentRule(true);
    try {
      await savePaymentRule(workspace.id, selectedMember.id, null, paymentRuleName, true, {
        rule_type: paymentRuleType, metric: paymentRuleType === "avg_answer_time_bonus" ? "avg_answer_seconds" : "order",
        operator: paymentRuleType === "avg_answer_time_bonus" ? "lt" : null, threshold: paymentRuleType === "avg_answer_time_bonus" ? 30 : null,
        minimum_sample_size: paymentRuleType === "avg_answer_time_bonus" ? 10 : 0, amount_type: paymentRuleType === "upsell" ? "percentage" : "fixed",
        amount, period: paymentRuleType === "fixed_salary" || paymentRuleType === "avg_answer_time_bonus" ? "invoice" : "order", effective_from: new Date().toISOString().slice(0, 10),
      });
      const { data } = await supabase.from("agent_payment_rules").select("id,name,enabled").eq("workspace_id", workspace.id).eq("agent_id", selectedMember.id).order("created_at", { ascending: false });
      setMemberRules((data ?? []) as typeof memberRules); toast.success("Payment rule version saved.");
    } catch (error: any) { toast.error(error?.message || "Payment rule could not be saved."); }
    finally { setSavingPaymentRule(false); }
  };

  // ────────────────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    ...(isAdmin ? [{ id: "invitations" as const, label: `Invitations${pendingInvitationCount ? ` (${pendingInvitationCount})` : ""}`, icon: <UserPlus size={14} /> }] : []),
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
          { label: "Avg handling time", value: formatDuration(totalCalls ? totalCallSeconds / totalCalls : 0), icon: <Timer size={16} />, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-500/10" },
          { label: "Avg session duration", value: formatDuration(members.length ? totalSessionSeconds / members.length : 0), icon: <Activity size={16} />, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-500/10" },
          { label: "Contacted (team)", value: totalContacted, icon: <PhoneIncoming size={16} />, color: "text-sky-500", bg: "bg-sky-50 dark:bg-sky-500/10" },
          { label: "Team conv. rate", value: `${Math.round(teamConversionRate)}%`, icon: <Target size={16} />, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full rounded-xl border border-base-border bg-base-raised py-2 pl-9 pr-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div className="inline-flex rounded-xl border border-base-border bg-base-raised p-1" aria-label="Team metric view">
              {(["confirmation", "delivery"] as const).map((view) => <button key={view} onClick={() => setMetricView(view)} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${metricView === view ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}>{view === "confirmation" ? "Confirmation" : "Delivery"}</button>)}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[450px] rounded-2xl bg-base-raised animate-pulse" />
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
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {filteredMembers.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  perf={performanceMap[m.id]}
                  onSelect={setSelectedMember}
                  metricView={metricView}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Invitations ──────────────────────────────────────────────── */}
      {tab === "invitations" && isAdmin && (
        <div className="overflow-hidden rounded-2xl border border-base-border bg-base-surface">
          <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
            <div>
              <h2 className="text-[14px] font-bold text-ink">Team invitations</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">Create, copy, resend, revoke, or permanently delete invitation links.</p>
            </div>
            <div className="flex items-center gap-2">
              {invitations.length > 0 && <button onClick={() => void handleDeleteAllInvitations()} className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2 text-[12px] font-semibold text-danger"><Trash2 size={14} /> Delete all</button>}
              <button onClick={() => { setGeneratedInviteUrl(""); setShowInviteModal(true); }} className="flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12px] font-semibold text-white"><UserPlus size={14} /> New invitation</button>
            </div>
          </div>
          {invitations.length === 0 ? (
            <div className="py-16"><EmptyState title="No invitations" description="Create an invitation link when you are ready to add an agent." compact /></div>
          ) : (
            <div className="divide-y divide-base-border">
              {invitations.map((inv: any) => (
                <div key={inv.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold text-ink">{inv.full_name || inv.email}</span><span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${inv.status === "accepted" ? "bg-emerald-500/10 text-emerald-600" : inv.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-base-raised text-ink-muted"}`}>{inv.status}</span></div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-muted">{inv.email} · {ROLE_LABELS[inv.role as TeamRole] || inv.role} · {Array.isArray(inv.allowed_sections) ? `${inv.allowed_sections.length} sections` : "Configured access"}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-faint"><CalendarClock size={11} /> Created {new Date(inv.created_at).toLocaleDateString()}{inv.status === "pending" && inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {inv.status === "pending" && <>
                      <button onClick={() => void copyText(`${window.location.origin}/invite?token=${encodeURIComponent(inv.id)}`).then(() => toast.success("Invitation link copied."))} aria-label={`Copy invitation link for ${inv.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11px] font-medium text-ink"><Copy size={12} /> Copy</button>
                      <button onClick={() => void handleResendInvitation(inv)} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11px] font-medium text-ink"><Send size={12} /> Resend</button>
                      <button onClick={() => void handleRevokeInvitation(inv)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-600"><X size={12} /> Revoke</button>
                    </>}
                    <button onClick={() => void handleDeleteInvitation(inv)} aria-label={`Delete invitation for ${inv.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/10 px-2.5 py-1.5 text-[11px] font-medium text-danger"><Trash2 size={12} /> Delete</button>
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
          {isOwner && <section className="rounded-2xl border border-brand/20 bg-brand/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-sm font-bold text-ink">Confirmation ownership</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">Separated mode gives each eligible order exactly one recipient: an agent or WhatsApp Automation. Shared mode preserves the existing team queue.</p></div>
              <div className="inline-flex rounded-xl border border-base-border bg-base-surface p-1">
                {(["shared", "separated"] as const).map((mode) => <button key={mode} onClick={() => void changeConfirmationAssignmentMode(mode)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${confirmationAssignmentMode === mode ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}>{mode === "shared" ? "Normal / Shared" : "Separated"}</button>)}
              </div>
            </div>
            {confirmationAssignmentMode === "separated" && <><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto] md:items-end">
              <label className="block text-xs font-semibold text-ink-muted">Recipient<select value={exclusiveRecipient} onChange={(event) => setExclusiveRecipient(event.target.value as "agent" | "whatsapp_automation")} className="mt-1.5 w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"><option value="agent">Human agent</option><option value="whatsapp_automation">WhatsApp Automation</option></select></label>
              {exclusiveRecipient === "agent" ? <label className="block text-xs font-semibold text-ink-muted">Agent<select value={exclusiveAgentId} onChange={(event) => setExclusiveAgentId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"><option value="">Choose agent…</option>{assignmentAgents.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label> : <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-700">WhatsApp Automation</div>}
              <label className="block text-xs font-semibold text-ink-muted">Orders<input value={exclusiveQuantity} onChange={(event) => setExclusiveQuantity(event.target.value)} inputMode="numeric" className="mt-1.5 w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink" /></label>
              <button onClick={() => void handleExclusiveAssignment()} disabled={assignLoadingId === "exclusive"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"><Target size={15} />{assignLoadingId === "exclusive" ? "Assigning…" : "Assign available"}</button>
            </div><button onClick={() => void reconcileToSharedMode()} className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-800">Reconcile active recipients and return to Normal / Shared mode</button></>}
          </section>}
          {/* Mode selector */}
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-base-border bg-base-surface/80">
            <span className="text-[13px] font-semibold text-ink">Distribution Mode:</span>
            <div className="flex max-w-full flex-wrap bg-base-raised/80 rounded-xl p-1 gap-1">
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
                   className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 px-3 py-2 text-[12.5px] font-medium hover:bg-emerald-500/25 md:ml-auto"
              >
                <Zap size={13} className={assignLoadingId === "auto" ? "animate-pulse" : ""} /> {assignLoadingId === "auto" ? "Assigning…" : "Auto-balance queue · Assign up to 20 / agent"}
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
                   <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                     <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink">#{order.order_number}</div>
                      <div className="text-[11px] text-ink-muted">{order.city || "—"} · {Number(order.total).toLocaleString()} MAD</div>
                    </div>
                    {assignMode === "manual" && (
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) handleAssignOrder(order.id, e.target.value); }}
                         className="min-h-11 max-w-full rounded-lg border border-base-border bg-base-raised px-2 py-1.5 text-[12px] text-ink focus:outline-none"
                        disabled={assignLoadingId === order.id}
                      >
                        <option value="">Assign to…</option>
                        {assignmentAgents.map(m => (
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
                {assignmentAgents.map(m => {
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
            <div className="ml-auto inline-flex rounded-lg border border-base-border bg-base-raised p-0.5">
              {(["today", "yesterday"] as const).map((day) => <button key={day} onClick={() => setAuditDay(day)} className={`rounded-md px-2.5 py-1 text-[10.5px] font-semibold capitalize ${auditDay === day ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}>{day}</button>)}
            </div>
          </div>
          {visibleActivityLog.length === 0 ? (
            <div className="py-16">
              <EmptyState title={`No activity ${auditDay}`} description="Order opens, assignments, calls, status updates, shipping updates, and upsells appear here with their actual time." />
            </div>
          ) : (
            <div className="divide-y divide-base-border/50 max-h-[600px] overflow-y-auto">
              {visibleActivityLog.map(entry => {
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
          initialAgentId={callReviewAgentId}
          agents={members.map((member) => ({
            id: member.id,
            fullName: member.full_name || member.email || "Agent",
            avatarUrl: member.avatar_url,
            role: member.role,
          }))}
          onOpenOrder={(orderId) => navigate(`/confirmation?order=${encodeURIComponent(orderId)}`)}
        />
      )}

      {selectedMember && createPortal(
        <div className="app-modal-backdrop fixed inset-0 flex justify-end bg-slate-950/55 backdrop-blur-[2px]" onClick={() => setSelectedMember(null)} role="dialog" aria-modal="true" aria-label="Member profile">
          <div
            className="h-dvh w-full max-w-[1180px] overflow-y-auto overscroll-contain border-l border-base-border bg-base-surface pb-[env(safe-area-inset-bottom)] shadow-[-24px_0_80px_-28px_rgba(2,6,23,0.65)] animate-in slide-in-from-right duration-200 dark:shadow-[-28px_0_90px_-28px_rgba(0,0,0,0.9)] max-sm:max-w-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-border bg-base-surface/95 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm">
              <span className="text-[14px] font-bold text-ink">Member Profile</span>
              <button onClick={() => setSelectedMember(null)} aria-label="Close member profile" className="grid h-10 w-10 place-items-center rounded-xl border border-transparent bg-base-raised/70 text-ink-muted transition-colors hover:border-base-border hover:text-ink"><X size={16} /></button>
            </div>

            {/* The full agent dashboard uses the same visual language as the overview. */}
            <div className="border-b border-base-border bg-slate-50/60 p-4 dark:bg-slate-950/20">
              <MemberCard member={selectedMember} perf={performanceMap[selectedMember.id]} onSelect={() => undefined} metricView={metricView} />
              <div className="mt-3 flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-3 py-2.5">
                <div className="flex items-center gap-2"><RoleBadge role={selectedMember.role} /><span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${STATUS_CONFIG[selectedMember.agent_status]?.color ?? "text-ink-faint"}`}><StatusDot status={selectedMember.agent_status} /> {STATUS_CONFIG[selectedMember.agent_status]?.label}</span></div>
                <div className="flex items-center gap-1.5"><Award size={14} className={RANK_COLORS[selectedMember.rank] ?? "text-amber-600"} /><span className={`text-[11px] font-bold ${RANK_COLORS[selectedMember.rank] ?? "text-amber-600"}`}>{selectedMember.rank}</span><span className="text-[10px] text-ink-faint">· {selectedMember.xp} XP</span></div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5">
                <span className="text-[11px] font-medium text-ink-muted">Revenue generated</span>
                <span className="font-mono text-[13px] font-bold text-ink">{Number(performanceMap[selectedMember.id]?.revenue_generated ?? 0).toLocaleString()} MAD</span>
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

            {isOwner && !selectedMember.is_owner && (
              <div className="border-b border-base-border px-5 py-4">
                <div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Agent payment</div><p className="mt-1 text-[11px] leading-5 text-ink-muted">Founder-only compensation rules. Each save creates a version, so issued invoices keep their historical rate.</p></div><BadgeDollarSign size={17} className="text-brand" /></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{memberRules.length ? memberRules.map((rule) => <span key={rule.id} className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${rule.enabled ? "bg-emerald-500/10 text-emerald-700" : "bg-base-raised text-ink-muted"}`}>{rule.name}</span>) : <span className="text-[11px] text-ink-faint">No payment rules configured.</span>}</div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3"><input value={paymentRuleName} onChange={(event) => setPaymentRuleName(event.target.value)} placeholder="Rule name" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-xs text-ink" /><select value={paymentRuleType} onChange={(event) => setPaymentRuleType(event.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-xs text-ink"><option value="per_delivered_order">Per delivered order</option><option value="per_confirmed_order">Per confirmed order</option><option value="upsell">Upsell percentage</option><option value="avg_answer_time_bonus">Answer-time bonus</option><option value="fixed_salary">Fixed salary</option></select><input value={paymentRuleAmount} onChange={(event) => setPaymentRuleAmount(event.target.value)} inputMode="decimal" placeholder="MAD" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-xs text-ink" /></div>
                <button onClick={() => void handleSavePaymentRule()} disabled={savingPaymentRule} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"><BadgeDollarSign size={14} />{savingPaymentRule ? "Saving…" : "Save payment rule version"}</button>
              </div>
            )}

            {/* Manager-visible live route and consented call status */}
            {isAdmin && (
              <div className="border-b border-base-border px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Live agent activity</div>
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-muted"><StatusDot status={selectedMember.agent_status} /> {selectedMember.agent_status === "offline" ? "Last known" : "Live"}</span>
                </div>
                <div className="rounded-xl border border-base-border bg-base-raised/60 p-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><MonitorUp size={14} className="text-brand" /> {selectedMember.current_page || "No active page reported"}</div>
                  {selectedMember.current_path && <div className="mt-1 truncate font-mono text-[10.5px] text-ink-muted">{selectedMember.current_path}</div>}
                  {selectedMember.current_path?.startsWith("/") && !selectedMember.current_path.startsWith("//") && (
                    <button onClick={() => { navigate(selectedMember.current_path!); setSelectedMember(null); }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/15"><MonitorUp size={12} /> Open this page</button>
                  )}
                </div>
                <div className={`mt-2 flex items-center gap-2 rounded-xl border p-3 text-[11.5px] ${selectedMember.active_call ? "border-danger/25 bg-danger/5 text-danger" : "border-base-border bg-base-raised/40 text-ink-muted"}`}>
                  <Mic size={14} className={selectedMember.active_call ? "animate-pulse" : ""} />
                  {selectedMember.active_call ? "Agent is making a visible, permitted microphone recording now." : "No permitted microphone recording is active."}
                </div>
                <div className="mt-3 space-y-2">
                  {activityLog.filter((entry) => entry.profile_id === selectedMember.id).slice(0, 6).map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate text-ink">{entry.entity_label || entry.page || entry.action.replace(/_/g, " ")}</span>
                      <span className="shrink-0 text-ink-faint">{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setCallReviewAgentId(selectedMember.id); setTab("callreview"); setSelectedMember(null); }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-[12px] font-semibold text-violet-500 hover:bg-violet-500/15"
                >
                  <Headphones size={14} /> Open consented call recordings
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Page presence is operational activity. Microphone audio is never opened silently; recordings only exist after the agent grants browser permission and starts recording.</p>
              </div>
            )}

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
        </div>,
        document.body,
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
        <Modal title="Invite Team Member" onClose={() => { setShowInviteModal(false); setGeneratedInviteUrl(""); }}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Full Name</label>
              <input
                value={inviteForm.fullName}
                onChange={e => { setGeneratedInviteUrl(""); setInviteForm({ ...inviteForm, fullName: e.target.value }); }}
                placeholder="Sara El Idrissi"
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Email *</label>
              <input
                value={inviteForm.email}
                onChange={e => { setGeneratedInviteUrl(""); setInviteForm({ ...inviteForm, email: e.target.value }); }}
                placeholder="sara@yourstore.ma"
                type="email"
                className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Role</label>
              <select
                value={inviteForm.role}
                onChange={e => { setGeneratedInviteUrl(""); setInviteForm({ ...inviteForm, role: e.target.value as TeamRole, allowedSections: e.target.value === "supervisor" ? ALL_ALLOWED_SECTIONS : inviteForm.allowedSections }); }}
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
                          setGeneratedInviteUrl("");
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
            {generatedInviteUrl && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-emerald-600"><CheckCircle size={14} /> Invitation link ready</div>
                <div className="flex gap-2">
                  <input readOnly value={generatedInviteUrl} aria-label="Generated invitation link" className="min-w-0 flex-1 rounded-lg border border-base-border bg-base-surface px-3 py-2 font-mono text-[10.5px] text-ink" />
                  <button onClick={() => void copyText(generatedInviteUrl).then(() => toast.success("Invitation link copied."))} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white"><Copy size={13} /> Copy</button>
                </div>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => void handleInvite("email")}
                disabled={inviteBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
              >
                <Send size={14} /> {inviteBusy ? "Working…" : "Send by email"}
              </button>
              <button
                onClick={() => void handleInvite("link")}
                disabled={inviteBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand/25 bg-brand/10 py-2.5 text-[13px] font-medium text-brand hover:bg-brand/15 disabled:opacity-60"
              >
                <Link2 size={14} /> {inviteBusy ? "Working…" : "Create & copy link"}
              </button>
            </div>
            <p className="text-[10.5px] leading-relaxed text-ink-muted">The invitee joins this workspace and uses its subscription. They are not sent to a separate payment flow.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
