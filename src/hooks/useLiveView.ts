import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  canReadAllOrders,
  fetchLiveViewSnapshot,
  requestRecentIpResolution,
  subscribeToLiveView,
  type LiveOrderEvent,
  type LiveViewFilters,
  type LiveViewSnapshot,
  type LiveWindow,
} from "../services/liveViewService";

const EMPTY: LiveViewSnapshot = {
  generated_at: new Date(0).toISOString(), orders: 0, revenue_by_currency: {}, events: [],
  top_cities: [], top_products: [], top_sources: [], top_campaigns: [], top_workspaces: [], options: {},
};

export function useLiveView(workspaceId?: string) {
  const [timeWindow, setWindow] = useState<LiveWindow>("15m");
  const [filters, setFilters] = useState<LiveViewFilters>({});
  const [adminGlobal, setAdminGlobal] = useState(false);
  const [canGlobal, setCanGlobal] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveViewSnapshot>(EMPTY);
  const [newEvents, setNewEvents] = useState<LiveOrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState("CONNECTING");
  const refreshTimer = useRef<number | null>(null);
  const bootedAt = useRef(Date.now());
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async (quiet = false) => {
    if (!workspaceId) return;
    if (!quiet) setLoading(true);
    try {
      const data = await fetchLiveViewSnapshot(workspaceId, timeWindow, filters, adminGlobal);
      setSnapshot(data);
      setError(null);
      data.events.forEach((event) => seen.current.add(event.order_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live activity could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [adminGlobal, filters, timeWindow, workspaceId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(true), 350);
  }, [refresh]);

  useEffect(() => { void canReadAllOrders().then(setCanGlobal); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!workspaceId || adminGlobal) return;
    const timer = window.setTimeout(() => void requestRecentIpResolution(workspaceId), 900);
    return () => window.clearTimeout(timer);
  }, [adminGlobal, workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    bootedAt.current = Date.now();
    const channel = subscribeToLiveView(workspaceId, adminGlobal, (event) => {
      const eventTime = Date.parse(event.occurred_at);
      if (eventTime < bootedAt.current - 5000 || seen.current.has(event.order_id)) return;
      seen.current.add(event.order_id);
      setNewEvents((current) => [event, ...current].slice(0, 30));
    }, scheduleRefresh, setConnection);
    const reconcile = window.setInterval(() => void refresh(true), 60_000);
    return () => {
      window.clearInterval(reconcile);
      void supabase.removeChannel(channel);
    };
  }, [adminGlobal, refresh, scheduleRefresh, workspaceId]);
  useEffect(() => () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); }, []);

  const online = connection === "SUBSCRIBED" && navigator.onLine;
  return useMemo(() => ({
    snapshot, newEvents, loading, error, online, connection, window: timeWindow, setWindow,
    filters, setFilters, adminGlobal, setAdminGlobal, canGlobal, refresh,
  }), [adminGlobal, canGlobal, connection, error, filters, loading, newEvents, online, refresh, snapshot, timeWindow]);
}
