import { supabase } from "../lib/supabase";

export interface MetaLegacyConnection {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  status: string;
  token_checked_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_error: string | null;
}

export interface MetaLegacyStatus {
  connected: boolean;
  state: string;
  connection: MetaLegacyConnection | null;
}

export interface MetaLegacyCampaign {
  id: string;
  meta_campaign_id: string;
  campaign_name: string;
  status: string;
  budget: number | null;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number;
  cost_per_result: number;
  synced_at: string;
}

export interface MetaLegacyDailySpend {
  date: string;
  amount: number;
}

export interface MetaLegacyReport {
  connected: boolean;
  spend: number;
  results: number;
  currency: string | null;
  since: string | null;
  until: string | null;
  daily: MetaLegacyDailySpend[];
}

export interface MetaLegacyCreative {
  creative_id: string;
  ad_id: string;
  ad_name: string;
  title: string | null;
  body: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  video_url: string | null;
  video_permalink_url: string | null;
  destination_urls: string[];
}

export interface MetaLegacyCampaignDetail {
  campaign: {
    id: string;
    name: string;
  };
  creatives: MetaLegacyCreative[];
  destination_urls: string[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("meta-legacy", {
    body,
  });
  if (error) {
    let message = error.message || "Legacy Meta request failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload?.error === "string" && payload.error.trim()) {
          message = payload.error.trim();
        }
      } catch {
        // Keep the safe transport message when the response is not JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const metaLegacyService = {
  status: () => invoke<MetaLegacyStatus>({ action: "status" }),
  connect: (adAccountId: string, accessToken: string) =>
    invoke<MetaLegacyStatus>({
      action: "connect",
      ad_account_id: adAccountId,
      access_token: accessToken,
    }),
  sync: (input: {
    datePreset: string;
    since?: string;
    until?: string;
  }) =>
    invoke<{ success: boolean; synced: number; last_sync_at: string }>({
      action: "sync",
      date_preset: input.datePreset,
      since: input.since,
      until: input.until,
    }),
  report: (input: {
    datePreset?: string;
    since?: string;
    until?: string;
  }) =>
    invoke<MetaLegacyReport>({
      action: "report",
      date_preset: input.datePreset,
      since: input.since,
      until: input.until,
    }),
  campaignDetail: (campaignId: string) =>
    invoke<MetaLegacyCampaignDetail>({
      action: "campaign_detail",
      campaign_id: campaignId,
    }),
  disconnect: () =>
    invoke<{ success: boolean; connected: boolean }>({ action: "disconnect" }),
};
