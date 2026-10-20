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
  type ConfirmationUpsellItemChange,
  updateConfirmationStatus,
} from "../services/confirmationCrmService";
import type {
  ConfirmationAgent,
  ConfirmationOrder,
  ConfirmationOrderFilters,
  ConfirmationSummary,
  ConfirmationWorkLease,
} from "../pages/confirmation/types";

export type ConfirmationQueue = "all" | "my" | "unassigned" | "callback_due" | "recent";
export type ConfirmationDatePreset = "today" | "yesterday" | "month" | "all";

export type ConfirmationAgentMetric = {
  agent: ConfirmationAgent;
  summary: ConfirmationSummary;
};

const PAGE_SIZE = 60;
const CACHE_AGE_MS = 10 * 60_000;
const orderCache = new Map<string, { orders: ConfirmationOrder[]; total: number; savedAt: number }>();
const summaryCache = new Map<string, { summary: ConfirmationSummary; savedAt: number }>();
const agentsCache = new Map<string, { agents: ConfirmationAgent[]; savedAt: number }>();
const metricsCache = new Map<string, { metrics: ConfirmationAgentMetric[]; savedAt: number }>();
const metricsInFlight = new Map<string, Promise<ConfirmationAgentMetric[]>>();

function cacheValue<T extends { savedAt: number }>(cache: Map<string, T>, key: string, maxAgeMs = CACHE_AGE_MS): T | null {
  const value = cache.get(key);
  if (!value) return null;
  if (Date.now() - value.savedAt > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return value;
}

function orderCacheKey(workspaceId: string | null, userId: string | null, canManage: boolean, status: string, queue: string, search: string, assigneeId: string | null, datePreset: string) {
  return JSON.stringify([workspaceId, userId, canManage, status, queue, search, assigneeId, datePreset]);
}

function updateCachedOrder(workspaceId: string, userId: string, orderId: string, change: { status: string; total: number; updatedAt: string }) {
  for (const [key, entry] of orderCache) {
    const [cacheWorkspace, cacheUser, , cacheStatus] = JSON.parse(key) as [string, string, boolean, string];
    if (cacheWorkspace !== workspaceId || cacheUser !== userId || !entry.orders.some((order) => order.id === orderId)) continue;
    const belongs = cacheStatus === "all" || cacheStatus === normalizeStatus(change.status);
    orderCache.set(key, {
      orders: belongs
        ? entry.orders.map((order) => order.id === orderId ? { ...order, ...change } : order)
        : entry.orders.filter((order) => order.id !== orderId),
      total: belongs ? entry.total : Math.max(0, entry.total - 1),
      savedAt: entry.savedAt,
    });
  }
}

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

  const summaryKey = `${workspaceId}:${userId}:${canManage ? "manager" : "agent"}`;
  const initialOrderKey = orderCacheKey(workspaceId, userId, canManage, "pending", "all", "", null, "all");
  const [orders, setOrders] = useState<ConfirmationOrder[]>(() => cacheValue(orderCache, initialOrderKey)?.orders ?? []);
  const [summary, setSummary] = useState<ConfirmationSummary | null>(() => cacheValue(summaryCache, summaryKey)?.summary ?? null);
  const [agents, setAgents] = useState<ConfirmationAgent[]>(() => cacheValue(agentsCache, workspaceId ?? "")?.agents ?? []);
  const [agentMetrics, setAgentMetrics] = useState<ConfirmationAgentMetric[]>(() => cacheValue(metricsCache, summaryKey, 30_000)?.metrics ?? []);
  const [loading, setLoading] = useState(() => !cacheValue(orderCache, initialOrderKey));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<"all" | CanonicalStatus>("pending");
  const [queue, setQueue] = useState<ConfirmationQueue>("all");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<ConfirmationDatePreset>("all");
  const appendInFlight = useRef(false);
  const loadVersion = useRef(0);
  const inFlightKeys = useRef(new Map<string, number>());

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const scopeAgentId = canManage ? null : userId;
  const statusRawValues = useMemo(() => {
    if (status === "all") return undefined;
    if (!summary) return [status];
    const matching = Object.keys(summary.statusCounts).filter((rawStatus) => normalizeStatus(rawStatus) === status);
    return matching.length ? matching : [status];
  }, [status, summary]);
  const range = useMemo(() => dateRange(datePreset), [datePreset]);

  const setStatus = useCallback((nextStatus: "all" | CanonicalStatus) => {
    if (nextStatus === status) return;
    loadVersion.current += 1;
    const key = orderCacheKey(workspaceId, userId, canManage, nextStatus, queue, search, assigneeId, datePreset);
    const cached = cacheValue(orderCache, key);
    setOrders(cached?.orders ?? []);
    setTotal(cached?.total ?? 0);
    setPage(0);
    setLoading(!cached);
    setStatusState(nextStatus);
  }, [status, workspaceId, userId, canManage, queue, search, assigneeId, datePreset]);

  const load = useCallback(async (options: { append?: boolean; silent?: boolean } = {}) => {
    if (!workspaceId || !userId || (options.append && appendInFlight.current)) return;
    const key = orderCacheKey(workspaceId, userId, canManage, status, queue, search, assigneeId, datePreset);
    if (!options.append && inFlightKeys.current.get(key) === loadVersion.current) return;
    if (options.append) appendInFlight.current = true;
    const version = ++loadVersion.current;
    if (!options.append) inFlightKeys.current.set(key, version);
    if (!options.silent) options.append ? setLoadingMore(true) : setLoading(!cacheValue(orderCache, key));
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
      const cachedSummary = cacheValue(summaryCache, summaryKey);
      if (cachedSummary && version === loadVersion.current) setSummary(cachedSummary.summary);
      const summaryPromise = getConfirmationSummary(workspaceId, baseSummaryAgent).then((value) => {
        summaryCache.set(summaryKey, { summary: value, savedAt: Date.now() });
        if (version === loadVersion.current) setSummary(value);
      }).catch(() => undefined);
      const cachedAgents = cacheValue(agentsCache, workspaceId);
      if (cachedAgents && version === loadVersion.current) setAgents(cachedAgents.agents);
      const agentsPromise = canManage && !cachedAgents
        ? getConfirmationAgents(workspaceId).then((value) => {
          agentsCache.set(workspaceId, { agents: value, savedAt: Date.now() });
          if (version === loadVersion.current) setAgents(value);
          return value;
        }).catch(() => [] as ConfirmationAgent[])
        : Promise.resolve(cachedAgents?.agents ?? []);
      const ordersResult = await getConfirmationOrders(workspaceId, filters, options.append || cacheValue(orderCache, key) ? undefined : (base) => {
        orderCache.set(key, { ...base, savedAt: Date.now() });
        if (version !== loadVersion.current) return;
        setOrders(base.orders);
        setTotal(base.total);
        setLoading(false);
      });
      if (version !== loadVersion.current) return;
      setOrders((current) => {
        const next = options.append ? [...current, ...ordersResult.orders] : ordersResult.orders;
        orderCache.set(key, { orders: next, total: ordersResult.total, savedAt: Date.now() });
        if (orderCache.size > 30) orderCache.delete(orderCache.keys().next().value!);
        return next;
      });
      setTotal(ordersResult.total);
      setPage(nextPage);
      void summaryPromise;
      void agentsPromise.then(async (agentsResult) => {
        if (!canManage || !agentsResult.length || cacheValue(metricsCache, summaryKey, 30_000)) return;
        let work = metricsInFlight.get(summaryKey);
        if (!work) {
          work = Promise.all(agentsResult.slice(0, 24).map(async (agent) => ({
            agent, summary: await getConfirmationSummary(workspaceId, agent.id),
          }))).then((metrics) => {
            metricsCache.set(summaryKey, { metrics, savedAt: Date.now() });
            return metrics;
          }).finally(() => metricsInFlight.delete(summaryKey));
          metricsInFlight.set(summaryKey, work);
        }
        const metrics = await work;
        if (version === loadVersion.current) setAgentMetrics(metrics);
      }).catch(() => undefined);
    } catch (loadError: any) {
      if (version === loadVersion.current) {
        setError(loadError?.message || "Could not load Confirmation CRM.");
        if (!options.append && !cacheValue(orderCache, key)) setOrders([]);
      }
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      if (options.append) appendInFlight.current = false;
      else if (inFlightKeys.current.get(key) === version) inFlightKeys.current.delete(key);
    }
  }, [workspaceId, userId, page, statusRawValues, status, search, canManage, assigneeId, queue, datePreset, range.from, range.to, summaryKey]);

  useEffect(() => {
    setSummary(cacheValue(summaryCache, summaryKey)?.summary ?? null);
    setAgents(cacheValue(agentsCache, workspaceId ?? "")?.agents ?? []);
    setAgentMetrics(cacheValue(metricsCache, summaryKey, 30_000)?.metrics ?? []);
  }, [workspaceId, userId, canManage, summaryKey]);

  useEffect(() => {
    setPage(0);
    const key = orderCacheKey(workspaceId, userId, canManage, status, queue, search, assigneeId, datePreset);
    const cached = cacheValue(orderCache, key);
    setOrders(cached?.orders ?? []);
    setTotal(cached?.total ?? 0);
    setLoading(!cached);
    void load();
  }, [workspaceId, userId, status, search, assigneeId, queue, datePreset, canManage]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!workspaceId) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRef.current({ silent: true }), 450);
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
  }, [workspaceId]);

  const refresh = useCallback(() => load(), [load]);
  const loadMore = useCallback(() => load({ append: true }), [load]);

  const updateStatus = useCallback(async (
    order: ConfirmationOrder,
    nextStatus: string,
    options?: {
      lease?: ConfirmationWorkLease | null;
      claimNext?: boolean;
      isUpsell?: boolean;
      total?: number;
      items?: ConfirmationUpsellItemChange[];
    },
  ) => {
    try {
      const result = await updateConfirmationStatus(workspaceId!, order, nextStatus, userId, {
        ...options,
        accessToken: session?.access_token,
      });
      setOrders((current) => current.map((item) => item.id === order.id ? {
        ...item,
        status: result.status,
        total: result.total,
        updatedAt: result.updatedAt,
      } : item).filter((item) => status === "all" || normalizeStatus(item.status) === status));
      updateCachedOrder(workspaceId!, userId!, order.id, result);
      const currentKey = orderCacheKey(workspaceId, userId, canManage, status, queue, search, assigneeId, datePreset);
      const currentCache = cacheValue(orderCache, currentKey);
      if (currentCache) setTotal(currentCache.total);
      metricsCache.delete(summaryKey);
      void load({ silent: true });
      return result;
    } catch (mutationError) {
      throw mutationError;
    }
  }, [workspaceId, userId, session?.access_token, load, summaryKey, status, canManage, queue, search, assigneeId, datePreset]);

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
