import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { normalizeAllowedSections } from "../lib/rbac";
import { normalizeStatus as normalizeShippingStatus } from "../utils/status";
import { normalizeStatusOrNull } from "../lib/statusEngine";

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
    current_path: string | null;
    current_page: string | null;
    active_call: boolean;
    active_call_started_at: string | null;
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
    contacted: number;
    callbacks: number;
    review: number;
    delivery_rate: number;
    calls: number;
    total_call_seconds: number;
    session_seconds: number;
    recent_activity_count: number;
    avg_response_seconds: number | null;
    delivered: number;
    in_delivery: number;
    returned: number;
    upsells: number;
}

function startOfLocalDay(daysAgo = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
}

function isOpenConfirmationStatus(status: string | null | undefined) {
    return ["new", "pending", "scheduled", "busy", "no_answer", "unreachable", "wrong_number"].includes(
        String(normalizeStatusOrNull(status ?? "") ?? "").toLowerCase(),
    );
}

export function useTeamData() {
    const { workspace, session } = useAuth();
    const wid = workspace?.id ?? null;

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [invitations, setInvitations] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<OrderAssignment[]>([]);
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
    const [performanceMap, setPerformanceMap] = useState<Record<string, MemberPerformance>>({});
    const [loading, setLoading] = useState(true);
    const channelRef = useRef<any>(null);
    const loadVersionRef = useRef(0);

    const load = useCallback(async (wid: string) => {
        const loadVersion = ++loadVersionRef.current;
        setLoading(true);
        try {
            // Membership is the source of truth. A profile can belong to several
            // workspaces, so filtering profiles.workspace_id hides valid invitees.
            const workspaceMembersRes = await supabase
                .from("profile_workspaces")
                .select("profile_id, is_owner, role, status, created_at")
                .eq("workspace_id", wid)
                .eq("status", "active");
            if (workspaceMembersRes.error) throw workspaceMembersRes.error;
            const workspaceMembersData = workspaceMembersRes.data ?? [];
            const memberProfileIds = workspaceMembersData.map((membership: any) => membership.profile_id);

            const profilesQuery = supabase
                .from("profiles")
                .select("id, full_name, role, workspace_id, allowed_sections, created_at, email, is_active, last_login_at, avatar_url")
                .order("created_at", { ascending: false });

            const yesterdayStart = startOfLocalDay(1);
            const [profilesRes, extRes, presenceRes, invitesRes, assignmentsRes, logRes, ordersRes, activitiesRes, recordingsRes, callbacksRes] = await Promise.all([
                memberProfileIds.length > 0 ? profilesQuery.in("id", memberProfileIds) : profilesQuery.eq("id", "00000000-0000-0000-0000-000000000000"),
                supabase
                    .from("team_member_profiles")
                    .select("*")
                    .eq("workspace_id", wid),
                supabase
                    .from("agent_presence")
                    .select("profile_id, status, last_heartbeat, current_path, current_page, active_call, active_call_started_at")
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
                    .limit(5000),
                supabase
                    .from("member_activity_log")
                    .select("*")
                    .eq("workspace_id", wid)
                    .gte("created_at", yesterdayStart)
                    .order("created_at", { ascending: false })
                    .limit(5000),
                supabase
                    .from("orders")
                    .select('"Order ID", status, delivery_status, shipping_status, total, assigned_to, created_at, is_upsell')
                    .eq("workspace_id", wid)
                    .not("assigned_to", "is", null),
                supabase
                    .from("confirmation_activities")
                    .select("order_id, agent_id, activity_type, created_at")
                    .eq("workspace_id", wid)
                    .order("created_at", { ascending: true })
                    .limit(10000),
                supabase
                    .from("confirmation_call_recordings")
                    .select("agent_id, duration_seconds")
                    .eq("workspace_id", wid)
                    .limit(10000),
                supabase
                    .from("confirmation_callbacks")
                    .select("agent_id, status")
                    .eq("workspace_id", wid)
                    .limit(10000),
            ]);

            // A delete/revoke can trigger a reload while the initial load is
            // still in flight. Never let that older response restore stale
            // invitations (or any other team state) over the newest request.
            if (loadVersion !== loadVersionRef.current) return;

            const profileData = profilesRes.data ?? [];
            const extData = extRes.data ?? [];
            const extMap = new Map(extData.map((e: any) => [e.profile_id, e]));
            const presenceMap = new Map((presenceRes.data ?? []).map((presence: any) => [presence.profile_id, presence]));
            const workspaceMembersMap = new Map(workspaceMembersData.map((wm: any) => [wm.profile_id, wm]));

            const merged: TeamMember[] = profileData.map((p: any) => {
                const ext = extMap.get(p.id) as any;
                const presence = presenceMap.get(p.id) as any;
                const workspaceMember = workspaceMembersMap.get(p.id) as any;
                const heartbeatAt = presence?.last_heartbeat ? new Date(presence.last_heartbeat).getTime() : 0;
                const heartbeatIsFresh = heartbeatAt > Date.now() - 2 * 60_000;
                return {
                    id: p.id,
                    profile_id: p.id,
                    workspace_id: wid,
                    auth_user_id: p.id,
                    full_name: p.full_name,
                    email: p.email ?? "",
                    role: workspaceMember?.role || p.role || "agent", // Use profile_workspaces role first, fallback to profiles.role
                    status: p.is_active === false ? "disabled" : "active",
                    allowed_sections: normalizeAllowedSections(p.allowed_sections ?? []),
                    joined_at: workspaceMember?.created_at ?? p.created_at,
                    created_at: p.created_at,
                    is_owner: workspaceMember?.is_owner || false, // From profile_workspaces
                    phone: ext?.phone ?? null,
                    department: ext?.department ?? null,
                    avatar_url: ext?.avatar_url ?? p.avatar_url ?? null, // Use extension avatar first, fallback to profile avatar
                    agent_status: heartbeatIsFresh ? (presence?.status ?? ext?.agent_status ?? "online") : "offline",
                    shift: ext?.shift ?? "morning",
                    daily_limit: ext?.daily_limit ?? 80,
                    max_active_orders: ext?.max_active_orders ?? 30,
                    xp: ext?.xp ?? 0,
                    rank: ext?.rank ?? "Bronze",
                    last_seen_at: presence?.last_heartbeat ?? ext?.last_seen_at ?? p.last_login_at ?? null,
                    current_path: presence?.current_path ?? null,
                    current_page: presence?.current_page ?? null,
                    active_call: heartbeatIsFresh && presence?.active_call === true,
                    active_call_started_at: presence?.active_call_started_at ?? null,
                };
            });

            setMembers(merged);
            setInvitations(invitesRes.data ?? []);
            setAssignments(assignmentsRes.data ?? []);
            setActivityLog(logRes.data ?? []);

            // Compute each metric from persisted assignments, order outcomes and
            // actual CRM actions. No card value is manufactured from UI state.
            let orders: Array<Record<string, any>> = ordersRes.data ?? [];
            // is_upsell is additive. Older databases should still show the
            // real assignment metrics instead of turning every card into zero.
            if (ordersRes.error) {
                const { data: legacyOrders, error: legacyOrdersError } = await supabase
                    .from("orders")
                    .select('"Order ID", status, delivery_status, shipping_status, total, assigned_to, created_at')
                    .eq("workspace_id", wid)
                    .not("assigned_to", "is", null);
                if (legacyOrdersError) throw legacyOrdersError;
                orders = legacyOrders ?? [];
            }
            const logs = logRes.data ?? [];
            const activities = activitiesRes.data ?? [];
            const recordings = recordingsRes.data ?? [];
            const callbacksRows = callbacksRes.data ?? [];
            const perfMap: Record<string, MemberPerformance> = {};

            for (const m of merged) {
                const myOrders = orders.filter((o: any) => o.assigned_to === m.id);
                const confirmationStatuses = myOrders.map((o: any) => normalizeStatusOrNull(o.status));
                const shippingStatuses = myOrders.map((o: any) => normalizeShippingStatus(o.shipping_status || o.delivery_status || ""));
                const confirmed = confirmationStatuses.filter((status) => status === "confirmed" || status === "shipped" || status === "delivered").length;
                const delivered = shippingStatuses.filter((status) => status === "DELIVERED").length;
                const cancelled = confirmationStatuses.filter((status) => status === "cancelled" || status === "returned" || status === "refused").length;
                const noAnswer = confirmationStatuses.filter((status) => status === "no_answer" || status === "unreachable" || status === "wrong_number").length;
                const refused = confirmationStatuses.filter((status) => status === "refused" || status === "blacklisted" || status === "duplicate").length;
                const callbacks = confirmationStatuses.filter((status) => status === "scheduled" || status === "busy").length;
                const contacted = confirmationStatuses.filter((status) => status !== null && status !== "new" && status !== "pending").length;
                const review = confirmationStatuses.filter((status) => status === "cancelled" || status === "refused" || status === "blacklisted" || status === "duplicate" || status === "out_of_stock").length;
                const revenue = myOrders
                    .filter((o: any) => normalizeShippingStatus(o.shipping_status || o.delivery_status || "") === "DELIVERED")
                    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
                const active = myOrders.filter((o: any) => isOpenConfirmationStatus(o.status)).length;
                const memberLogs = logs.filter((entry: any) => entry.profile_id === m.id);
                const memberActivities = activities.filter((entry: any) => entry.agent_id === m.id);
                const calls = memberActivities.filter((entry: any) => entry.activity_type === "CALL_STARTED").length;
                const memberRecordings = recordings.filter((entry: any) => entry.agent_id === m.id);
                const recordedCallSeconds = memberRecordings.reduce((sum: number, entry: any) => sum + Math.max(0, Number(entry.duration_seconds || 0)), 0);
                const memberCallbacks = callbacksRows.filter((entry: any) => entry.agent_id === m.id && entry.status === "scheduled").length;
                const firstCallByOrder = new Map<string, number>();
                for (const entry of memberActivities) {
                    if (entry.activity_type !== "CALL_STARTED") continue;
                    const at = new Date(entry.created_at).getTime();
                    if (!Number.isFinite(at)) continue;
                    const previous = firstCallByOrder.get(entry.order_id);
                    if (previous === undefined || at < previous) firstCallByOrder.set(entry.order_id, at);
                }
                const responseSeconds = myOrders
                    .map((order: any) => {
                        const orderId = order["Order ID"];
                        const calledAt = firstCallByOrder.get(orderId);
                        const createdAt = new Date(order.created_at).getTime();
                        return calledAt !== undefined && Number.isFinite(createdAt) && calledAt >= createdAt ? Math.floor((calledAt - createdAt) / 1000) : null;
                    })
                    .filter((value: number | null): value is number => value !== null);
                const deliveryPopulation = delivered + shippingStatuses.filter((status) => status === "COMING_BACK").length;
                const currentCallSeconds = m.active_call && m.active_call_started_at
                    ? Math.max(0, Math.floor((Date.now() - new Date(m.active_call_started_at).getTime()) / 1000))
                    : 0;
                const todayLogs = memberLogs.filter((entry: any) => entry.created_at >= startOfLocalDay());
                const trackedSessionSeconds = todayLogs.length > 1
                    ? Math.max(0, Math.floor((new Date(todayLogs[0].created_at).getTime() - new Date(todayLogs[todayLogs.length - 1].created_at).getTime()) / 1000))
                    : 0;
                const inDelivery = shippingStatuses.filter((status) => ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)).length;
                const returned = shippingStatuses.filter((status) => status === "COMING_BACK").length;

                perfMap[m.id] = {
                    member_id: m.id,
                    total_assigned: myOrders.length,
                    confirmed,
                    cancelled,
                    no_answer: noAnswer,
                    refused,
                    pending: active,
                    confirmation_rate: myOrders.length > 0 ? (confirmed / myOrders.length) * 100 : 0,
                    revenue_generated: revenue,
                    avg_daily_orders: 0,
                    active_count: active,
                    contacted,
                    callbacks: memberCallbacks || callbacks,
                    review,
                    delivery_rate: deliveryPopulation > 0 ? (delivered / deliveryPopulation) * 100 : 0,
                    calls,
                    total_call_seconds: recordedCallSeconds + currentCallSeconds,
                    session_seconds: trackedSessionSeconds,
                    recent_activity_count: memberLogs.length,
                    avg_response_seconds: responseSeconds.length ? Math.round(responseSeconds.reduce((sum, value) => sum + value, 0) / responseSeconds.length) : null,
                    delivered,
                    in_delivery: inDelivery,
                    returned,
                    upsells: myOrders.filter((order: any) => order.is_upsell === true).length,
                };
            }

            setPerformanceMap(perfMap);
        } catch (e) {
            if (loadVersion !== loadVersionRef.current) return;
            console.error("[useTeamData] load error:", e);
        } finally {
            if (loadVersion === loadVersionRef.current) setLoading(false);
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
            .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "confirmation_activities", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "member_activity_log", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .on("postgres_changes", { event: "*", schema: "public", table: "agent_presence", filter: `workspace_id=eq.${wid}` }, () => load(wid))
            .subscribe();

        channelRef.current = ch;
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [wid, load]);

    const updateMemberStatus = useCallback(async (profileId: string, isActive: boolean) => {
        if (!wid) throw new Error("Workspace is not available");
        const { error } = await supabase.rpc("manage_workspace_team_member", {
            p_workspace_id: wid,
            p_profile_id: profileId,
            p_action: "set_status",
            p_role: null,
            p_allowed_sections: null,
            p_is_active: isActive,
        });
        if (error) throw error;
        setMembers(prev => prev.map(m => m.id === profileId ? { ...m, status: isActive ? "active" : "disabled" } : m));
    }, [wid]);

    const updateMemberRole = useCallback(async (profileId: string, role: string, sections: string[]) => {
        if (!wid) throw new Error("Workspace is not available");
        const normalizedSections = normalizeAllowedSections(sections);
        const { error } = await supabase.rpc("manage_workspace_team_member", {
            p_workspace_id: wid,
            p_profile_id: profileId,
            p_action: "update",
            p_role: role,
            p_allowed_sections: normalizedSections,
            p_is_active: null,
        });
        if (error) throw error;
        setMembers(prev => prev.map(m => m.id === profileId ? { ...m, role, allowed_sections: normalizedSections } : m));
    }, [wid]);

    const removeMember = useCallback(async (profileId: string) => {
        if (!wid) throw new Error("Workspace is not available");
        const { error } = await supabase.rpc("manage_workspace_team_member", {
            p_workspace_id: wid,
            p_profile_id: profileId,
            p_action: "remove",
            p_role: null,
            p_allowed_sections: null,
            p_is_active: null,
        });
        if (error) throw error;
        setMembers(prev => prev.filter(m => m.id !== profileId));
    }, [wid]);

    const isAssignmentRpcUnavailable = (error: any) => {
        const message = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
        return error?.code === "PGRST202" || error?.code === "42883" || message.includes("could not find the function") || message.includes("schema cache");
    };

    const assignOrder = useCallback(async (orderId: string, assignedTo: string) => {
        if (!wid) throw new Error("Workspace is not available");
        // The live orders schema uses the quoted "Order ID" key. Never query
        // a synthetic orders.id column: imported YouCan orders do not have it.
        const { data: order, error: lookupError } = await supabase
            .from("orders")
            .select('"Order ID"')
            .eq("workspace_id", wid)
            .eq("Order ID", orderId)
            .maybeSingle();
        if (lookupError) throw lookupError;
        const canonicalOrderId = (order as any)?.["Order ID"];
        if (!canonicalOrderId) throw new Error("The selected order is no longer available in this workspace.");
        const { error } = await supabase.rpc("assign_team_orders_v1", {
            p_workspace_id: wid,
            p_order_ids: [canonicalOrderId],
            p_assigned_to: assignedTo,
        });
        if (!error) return;
        if (!isAssignmentRpcUnavailable(error)) throw error;

        // Compatibility for databases that have not received the new RPC yet.
        // This writes both sources of truth so assigned agents can see orders
        // immediately, while the migration keeps future assignments atomic.
        const { data: updatedOrder, error: updateError } = await supabase
            .from("orders")
            .update({ assigned_to: assignedTo })
            .eq("workspace_id", wid)
            .eq("Order ID", canonicalOrderId)
            .select('"Order ID"')
            .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedOrder) throw new Error("This order could not be assigned. Please refresh the workspace and try again.");
        const { error: historyError } = await supabase
            .from("order_assignments")
            .insert({
                workspace_id: wid,
                order_id: canonicalOrderId,
                assigned_to: assignedTo,
                assigned_by: session?.user?.id ?? null,
                result: "pending",
            });
        if (historyError) throw historyError;
    }, [wid, session?.user?.id]);

    const autoAssignConfirmationOrders = useCallback(async (perAgentLimit = 20) => {
        if (!wid) throw new Error("Workspace is not available");
        const { data, error } = await supabase.rpc("auto_assign_confirmation_orders_v1", {
            p_workspace_id: wid,
            p_per_agent_limit: perAgentLimit,
        });
        if (error) {
            if (isAssignmentRpcUnavailable(error)) return null;
            throw error;
        }
        return data as { assigned_count?: number } | null;
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
        autoAssignConfirmationOrders,
        updateAgentStatus,
        setInvitations,
    };
}
