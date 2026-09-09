import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type LiveWindow = "live" | "1m" | "5m" | "15m" | "1h" | "today";
export type LiveViewFilters = Partial<Record<"status" | "source" | "product" | "city" | "campaign" | "country" | "workspace_id", string>>;

export type LiveOrderEvent = {
  order_id: string;
  workspace_id: string;
  workspace_name?: string | null;
  occurred_at: string;
  status: string;
  total: number;
  currency: string | null;
  source: string | null;
  product_name: string | null;
  campaign: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_source: "ip" | "city" | "provider_city" | "region" | "country" | "unknown";
  geo_confidence: "high" | "medium" | "low";
};

export type RankedMetric = { label: string; orders: number; revenue: number; workspace_id?: string };
export type LiveViewCity = { id: number; canonical_name: string; country_code: string };
export type LiveViewSnapshot = {
  generated_at: string;
  orders: number;
  revenue_by_currency: Record<string, number>;
  events: LiveOrderEvent[];
  top_cities: RankedMetric[];
  top_products: RankedMetric[];
  top_sources: RankedMetric[];
  top_campaigns: RankedMetric[];
  top_workspaces: RankedMetric[];
  options: Record<string, Array<string | { id: string; name: string }>>;
};

export async function canReadAllOrders(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_platform_permission", { p_permission_key: "orders.read_all" });
  return !error && data === true;
}

export async function fetchLiveViewSnapshot(
  workspaceId: string,
  window: LiveWindow,
  filters: LiveViewFilters,
  adminGlobal: boolean,
): Promise<LiveViewSnapshot> {
  const { data, error } = await supabase.rpc("get_live_view_snapshot_v1", {
    p_workspace_id: workspaceId,
    p_window: window,
    p_filters: filters,
    p_admin_global: adminGlobal,
  });
  if (error) throw new Error("Live activity could not be loaded.");
  return data as LiveViewSnapshot;
}

export function subscribeToLiveView(
  workspaceId: string,
  adminGlobal: boolean,
  onInsert: (event: LiveOrderEvent) => void,
  onChange: () => void,
  onStatus: (status: string) => void,
): RealtimeChannel {
  const channel = supabase.channel(`live-view:${adminGlobal ? "global" : workspaceId}:${crypto.randomUUID()}`);
  const config = adminGlobal
    ? { event: "*" as const, schema: "public", table: "live_view_events" }
    : { event: "*" as const, schema: "public", table: "live_view_events", filter: `workspace_id=eq.${workspaceId}` };
  channel.on("postgres_changes", config, (payload) => {
    if (payload.eventType === "INSERT") onInsert(payload.new as LiveOrderEvent);
    onChange();
  });
  channel.subscribe((status) => onStatus(status));
  return channel;
}

export async function requestRecentIpResolution(workspaceId: string): Promise<void> {
  await supabase.functions.invoke("live-view-geolocate", {
    body: { workspace_id: workspaceId, limit: 12 },
  });
}

export async function fetchLiveViewCities(): Promise<LiveViewCity[]> {
  const { data, error } = await supabase.from("live_view_city_catalog")
    .select("id,canonical_name,country_code").order("canonical_name").limit(500);
  if (error) throw new Error("Location catalog could not be loaded.");
  return (data ?? []) as LiveViewCity[];
}

export async function saveLiveViewCityAlias(workspaceId: string, alias: string, cityId: number): Promise<void> {
  const { error } = await supabase.rpc("upsert_live_view_city_alias_v1", {
    p_workspace_id: workspaceId, p_alias: alias, p_city_id: cityId,
  });
  if (error) throw new Error("Location mapping could not be saved.");
}
