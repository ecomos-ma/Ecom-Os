import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  TikTokError,
  asArray,
  asNumber,
  asObject,
  asString,
  dateRangeInTimeZone,
  decryptSecret,
  fetchTikTokPages,
  sanitizeText,
} from "./tiktok.ts";

interface ConnectionRow {
  id: string;
  workspace_id: string;
  access_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string;
  auto_sync_enabled: boolean;
}

interface AccountRow {
  id: string;
  connection_id: string;
  advertiser_id: string;
  currency: string | null;
  timezone: string | null;
}

interface SyncOptions {
  startDate?: string;
  endDate?: string;
  days?: number;
}

interface SyncAccountResult {
  connection_id: string;
  advertiser_id: string;
  success: boolean;
  campaigns: number;
  adgroups: number;
  ads: number;
  insights: number;
  error?: string;
  error_category?: TikTokError["category"];
}

function listRows(data: Record<string, unknown>): Record<string, unknown>[] {
  return asArray(data.list).map(asObject);
}

function pageInfo(data: Record<string, unknown>) {
  return asObject(data.page_info);
}

async function upsertBatches(client: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await client.from(table).upsert(rows.slice(offset, offset + 500), { onConflict });
    if (error) throw new TikTokError(`Database upsert failed for ${table}`, "temporary", 500, true);
  }
}

async function fetchEntities(path: string, token: string, advertiserId: string, fields: string[]): Promise<Record<string, unknown>[]> {
  return fetchTikTokPages(path, token, { advertiser_id: advertiserId, fields }, (data) => ({
    rows: listRows(data),
    pageInfo: pageInfo(data),
  }));
}

function optionalTimestamp(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function creativeUrl(ad: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(ad[key]);
    if (/^https:\/\//i.test(value)) return value;
  }
  return null;
}

async function syncMetadata(
  client: SupabaseClient,
  workspaceId: string,
  account: AccountRow,
  token: string,
): Promise<{ campaigns: number; adgroups: number; ads: number }> {
  const advertiserId = account.advertiser_id;
  const [campaigns, adgroups, ads] = await Promise.all([
    fetchEntities("/campaign/get/", token, advertiserId, ["campaign_id", "campaign_name", "operation_status", "objective_type", "budget", "budget_mode", "create_time", "modify_time"]),
    fetchEntities("/adgroup/get/", token, advertiserId, ["campaign_id", "adgroup_id", "adgroup_name", "operation_status", "placements", "optimization_goal", "bid_type", "budget", "budget_mode", "create_time", "modify_time"]),
    fetchEntities("/ad/get/", token, advertiserId, ["campaign_id", "adgroup_id", "ad_id", "ad_name", "operation_status", "creative_type", "image_ids", "video_id", "tiktok_item_id", "create_time", "modify_time"]),
  ]);
  const now = new Date().toISOString();
  const campaignRows = campaigns.map((campaign) => ({
    workspace_id: workspaceId,
    advertiser_id: advertiserId,
    tiktok_campaign_id: asString(campaign.campaign_id),
    name: asString(campaign.campaign_name) || "Unnamed campaign",
    status: asString(campaign.operation_status || campaign.secondary_status) || "UNKNOWN",
    objective: asString(campaign.objective_type) || null,
    budget: campaign.budget === null || campaign.budget === undefined ? null : asNumber(campaign.budget),
    budget_mode: asString(campaign.budget_mode) || null,
    currency: account.currency,
    raw_metadata: campaign,
    tiktok_created_at: optionalTimestamp(campaign.create_time),
    tiktok_modified_at: optionalTimestamp(campaign.modify_time),
    is_deleted: false,
    synced_at: now,
  })).filter((row) => row.tiktok_campaign_id);
  const adgroupRows = adgroups.map((adgroup) => ({
    workspace_id: workspaceId,
    advertiser_id: advertiserId,
    tiktok_campaign_id: asString(adgroup.campaign_id),
    tiktok_adgroup_id: asString(adgroup.adgroup_id),
    name: asString(adgroup.adgroup_name) || "Unnamed ad group",
    status: asString(adgroup.operation_status || adgroup.secondary_status) || "UNKNOWN",
    placement: asArray(adgroup.placements).map(String).join(", ") || null,
    optimization_goal: asString(adgroup.optimization_goal) || null,
    bid_strategy: asString(adgroup.bid_type) || null,
    budget: adgroup.budget === null || adgroup.budget === undefined ? null : asNumber(adgroup.budget),
    budget_mode: asString(adgroup.budget_mode) || null,
    currency: account.currency,
    raw_metadata: adgroup,
    tiktok_created_at: optionalTimestamp(adgroup.create_time),
    tiktok_modified_at: optionalTimestamp(adgroup.modify_time),
    is_deleted: false,
    synced_at: now,
  })).filter((row) => row.tiktok_adgroup_id && row.tiktok_campaign_id);
  const adRows = ads.map((ad) => ({
    workspace_id: workspaceId,
    advertiser_id: advertiserId,
    tiktok_campaign_id: asString(ad.campaign_id),
    tiktok_adgroup_id: asString(ad.adgroup_id),
    tiktok_ad_id: asString(ad.ad_id),
    tiktok_creative_id: asString(ad.video_id || ad.tiktok_item_id || asArray(ad.image_ids)[0]) || null,
    name: asString(ad.ad_name) || "Unnamed ad",
    status: asString(ad.operation_status || ad.secondary_status) || "UNKNOWN",
    thumbnail_url: creativeUrl(ad, ["thumbnail_url", "image_url", "poster_url"]),
    preview_url: creativeUrl(ad, ["preview_url"]),
    raw_metadata: ad,
    tiktok_created_at: optionalTimestamp(ad.create_time),
    tiktok_modified_at: optionalTimestamp(ad.modify_time),
    is_deleted: false,
    synced_at: now,
  })).filter((row) => row.tiktok_ad_id && row.tiktok_adgroup_id && row.tiktok_campaign_id);

  await Promise.all([
    upsertBatches(client, "tiktok_campaigns", campaignRows, "workspace_id,advertiser_id,tiktok_campaign_id"),
    upsertBatches(client, "tiktok_adgroups", adgroupRows, "workspace_id,advertiser_id,tiktok_adgroup_id"),
    upsertBatches(client, "tiktok_ads", adRows, "workspace_id,advertiser_id,tiktok_ad_id"),
  ]);
  return { campaigns: campaignRows.length, adgroups: adgroupRows.length, ads: adRows.length };
}

const REPORT_METRICS = [
  "spend", "impressions", "reach", "engagements", "clicks", "ctr", "cpc", "cpm",
  "conversion", "cost_per_conversion", "video_play_actions", "video_watched_2s", "video_watched_6s",
  "video_views_p25", "video_views_p50", "video_views_p75", "video_views_p100", "average_video_play",
];

async function fetchReport(
  token: string,
  advertiserId: string,
  level: "advertiser" | "campaign" | "adgroup" | "ad",
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const dimension = level === "advertiser" ? "advertiser_id" : level === "campaign" ? "campaign_id" : level === "adgroup" ? "adgroup_id" : "ad_id";
  const dataLevel = level === "advertiser" ? "AUCTION_ADVERTISER" : level === "campaign" ? "AUCTION_CAMPAIGN" : level === "adgroup" ? "AUCTION_ADGROUP" : "AUCTION_AD";
  return fetchTikTokPages("/report/integrated/get/", token, {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: dataLevel,
    dimensions: [dimension, "stat_time_day"],
    metrics: REPORT_METRICS,
    start_date: startDate,
    end_date: endDate,
  }, (data) => ({ rows: listRows(data), pageInfo: pageInfo(data) }));
}

async function syncInsights(
  client: SupabaseClient,
  workspaceId: string,
  account: AccountRow,
  token: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const reports = await Promise.all(((["advertiser", "campaign", "adgroup", "ad"] as const)).map(async (level) => ({
    level,
    rows: await fetchReport(token, account.advertiser_id, level, startDate, endDate),
  })));
  const insightRows: Record<string, unknown>[] = [];
  for (const report of reports) {
    const idKey = report.level === "advertiser" ? "advertiser_id" : report.level === "campaign" ? "campaign_id" : report.level === "adgroup" ? "adgroup_id" : "ad_id";
    for (const row of report.rows) {
      const dimensions = asObject(row.dimensions);
      const metrics = asObject(row.metrics);
      const entityId = asString(dimensions[idKey]);
      const reportDate = asString(dimensions.stat_time_day).slice(0, 10);
      if (!entityId || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) continue;
      insightRows.push({
        workspace_id: workspaceId,
        advertiser_id: account.advertiser_id,
        reporting_level: report.level,
        entity_id: entityId,
        report_date: reportDate,
        spend: asNumber(metrics.spend),
        impressions: Math.round(asNumber(metrics.impressions)),
        reach: Math.round(asNumber(metrics.reach)),
        clicks: Math.round(asNumber(metrics.engagements || metrics.clicks)),
        destination_clicks: Math.round(asNumber(metrics.clicks)),
        ctr: asNumber(metrics.ctr),
        cpc: asNumber(metrics.cpc),
        cpm: asNumber(metrics.cpm),
        conversions: asNumber(metrics.conversion || metrics.conversions),
        cost_per_conversion: asNumber(metrics.cost_per_conversion),
        video_views: Math.round(asNumber(metrics.video_play_actions)),
        video_watched_2s: Math.round(asNumber(metrics.video_watched_2s)),
        video_watched_6s: Math.round(asNumber(metrics.video_watched_6s)),
        video_views_p25: Math.round(asNumber(metrics.video_views_p25)),
        video_views_p50: Math.round(asNumber(metrics.video_views_p50)),
        video_views_p75: Math.round(asNumber(metrics.video_views_p75)),
        video_views_p100: Math.round(asNumber(metrics.video_views_p100)),
        average_video_play: metrics.average_video_play === null || metrics.average_video_play === undefined ? null : asNumber(metrics.average_video_play),
        currency: account.currency,
        raw_metrics: metrics,
      });
    }
  }
  await upsertBatches(client, "tiktok_ad_insights", insightRows, "workspace_id,advertiser_id,reporting_level,entity_id,report_date");
  return insightRows.length;
}

async function syncAccount(
  client: SupabaseClient,
  workspaceId: string,
  account: AccountRow,
  connectionId: string,
  token: string,
  startDate: string,
  endDate: string,
): Promise<SyncAccountResult> {
  await client.from("tiktok_ad_accounts").update({ reporting_sync_status: "syncing", last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("id", account.id);
  try {
    const metadata = await syncMetadata(client, workspaceId, account, token);
    const insights = await syncInsights(client, workspaceId, account, token, startDate, endDate);
    await client.from("tiktok_ad_accounts").update({ reporting_sync_status: "success", last_successful_sync_at: new Date().toISOString(), last_sync_error: null }).eq("id", account.id);
    return { connection_id: connectionId, advertiser_id: account.advertiser_id, success: true, ...metadata, insights };
  } catch (error) {
    const message = error instanceof TikTokError ? error.message : "TikTok advertiser sync failed";
    await client.from("tiktok_ad_accounts").update({ reporting_sync_status: "failed", last_sync_error: sanitizeText(message) }).eq("id", account.id);
    return { connection_id: connectionId, advertiser_id: account.advertiser_id, success: false, campaigns: 0, adgroups: 0, ads: 0, insights: 0, error: message, error_category: error instanceof TikTokError ? error.category : "temporary" };
  }
}

export async function syncWorkspace(client: SupabaseClient, workspaceId: string, options: SyncOptions = {}): Promise<{ success: boolean; accounts: SyncAccountResult[] }> {
  const explicitRange = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : null;
  const { data: connections, error: connectionError } = await client
    .from("tiktok_connections")
    .select("id, workspace_id, access_token_encrypted, token_expires_at, status, auto_sync_enabled")
    .eq("workspace_id", workspaceId)
    .in("status", ["connected", "syncing", "sync_failed"]);
  if (connectionError || !connections?.length) throw new TikTokError("TikTok Ads is not connected", "configuration", 409);

  await client.from("tiktok_connections").update({ status: "syncing", last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("workspace_id", workspaceId).neq("status", "disconnected");
  const connectionMap = new Map((connections as ConnectionRow[]).map((connection) => [connection.id, connection]));
  const { data: accounts, error: accountError } = await client
    .from("tiktok_ad_accounts")
    .select("id, connection_id, advertiser_id, currency, timezone")
    .eq("workspace_id", workspaceId)
    .eq("is_enabled", true);
  if (accountError) throw new TikTokError("Advertiser accounts could not be loaded", "temporary", 500, true);
  if (!accounts?.length) throw new TikTokError("Select at least one TikTok advertiser account", "configuration", 409);

  const tokenCache = new Map<string, string>();
  const results: SyncAccountResult[] = [];
  for (const account of accounts as AccountRow[]) {
    const connection = connectionMap.get(account.connection_id);
    if (!connection?.access_token_encrypted) {
      results.push({ connection_id: account.connection_id, advertiser_id: account.advertiser_id, success: false, campaigns: 0, adgroups: 0, ads: 0, insights: 0, error: "TikTok authorization is unavailable", error_category: "authentication" });
      continue;
    }
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) {
      results.push({ connection_id: connection.id, advertiser_id: account.advertiser_id, success: false, campaigns: 0, adgroups: 0, ads: 0, insights: 0, error: "TikTok authorization expired", error_category: "authentication" });
      continue;
    }
    let token = tokenCache.get(connection.id);
    if (!token) {
      token = await decryptSecret(connection.access_token_encrypted);
      tokenCache.set(connection.id, token);
    }
    const accountRange = explicitRange ?? dateRangeInTimeZone(options.days ?? 7, account.timezone);
    results.push(await syncAccount(client, workspaceId, account, connection.id, token, accountRange.startDate, accountRange.endDate));
  }

  const successful = results.filter((result) => result.success).length;
  for (const connection of connections as ConnectionRow[]) {
    const connectionResults = results.filter((result) => result.connection_id === connection.id);
    const connectionSucceeded = connectionResults.some((result) => result.success);
    const categories = connectionResults.filter((result) => !result.success).map((result) => result.error_category);
    const connectionStatus = connectionSucceeded ? "connected" : categories.includes("authentication") ? "token_expired" : categories.includes("permission") ? "permission_required" : "sync_failed";
    const errorText = connectionResults.filter((result) => !result.success).map((result) => `${result.advertiser_id}: ${result.error}`).join("; ");
    await client.from("tiktok_connections").update({
      status: connectionStatus,
      last_successful_sync_at: connectionSucceeded ? new Date().toISOString() : undefined,
      last_sync_error: errorText ? sanitizeText(errorText) : null,
    }).eq("id", connection.id);
    if (!connectionSucceeded && connectionResults.length > 0) {
      const eventKey = categories.includes("authentication") ? "ads.token_expired" : "ads.tiktok_sync_failed";
      await client.rpc("emit_notification_event_service", {
        p_workspace_id: workspaceId,
        p_event_key: eventKey,
        p_related_entity_type: "tiktok_connection",
        p_related_entity_id: connection.id,
        p_payload: {
          title: eventKey === "ads.token_expired" ? "TikTok authorization expired" : "TikTok Ads sync failed",
          message: eventKey === "ads.token_expired" ? "Reconnect TikTok Ads to resume synchronization." : "TikTok Ads could not be synchronized. Review the integration status.",
          action_url: "/settings?tab=integrations&tiktok=select_accounts",
          provider: "tiktok",
        },
        p_dedupe_key: `${eventKey}:${connection.id}`,
        p_recipient_user_id: null,
        p_source_event_id: `tiktok-sync:${connection.id}:${Date.now()}`,
      });
    }
  }
  if (successful > 0) await client.rpc("refresh_tiktok_order_attribution", { p_workspace_id: workspaceId });
  return { success: successful > 0, accounts: results };
}
