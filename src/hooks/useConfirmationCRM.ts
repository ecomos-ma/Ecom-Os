import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { normalizeStatus, STATUS_SORT_ORDER, type CanonicalStatus } from "../lib/statusEngine";
import {
  addConfirmationActivity,
  getConfirmationAgents,
  getConfirmationOrderById,
  getConfirmationOrders,
  getConfirmationSummary,
  updateConfirmationStatus,
} from "../services/confirmationCrmService";
import type {
  ConfirmationAgent,
  ConfirmationOrder,
  ConfirmationOrderFilters,
  ConfirmationSummary,
} from "../pages/confirmation/types";

export type ConfirmationQueue = "all" | "my" | "unassigned" | "callback_due" | "recent";
export type ConfirmationDatePreset = "today" | "yesterday" | "month" | "all";

export type ConfirmationAgentMetric = {
  agent: ConfirmationAgent;
  summary: ConfirmationSummary;
};

const PAGE_SIZE = 60;

function isOwnerView(role: string | null | undefined) {
  return ["founder", "owner", "admin", "supervisor", "manager"].includes(role || "");
}

function dateRange(preset: ConfirmationDatePreset) {
  const now = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (preset === "all") return { from: null, to: null };
  if (preset === "today") {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (preset === "yesterday") {
    const end = startOfDay(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function useConfirmationCRM() {
  const { workspace, profile, session } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const userId = session?.user?.id ?? profile?.id ?? null;
  const canManage = isOwnerView(profile?.role);

  const [orders, setOrders] = useState<ConfirmationOrder[]>([]);
  const [summary, setSummary] = useState<ConfirmationSummary | null>(null);
  const [agents, setAgents] = useState<ConfirmationAgent[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<ConfirmationAgentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CanonicalStatus>("all");
  const [queue, setQueue] = useState<ConfirmationQueue>("all");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<ConfirmationDatePreset>("all");
  const inFlight = useRef(false);
  const loadVersion = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const scopeAgentId = canManage ? null : userId;
  const statusRawValues = useMemo(() => {
    if (status === "all" || !summary) return undefined;
    return Object.keys(summary.statusCounts).filter((rawStatus) => normalizeStatus(rawStatus) === status);
  }, [status, summary]);
  const range = useMemo(() => dateRange(datePreset), [datePreset]);

  const load = useCallback(async (options: { append?: boolean; silent?: boolean } = {}) => {
    if (!workspaceId || !userId || inFlight.current) return;
    inFlight.current = true;
    const version = ++loadVersion.current;
    if (!options.silent) options.append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const nextPage = options.append ? page + 1 : 0;
      const filters: ConfirmationOrderFilters = {
        page: nextPage,
        pageSize: PAGE_SIZE,
        rawStatuses: statusRawValues,
        search,
        assignedAgentId: canManage ? assigneeId : null,
        myAgentId: !canManage || queue === "my" ? userId : null,
        queue,
        dateFrom: range.from,
        dateTo: range.to,
      };
      const baseSummaryAgent = !canManage ? userId : null;
      const [summaryResult, ordersResult, agentsResult] = await Promise.all([
        getConfirmationSummary(workspaceId, baseSummaryAgent),
        getConfirmationOrders(workspaceId, filters),
        canManage ? getConfirmationAgents(workspaceId) : Promise.resolve([] as ConfirmationAgent[]),
      ]);
      if (version !== loadVersion.current) return;
      setSummary(summaryResult);
      setAgents(agentsResult);
      setOrders((current) => options.append ? [...current, ...ordersResult.orders] : ordersResult.orders);
      setTotal(ordersResult.total);
      setPage(nextPage);

      if (canManage && agentsResult.length) {
        const metrics = await Promise.all(
          agentsResult.slice(0, 24).map(async (agent) => ({
            agent,
            summary: await getConfirmationSummary(workspaceId, agent.id),
          }))
        );
        if (version === loadVersion.current) setAgentMetrics(metrics);
      } else if (!canManage) {
        setAgentMetrics([]);
      }
    } catch (loadError: any) {
      if (version === loadVersion.current) {
        setError(loadError?.message || "Could not load Confirmation CRM.");
        if (!options.append) setOrders([]);
      }
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      inFlight.current = false;
    }
  }, [workspaceId, userId, page, statusRawValues, search, canManage, assigneeId, queue, range.from, range.to]);

  useEffect(() => {
    setPage(0);
    setOrders([]);
    void load();
  }, [workspaceId, userId, status, search, assigneeId, queue, datePreset, canManage]);

  useEffect(() => {
    if (!workspaceId) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load({ silent: true }), 450);
    };
    const channel = supabase
      .channel(`confirmation-crm-${workspaceId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `workspace_id=eq.${workspaceId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_assignments", filter: `workspace_id=eq.${workspaceId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "confirmation_activities", filter: `workspace_id=eq.${workspaceId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "confirmation_callbacks", filter: `workspace_id=eq.${workspaceId}` }, schedule)
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, load]);

  const refresh = useCallback(() => load(), [load]);
  const loadMore = useCallback(() => load({ append: true }), [load]);

  const updateStatus = useCallback(async (order: ConfirmationOrder, nextStatus: string) => {
    const previous = order.status;
    setOrders((current) => current.map((item) => item.id === order.id ? {
      ...item,
      status: nextStatus,
      confirmedAt: nextStatus === "confirmed" ? new Date().toISOString() : item.confirmedAt,
      cancelledAt: nextStatus === "cancelled" ? new Date().toISOString() : item.cancelledAt,
    } : item));
    try {
      await updateConfirmationStatus(workspaceId!, order, nextStatus, userId);
      void load({ silent: true });
    } catch (mutationError) {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: previous } : item));
      throw mutationError;
    }
  }, [workspaceId, userId, load]);

  const openOrder = useCallback(async (order: ConfirmationOrder) => {
    if (!workspaceId || !userId) return;
    try {
      await addConfirmationActivity(workspaceId, order, userId, "ORDER_OPENED");
    } catch {
      // An audit event must never prevent the agent from opening a valid order.
    }
  }, [workspaceId, userId]);

  const findOrder = useCallback(async (orderId: string) => {
    const existing = orders.find((order) => order.id === orderId);
    if (existing) return existing;
    if (!workspaceId) return null;
    return getConfirmationOrderById(workspaceId, orderId);
  }, [orders, workspaceId]);

  const visibleStatusFilters = useMemo(() => {
    const counts = new Map<CanonicalStatus, number>();
    Object.entries(summary?.statusCounts ?? {}).forEach(([rawStatus, count]) => {
      const canonical = normalizeStatus(rawStatus);
      counts.set(canonical, (counts.get(canonical) ?? 0) + Number(count));
    });
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => (STATUS_SORT_ORDER[a] ?? 999) - (STATUS_SORT_ORDER[b] ?? 999))
      .map(([id, count]) => ({ id, count }));
  }, [summary]);

  return {
    workspaceId,
    userId,
    canManage,
    orders,
    summary,
    agents,
    agentMetrics,
    total,
    loading,
    loadingMore,
    error,
    hasMore: orders.length < total,
    searchInput,
    setSearchInput,
    status,
    setStatus,
    visibleStatusFilters,
    queue,
    setQueue,
    assigneeId,
    setAssigneeId,
    datePreset,
    setDatePreset,
    refresh,
    loadMore,
    updateStatus,
    openOrder,
    findOrder,
  };
}
