import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { normalizeAllowedSections } from "../lib/rbac";
import { normalizeStatus } from "../utils/status";

export interface TeamMember {
    id: string;
    profile_id: string;
    workspace_id: string;
    auth_user_id: string | null;
    full_name: string | null;
    email: string;
    role: string;
    status: "active" | "disabled" | "pending";
    allowed_sections: string[];
    joined_at: string | null;
    created_at: string;
    is_owner: boolean; // From profile_workspaces
    // extended
    phone: string | null;
    department: string | null;
    avatar_url: string | null;
    agent_status: "online" | "offline" | "busy" | "break" | "lunch" | "vacation" | "idle";
    shift: string;
    daily_limit: number;
    max_active_orders: number;
    xp: number;
    rank: string;
    last_seen_at: string | null;
}

export interface OrderAssignment {
    id: string;
    order_id: string;
    assigned_to: string;
    assigned_by: string | null;
    assigned_at: string;
    completed_at: string | null;
    result: string | null;
}

export interface ActivityLogEntry {
    id: string;
    profile_id: string;
    action: string;
    entity_type: string | null;
    entity_label: string | null;
    old_value: string | null;
    new_value: string | null;
    page: string | null;
    created_at: string;
}

export interface MemberPerformance {
    member_id: string;
    total_assigned: number;
    confirmed: number;
    cancelled: number;
    no_answer: number;
    refused: number;
    pending: number;
    confirmation_rate: number;
    revenue_generated: number;
    avg_daily_orders: number;
    active_count: number;
}

export function useTeamData() {
    const { workspace } = useAuth();
    const wid = workspace?.id ?? null;

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [invitations, setInvitations] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<OrderAssignment[]>([]);
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
    const [performanceMap, setPerformanceMap] = useState<Record<string, MemberPerformance>>({});
    const [loading, setLoading] = useState(true);
    const channelRef = useRef<any>(null);

    const load = useCallback(async (wid: string) => {
        setLoading(true);
        try {
            // Load members (profiles + profile_workspaces + extended)
            const [profilesRes, workspaceMembersRes, extRes, invitesRes, assignmentsRes, logRes, ordersRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, full_name, role, workspace_id, allowed_sections, created_at, email, is_active, last_login_at, avatar_url")
                    .eq("workspace_id", wid)
                    .order("created_at", { ascending: false }),
                supabase
                    .from("profile_workspaces")
                    .select("profile_id, is_owner, role, status")
                    .eq("workspace_id", wid)
                    .eq("status", "active"),
                supabase
                    .from("team_member_profiles")
                    .select("*")
                    .eq("workspace_id", wid),
                supabase
                    .from("workspace_invitations")
                    .select("*")
                    .eq("workspace_id", wid)
                    .order("created_at", { ascending: false }),
                supabase
                    .from("order_assignments")
                    .select("*")
                    .eq("workspace_id", wid)
                    .order("assigned_at", { ascending: false })
                    .limit(500),
                supabase
                    .from("member_activity_log")
                    .select("*")
                    .eq("workspace_id", wid)
                    .order("created_at", { ascending: false })
                    .limit(200),
                supabase
                    .from("orders")
                    .select("id, status, delivery_status, shipping_status, total, assigned_to")
                    .eq("workspace_id", wid)
                    .not("assigned_to", "is", null),
            ]);

            const profileData = profilesRes.data ?? [];
            const workspaceMembersData = workspaceMembersRes.data ?? [];
            const extData = extRes.data ?? [];
            const extMap = new Map(extData.map((e: any) => [e.profile_id, e]));
            const workspaceMembersMap = new Map(workspaceMembersData.map((wm: any) => [wm.profile_id, wm]));

            const merged: TeamMember[] = profileData.map((p: any) => {
                const ext = extMap.get(p.id) as any;
                const workspaceMember = workspaceMembersMap.get(p.id) as any;
                return {
                    id: p.id,
                    profile_id: p.id,
                    workspace_id: p.workspace_id,
                    auth_user_id: p.id,
                    full_name: p.full_name,
                    email: p.email ?? "",
                    role: workspaceMember?.role || p.role || "agent", // Use profile_workspaces role first, fallback to profiles.role
                    status: p.is_active === false ? "disabled" : "active",
                    allowed_sections: normalizeAllowedSections(p.allowed_sections ?? []),
                    joined_at: p.created_at,
                    created_at: p.created_at,
                    is_owner: workspaceMember?.is_owner || false, // From profile_workspaces
                    phone: ext?.phone ?? null,
                    department: ext?.department ?? null,
                    avatar_url: ext?.avatar_url ?? p.avatar_url ?? null, // Use extension avatar first, fallback to profile avatar
                    agent_status: ext?.agent_status ?? "offline",
                    shift: ext?.shift ?? "morning",
                    daily_limit: ext?.daily_limit ?? 80,
                    max_active_orders: ext?.max_active_orders ?? 30,
                    xp: ext?.xp ?? 0,
                    rank: ext?.rank ?? "Bronze",
                    last_seen_at: ext?.last_seen_at ?? p.last_login_at ?? null,
                };
            });

            setMembers(merged);
            setInvitations(invitesRes.data ?? []);
            setAssignments(assignmentsRes.data ?? []);
            setActivityLog(logRes.data ?? []);

            // Compute performance from real order data
            const orders = ordersRes.data ?? [];
            const perfMap: Record<string, MemberPerformance> = {};

            for (const m of merged) {
                const myOrders = orders.filter((o: any) => o.assigned_to === m.id);
                const confirmed = myOrders.filter((o: any) => normalizeStatus(o.shipping_status || o.delivery_status || o.status) === 'DELIVERED').length;
                const cancelled = myOrders.filter((o: any) => normalizeStatus(o.shipping_status || o.delivery_status || o.status) === 'COMING_BACK').length;
                const revenue = myOrders
                    .filter((o: any) => normalizeStatus(o.shipping_status || o.delivery_status || o.status) === 'DELIVERED')
                    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
                const active = myOrders.filter((o: any) => {
                    const ns = normalizeStatus(o.shipping_status || o.delivery_status || o.status);
                    return ns === 'CONFIRMED' || ns === 'OUT_FOR_DELIVERY' || ns === 'NEW';
                }).length;

                perfMap[m.id] = {
                    member_id: m.id,
                    total_assigned: myOrders.length,
                    confirmed,
                    cancelled,
                    no_answer: 0,
                    refused: 0,
                    pending: active,
                    confirmation_rate: myOrders.length > 0 ? (confirmed / myOrders.length) * 100 : 0,
                    revenue_generated: revenue,
                    avg_daily_orders: 0,
                    active_count: active,
                };
            }

            setPerformanceMap(perfMap);
        } catch (e) {
            console.error("[useTeamData] load error:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!wid) {
            setMembers([]);
            setLoading(false);
            return;
        }

        load(wid);

        // Realtime for agent presence
        const uniq = Math.random().toString(36).substring(2, 8);
        const ch = supabase.channel(`team-rt-${wid}-${uniq}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "profile_workspaces", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "order_assignments", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "agent_presence", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .subscribe();

        channelRef.current = ch;
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [wid, load]);

    const updateMemberStatus = useCallback(async (profileId: string, isActive: boolean) => {
        await supabase.from("profiles").update({ is_active: isActive }).eq("id", profileId);
        setMembers(prev => prev.map(m => m.id === profileId ? { ...m, status: isActive ? "active" : "disabled" } : m));
    }, []);

    const updateMemberRole = useCallback(async (profileId: string, role: string, sections: string[]) => {
        await supabase.from("profiles").update({ role, allowed_sections: sections }).eq("id", profileId);
        setMembers(prev => prev.map(m => m.id === profileId ? { ...m, role, allowed_sections: sections } : m));
    }, []);

    const removeMember = useCallback(async (profileId: string) => {
        // Remove from profile_workspaces instead of setting workspace_id to null
        await supabase.from("profile_workspaces").delete().eq("profile_id", profileId).eq("workspace_id", wid);
        setMembers(prev => prev.filter(m => m.id !== profileId));
    }, [wid]);

    const assignOrder = useCallback(async (orderId: string, assignedTo: string, assignedBy: string) => {
        if (!wid) return;
        await supabase.from("order_assignments").insert({
            workspace_id: wid,
            order_id: orderId,
            assigned_to: assignedTo,
            assigned_by: assignedBy,
            result: "pending",
        });
    }, [wid]);

    const updateAgentStatus = useCallback(async (profileId: string, status: string) => {
        if (!wid) return;
        await supabase.from("agent_presence").upsert({
            profile_id: profileId,
            workspace_id: wid,
            status,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: "profile_id" });
        setMembers(prev => prev.map(m => m.id === profileId ? { ...m, agent_status: status as any } : m));
    }, [wid]);

    return {
        members,
        invitations,
        assignments,
        activityLog,
        performanceMap,
        loading,
        reload: () => wid ? load(wid) : undefined,
        updateMemberStatus,
        updateMemberRole,
        removeMember,
        assignOrder,
        updateAgentStatus,
        setInvitations,
    };
}
