import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { actionValue, activeConnection, fetchAllPages, MetaError, sanitizeText, type JsonObject } from "./meta.ts";

interface DateWindow { since: string; until: string }
interface SyncResult { ad_account_id: string; success: boolean; campaigns: number; adsets: number; ads: number; creatives: number; insights: number; error?: string; category?: string }

function isoDate(value: Date): string { return value.toISOString().slice(0, 10); }
function number(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function minorMoney(value: unknown): number | null { return value == null || value === "" ? null : number(value) / 100; }

export function resolveDateWindow(input: { days?: number; since?: string; until?: string }): DateWindow {
  if (input.since && input.until && /^\d{4}-\d{2}-\d{2}$/.test(input.since) && /^\d{4}-\d{2}-\d{2}$/.test(input.until)) {
    if (input.since > input.until) throw new MetaError("The reporting start date must not be after the end date", 400, "validation");
    return { since: input.since, until: input.until };
  }
  const days = Math.min(90, Math.max(1, Number(input.days ?? 3)));
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - days + 1);
  return { since: isoDate(since), until: isoDate(until) };
}

async function upsertBatches(client: SupabaseClient, table: string, rows: JsonObject[], onConflict: string): Promise<void> {
  for (let index = 0; index < rows.length; index += 250) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + 250), { onConflict });
    if (error) throw error;
  }
}

function creativeFields(creative: JsonObject): JsonObject {
  const story = creative.object_story_spec && typeof creative.object_story_spec === "object" ? creative.object_story_spec as JsonObject : {};
  const link = story.link_data && typeof story.link_data === "object" ? story.link_data as JsonObject : {};
  const video = story.video_data && typeof story.video_data === "object" ? story.video_data as JsonObject : {};
  const cta = (link.call_to_action ?? video.call_to_action) as JsonObject | undefined;
  const ctaValue = cta?.value && typeof cta.value === "object" ? cta.value as JsonObject : {};
  const destinationUrl = String(link.link ?? ctaValue.link ?? video.link_description ?? "") || null;
  return {
    image_hash: creative.image_hash ? String(creative.image_hash) : null,
    image_url: creative.image_url ? String(creative.image_url) : link.picture ? String(link.picture) : null,
    video_id: creative.video_id ? String(creative.video_id) : video.video_id ? String(video.video_id) : null,
    thumbnail_url: creative.thumbnail_url ? String(creative.thumbnail_url) : null,
    primary_text: link.message ? String(link.message) : video.message ? String(video.message) : null,
    headline: link.name ? String(link.name) : video.title ? String(video.title) : null,
    description: link.description ? String(link.description) : video.link_description ? String(video.link_description) : null,
    call_to_action: cta?.type ? String(cta.type) : null,
    destination_url: destinationUrl,
    product_url: destinationUrl,
    page_id: story.page_id ? String(story.page_id) : null,
    instagram_account_id: story.instagram_actor_id ? String(story.instagram_actor_id) : null,
    object_story_spec: story,
    asset_feed_spec: creative.asset_feed_spec && typeof creative.asset_feed_spec === "object" ? creative.asset_feed_spec : {},
    degrees_of_freedom_spec: creative.degrees_of_freedom_spec && typeof creative.degrees_of_freedom_spec === "object" ? creative.degrees_of_freedom_spec : {},
  };
}

function insightRows(workspaceId: string, accountId: string, level: string, rows: JsonObject[]): JsonObject[] {
  return rows.flatMap((row) => {
    const entityId = level === "campaign" ? row.campaign_id : level === "adset" ? row.adset_id : level === "ad" ? row.ad_id : accountId;
    if (!entityId || !row.date_start) return [];
    return [{
      workspace_id: workspaceId, ad_account_id: accountId, reporting_level: level, entity_id: String(entityId), report_date: String(row.date_start),
      spend: number(row.spend), reach: Math.round(number(row.reach)), impressions: Math.round(number(row.impressions)), clicks: Math.round(number(row.clicks)),
      inline_link_clicks: Math.round(number(row.inline_link_clicks)), unique_clicks: Math.round(number(row.unique_clicks)), ctr: number(row.ctr), cpc: number(row.cpc), cpm: number(row.cpm), frequency: number(row.frequency),
      actions: Array.isArray(row.actions) ? row.actions : [], action_values: Array.isArray(row.action_values) ? row.action_values : [], cost_per_action_type: Array.isArray(row.cost_per_action_type) ? row.cost_per_action_type : [],
      purchases: actionValue(row.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]), purchase_value: actionValue(row.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]), leads: actionValue(row.actions, ["lead", "onsite_conversion.lead_grouped"]), video_plays: Math.round(actionValue(row.video_play_actions, ["video_view"])),
      video_p25_watched_actions: Array.isArray(row.video_p25_watched_actions) ? row.video_p25_watched_actions : [], video_p50_watched_actions: Array.isArray(row.video_p50_watched_actions) ? row.video_p50_watched_actions : [], video_p75_watched_actions: Array.isArray(row.video_p75_watched_actions) ? row.video_p75_watched_actions : [], video_p95_watched_actions: Array.isArray(row.video_p95_watched_actions) ? row.video_p95_watched_actions : [], video_p100_watched_actions: Array.isArray(row.video_p100_watched_actions) ? row.video_p100_watched_actions : [], raw_data: row, synced_at: new Date().toISOString(),
    }];
  });
}

async function fetchInsights(token: string, accountId: string, level: string, window: DateWindow): Promise<JsonObject[]> {
  const fields = ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "spend", "reach", "impressions", "clicks", "inline_link_clicks", "unique_clicks", "ctr", "cpc", "cpm", "frequency", "actions", "action_values", "cost_per_action_type", "video_play_actions", "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions", "video_p95_watched_actions", "video_p100_watched_actions"].join(",");
  return fetchAllPages<JsonObject>(`${accountId}/insights`, { token, query: { level, fields, time_range: window, time_increment: 1, limit: 500 } });
}

export async function syncAdAccount(client: SupabaseClient, workspaceId: string, connectionId: string, token: string, accountId: string, window: DateWindow): Promise<SyncResult> {
  const now = new Date().toISOString();
  try {
    const [campaigns, adsets, ads] = await Promise.all([
      fetchAllPages<JsonObject>(`${accountId}/campaigns`, { token, query: { fields: "id,name,status,effective_status,objective,buying_type,special_ad_categories,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,configured_status", limit: 500 } }),
      fetchAllPages<JsonObject>(`${accountId}/adsets`, { token, query: { fields: "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,budget_remaining,targeting,promoted_object,publisher_platforms,facebook_positions,instagram_positions,messenger_positions,audience_network_positions,start_time,end_time,attribution_spec", limit: 500 } }),
      fetchAllPages<JsonObject>(`${accountId}/ads`, { token, query: { fields: "id,name,campaign_id,adset_id,status,effective_status,creative{id,name,image_hash,image_url,video_id,thumbnail_url,object_story_spec,asset_feed_spec,degrees_of_freedom_spec},tracking_specs,conversion_specs", limit: 500 } }),
    ]);
    const creatives = [...new Map(ads.flatMap((ad) => ad.creative && typeof ad.creative === "object" ? [[String((ad.creative as JsonObject).id), ad.creative as JsonObject] as const] : [])).values()];
    await Promise.all([
      upsertBatches(client, "meta_campaigns", campaigns.map((row) => ({ workspace_id: workspaceId, ad_account_id: accountId, meta_campaign_id: String(row.id), name: String(row.name ?? row.id), campaign_name: String(row.name ?? row.id), status: String(row.status ?? "UNKNOWN"), effective_status: row.effective_status ? String(row.effective_status) : null, objective: row.objective ? String(row.objective) : null, buying_type: row.buying_type ? String(row.buying_type) : null, special_ad_categories: Array.isArray(row.special_ad_categories) ? row.special_ad_categories : [], daily_budget: minorMoney(row.daily_budget), lifetime_budget: minorMoney(row.lifetime_budget), budget_remaining: minorMoney(row.budget_remaining), budget: minorMoney(row.daily_budget) ?? minorMoney(row.lifetime_budget), start_time: row.start_time ?? null, stop_time: row.stop_time ?? null, configured_status: row.configured_status ?? null, raw_data: row, synced_at: now })), "workspace_id,ad_account_id,meta_campaign_id"),
      upsertBatches(client, "meta_adsets", adsets.map((row) => ({ workspace_id: workspaceId, ad_account_id: accountId, meta_campaign_id: String(row.campaign_id), meta_adset_id: String(row.id), name: String(row.name ?? row.id), status: String(row.status ?? "UNKNOWN"), effective_status: row.effective_status ?? null, optimization_goal: row.optimization_goal ?? null, billing_event: row.billing_event ?? null, bid_strategy: row.bid_strategy ?? null, bid_amount: minorMoney(row.bid_amount), daily_budget: minorMoney(row.daily_budget), lifetime_budget: minorMoney(row.lifetime_budget), budget_remaining: minorMoney(row.budget_remaining), targeting_summary: row.targeting && typeof row.targeting === "object" ? row.targeting : {}, promoted_object: row.promoted_object && typeof row.promoted_object === "object" ? row.promoted_object : {}, placements: { publisher_platforms: row.publisher_platforms ?? [], facebook_positions: row.facebook_positions ?? [], instagram_positions: row.instagram_positions ?? [], messenger_positions: row.messenger_positions ?? [], audience_network_positions: row.audience_network_positions ?? [] }, start_time: row.start_time ?? null, end_time: row.end_time ?? null, attribution_spec: Array.isArray(row.attribution_spec) ? row.attribution_spec : [], raw_data: row, synced_at: now })), "workspace_id,ad_account_id,meta_adset_id"),
      upsertBatches(client, "meta_creatives", creatives.map((row) => ({ workspace_id: workspaceId, ad_account_id: accountId, meta_creative_id: String(row.id), name: row.name ? String(row.name) : null, creative_type: row.video_id ? "video" : "image", ...creativeFields(row), raw_data: row, synced_at: now })), "workspace_id,ad_account_id,meta_creative_id"),
    ]);
    const creativeById = new Map(creatives.map((row) => [String(row.id), creativeFields(row)]));
    await upsertBatches(client, "meta_ads", ads.map((row) => { const creative = row.creative && typeof row.creative === "object" ? row.creative as JsonObject : {}; const parsed = creativeById.get(String(creative.id)) ?? {}; return { workspace_id: workspaceId, ad_account_id: accountId, meta_campaign_id: String(row.campaign_id), meta_adset_id: String(row.adset_id), meta_ad_id: String(row.id), meta_creative_id: creative.id ? String(creative.id) : null, name: String(row.name ?? row.id), status: String(row.status ?? "UNKNOWN"), effective_status: row.effective_status ?? null, destination_url: parsed.destination_url ?? null, tracking_specs: Array.isArray(row.tracking_specs) ? row.tracking_specs : [], conversion_specs: Array.isArray(row.conversion_specs) ? row.conversion_specs : [], raw_data: row, synced_at: now }; }), "workspace_id,ad_account_id,meta_ad_id");
    const insightGroups = await Promise.all(["campaign", "adset", "ad"].map((level) => fetchInsights(token, accountId, level, window)));
    const dailyRows = insightGroups.flatMap((rows, index) => insightRows(workspaceId, accountId, ["campaign", "adset", "ad"][index], rows));
    await upsertBatches(client, "meta_insights_daily", dailyRows, "workspace_id,ad_account_id,reporting_level,entity_id,report_date");
    const campaignAggregate = new Map<string, { spend: number; reach: number; impressions: number; clicks: number; purchases: number }>();
    for (const row of dailyRows.filter((item) => item.reporting_level === "campaign")) { const key = String(row.entity_id); const current = campaignAggregate.get(key) ?? { spend: 0, reach: 0, impressions: 0, clicks: 0, purchases: 0 }; current.spend += number(row.spend); current.reach += number(row.reach); current.impressions += number(row.impressions); current.clicks += number(row.clicks); current.purchases += number(row.purchases); campaignAggregate.set(key, current); }
    for (const [campaignId, metrics] of campaignAggregate) await client.from("meta_campaigns").update({ spend: metrics.spend, reach: metrics.reach, impressions: metrics.impressions, clicks: metrics.clicks, results: metrics.purchases, ctr: metrics.impressions ? metrics.clicks / metrics.impressions * 100 : 0, cpc: metrics.clicks ? metrics.spend / metrics.clicks : 0, cpm: metrics.impressions ? metrics.spend / metrics.impressions * 1000 : 0, cost_per_result: metrics.purchases ? metrics.spend / metrics.purchases : 0, updated_at: now }).eq("workspace_id", workspaceId).eq("ad_account_id", accountId).eq("meta_campaign_id", campaignId);
    await client.from("meta_ad_accounts").update({ last_sync_at: now, last_successful_sync_at: now, last_sync_error: null }).eq("workspace_id", workspaceId).eq("meta_ad_account_id", accountId);
    return { ad_account_id: accountId, success: true, campaigns: campaigns.length, adsets: adsets.length, ads: ads.length, creatives: creatives.length, insights: dailyRows.length };
  } catch (error) {
    const normalized = error instanceof MetaError ? error : new MetaError("Meta sync failed", 500, "temporary", true);
    await client.from("meta_ad_accounts").update({ last_sync_at: now, last_sync_error: sanitizeText(normalized.message) }).eq("workspace_id", workspaceId).eq("meta_ad_account_id", accountId);
    return { ad_account_id: accountId, success: false, campaigns: 0, adsets: 0, ads: 0, creatives: 0, insights: 0, error: normalized.message, category: normalized.category };
  }
}

export async function syncWorkspace(client: SupabaseClient, workspaceId: string, input: { days?: number; since?: string; until?: string; adAccountId?: string }): Promise<{ success: boolean; partial_failure: boolean; results: SyncResult[]; window: DateWindow }> {
  const connection = await activeConnection(client, workspaceId);
  const window = resolveDateWindow(input);
  let query = client.from("meta_ad_accounts").select("meta_ad_account_id").eq("workspace_id", workspaceId).eq("is_enabled", true);
  if (input.adAccountId) query = query.eq("meta_ad_account_id", input.adAccountId);
  const { data: accounts, error } = await query;
  if (error) throw error;
  if (!accounts?.length) throw new MetaError("No enabled Meta ad account is available", 409, "configuration");
  const now = new Date().toISOString();
  await client.from("meta_connections").update({ status: "syncing", last_sync_at: now, last_sync_error: null }).eq("id", connection.id);
  const results: SyncResult[] = [];
  for (const account of accounts) results.push(await syncAdAccount(client, workspaceId, connection.id, connection.accessToken, String(account.meta_ad_account_id), window));
  const successes = results.filter((row) => row.success).length;
  const authFailure = results.some((row) => row.category === "authentication"); const permissionFailure = results.some((row) => row.category === "permission");
  await client.from("meta_connections").update({ status: successes ? "connected" : authFailure ? "token_expired" : permissionFailure ? "permission_required" : "sync_failed", last_successful_sync_at: successes ? now : undefined, last_sync_error: results.filter((row) => !row.success).map((row) => `${row.ad_account_id}: ${row.error}`).join("; ") || null }).eq("id", connection.id);
  if (successes) await client.rpc("refresh_meta_order_attribution", { p_workspace_id: workspaceId });
  return { success: successes > 0, partial_failure: successes > 0 && successes < results.length, results, window };
}
