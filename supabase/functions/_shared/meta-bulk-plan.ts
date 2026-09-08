export type DistributionMode = "one_per_adset" | "n_per_adset" | "round_robin" | "selected_adsets" | "combinations";
export interface BulkCreative { name?: string; image_hash?: string; video_id?: string; source_url?: string; media_type?: "image" | "video" }
export interface BulkLaunchConfiguration {
  campaign?: { id?: string; name?: string; objective?: string };
  adsets?: Array<{ id?: string; name?: string; daily_budget?: number; targeting?: Record<string, unknown> }>;
  adset_count?: number;
  creatives?: BulkCreative[];
  primary_texts?: string[];
  headlines?: string[];
  distribution_mode?: DistributionMode;
  creatives_per_adset?: number;
  naming?: { campaign?: string; adset?: string; ad?: string; creative?: string };
  product_name?: string;
  create_status?: "PAUSED" | "ACTIVE";
}

export interface PlannedAd { index: number; adset_index: number; creative_index: number; text_index: number; headline_index: number }

export function replaceNamingVariables(template: string, values: { productName?: string; date?: string; index: number; creativeName?: string }): string {
  return template
    .replaceAll("{PRODUCT_NAME}", values.productName || "Product")
    .replaceAll("{DATE}", values.date || new Date().toISOString().slice(0, 10))
    .replaceAll("{INDEX}", String(values.index + 1).padStart(3, "0"))
    .replaceAll("{CREATIVE_NAME}", values.creativeName || `Creative ${values.index + 1}`)
    .slice(0, 240);
}

export function buildBulkLaunchPlan(config: BulkLaunchConfiguration): { campaign_count: number; adset_count: number; ad_count: number; creative_count: number; max_daily_budget: number; create_status: "PAUSED" | "ACTIVE"; items: PlannedAd[] } {
  const creatives = config.creatives ?? [];
  if (!creatives.length || creatives.length > 1000) throw new Error("Provide between 1 and 1000 creatives");
  const mode = config.distribution_mode ?? "one_per_adset";
  const selected = config.adsets ?? [];
  const requestedCount = Math.min(1000, Math.max(1, Number(config.adset_count ?? (selected.length || 1))));
  const adsetCount = mode === "one_per_adset" ? creatives.length : Math.max(selected.length, requestedCount);
  const texts = Math.max(1, config.primary_texts?.length ?? 0);
  const headlines = Math.max(1, config.headlines?.length ?? 0);
  const items: PlannedAd[] = [];
  if (mode === "combinations") {
    for (let creative = 0; creative < creatives.length; creative += 1) for (let text = 0; text < texts; text += 1) for (let headline = 0; headline < headlines; headline += 1) items.push({ index: items.length, adset_index: items.length % adsetCount, creative_index: creative, text_index: text, headline_index: headline });
  } else if (mode === "n_per_adset") {
    const count = Math.max(1, Math.min(creatives.length, Number(config.creatives_per_adset ?? 1)));
    for (let adset = 0; adset < adsetCount; adset += 1) for (let offset = 0; offset < count; offset += 1) items.push({ index: items.length, adset_index: adset, creative_index: (adset * count + offset) % creatives.length, text_index: items.length % texts, headline_index: items.length % headlines });
  } else if (mode === "selected_adsets") {
    for (let adset = 0; adset < adsetCount; adset += 1) for (let creative = 0; creative < creatives.length; creative += 1) items.push({ index: items.length, adset_index: adset, creative_index: creative, text_index: items.length % texts, headline_index: items.length % headlines });
  } else {
    for (let creative = 0; creative < creatives.length; creative += 1) items.push({ index: items.length, adset_index: mode === "one_per_adset" ? creative : creative % adsetCount, creative_index: creative, text_index: creative % texts, headline_index: creative % headlines });
  }
  if (items.length > 10000) throw new Error("The selected combinations exceed the 10,000 ad safety limit");
  const budgets = Array.from({ length: adsetCount }, (_, index) => Number(selected[index]?.daily_budget ?? selected[0]?.daily_budget ?? 0));
  const existingAdsets = selected.filter((row) => row.id).length;
  return { campaign_count: config.campaign?.id || existingAdsets === adsetCount ? 0 : 1, adset_count: existingAdsets === adsetCount ? 0 : adsetCount - existingAdsets, ad_count: items.length, creative_count: creatives.length, max_daily_budget: budgets.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0), create_status: config.create_status === "ACTIVE" ? "ACTIVE" : "PAUSED", items };
}
