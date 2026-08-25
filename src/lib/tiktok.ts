import { supabase } from "./supabase";

export type TikTokConnectionState = "not_connected" | "configuration_required" | "connecting" | "pending_account_selection" | "connected" | "syncing" | "sync_failed" | "reauth_required" | "disconnected";

export interface TikTokAdAccount {
  id: string;
  advertiser_id: string;
  advertiser_name: string;
  currency: string | null;
  timezone: string | null;
  is_enabled: boolean;
  reporting_sync_status: string;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_error: string | null;
}

export interface TikTokIntegrationStatus {
  state: TikTokConnectionState;
  connection: null | {
    id: string;
    status: TikTokConnectionState;
    auto_sync_enabled: boolean;
    last_sync_at: string | null;
    last_successful_sync_at: string | null;
    last_sync_error: string | null;
    token_expires_at: string | null;
    created_at: string;
  };
  ad_accounts: TikTokAdAccount[];
  events_api: null | {
    enabled: boolean;
    event_source_id: string | null;
    has_access_token: boolean;
    has_test_event_code: boolean;
    last_event_sent_at: string | null;
    last_successful_event_at: string | null;
    last_error: string | null;
  };
}

export interface TikTokInsight {
  id: string;
  advertiser_id: string;
  reporting_level: "advertiser" | "campaign" | "adgroup" | "ad";
  entity_id: string;
  report_date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  destination_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cost_per_conversion: number;
  video_views: number;
  video_watched_2s: number;
  video_watched_6s: number;
  video_views_p25: number;
  video_views_p50: number;
  video_views_p75: number;
  video_views_p100: number;
  average_video_play: number | null;
  currency: string | null;
}

export async function getTikTokStatus(workspaceId: string): Promise<TikTokIntegrationStatus> {
  const { data, error } = await supabase.rpc("get_tiktok_integration_status", { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as TikTokIntegrationStatus;
}

export async function invokeTikTok<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (payload.error) throw new Error(String(payload.error));
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError;
      }
    }
    throw new Error(error.message || "TikTok request failed");
  }
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}
