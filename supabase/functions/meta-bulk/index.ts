import {
  activeConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  fetchAllPages,
  isCronRequest,
  jsonResponse,
  MetaError,
  metaRequest,
  metaUploadImage,
  metaUploadVideo,
  normalizeAdAccountId,
  resolveActiveWorkspace,
  sanitizeText,
  serviceClient,
  writeActionLog,
  type JsonObject,
} from "../_shared/meta.ts";
import {
  buildBulkLaunchPlan,
  replaceNamingVariables,
  type BulkLaunchConfiguration,
  type PlannedAd,
} from "../_shared/meta-bulk-plan.ts";

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function status(value: unknown): "PAUSED" | "ACTIVE" {
  return String(value ?? "PAUSED").toUpperCase() === "ACTIVE"
    ? "ACTIVE"
    : "PAUSED";
}
function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1)
    throw new MetaError("Daily budget must be at least 1", 400, "validation");
  return Math.round(amount * 100);
}

async function persist(
  request: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await request;
  if (error) throw error;
}

function resolvedCreativeName(
  config: BulkLaunchConfiguration,
  plan: PlannedAd,
): string {
  const creative = config.creatives?.[plan.creative_index] ?? {};
  const baseName = replaceNamingVariables(
    config.naming?.creative ?? "{CREATIVE_NAME} {INDEX}",
    {
      productName: config.product_name,
      index: plan.creative_index,
      creativeName: creative.name,
    },
  );
  const hasVariants =
    (config.primary_texts?.length ?? 0) > 1 ||
    (config.headlines?.length ?? 0) > 1;
  return hasVariants
    ? `${baseName} T${plan.text_index + 1} H${plan.headline_index + 1}`.slice(
        0,
        240,
      )
    : baseName;
}

const providerNameCaches = new Map<string, Map<string, string>>();

function rememberProviderName(
  namespace: string,
  parent: string,
  edge: string,
  name: string,
  id: string,
): void {
  const cacheKey = `${namespace}:${parent}:${edge}`;
  const names = providerNameCaches.get(cacheKey) ?? new Map<string, string>();
  names.set(name, id);
  providerNameCaches.set(cacheKey, names);
  if (providerNameCaches.size > 200)
    providerNameCaches.delete(providerNameCaches.keys().next().value as string);
}

async function authorizedAccount(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  accountValue: unknown,
): Promise<string> {
  const accountId = normalizeAdAccountId(accountValue);
  const { data } = await client
    .from("meta_ad_accounts")
    .select("meta_ad_account_id")
    .eq("workspace_id", workspaceId)
    .eq("connection_id", connectionId)
    .eq("meta_ad_account_id", accountId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (!data)
    throw new MetaError(
      "Ad account is not authorized for this workspace",
      403,
      "permission",
    );
  return accountId;
}

async function authorizeLaunchConfiguration(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  accountId: string,
  config: BulkLaunchConfiguration & JsonObject,
): Promise<void> {
  const pageId = String(config.page_id ?? "").trim();
  if (!pageId)
    throw new MetaError("A Facebook Page is required", 400, "validation");
  const { data: page } = await client
    .from("meta_pages")
    .select("meta_page_id")
    .eq("workspace_id", workspaceId)
    .eq("connection_id", connectionId)
    .eq("meta_page_id", pageId)
    .maybeSingle();
  if (!page)
    throw new MetaError(
      "Selected Facebook Page is not authorized for this workspace",
      403,
      "permission",
    );
  const instagramId = String(config.instagram_account_id ?? "").trim();
  if (instagramId) {
    const { data: instagram } = await client
      .from("meta_instagram_accounts")
      .select("meta_instagram_account_id,page_id")
      .eq("workspace_id", workspaceId)
      .eq("connection_id", connectionId)
      .eq("meta_instagram_account_id", instagramId)
      .maybeSingle();
    if (!instagram || (instagram.page_id && instagram.page_id !== pageId))
      throw new MetaError(
        "Selected Instagram account is not linked to the selected Page",
        403,
        "permission",
      );
  }
  const pixelId = String(config.pixel_id ?? "").trim();
  if (pixelId) {
    const { data: pixel } = await client
      .from("meta_pixels")
      .select("meta_pixel_id")
      .eq("workspace_id", workspaceId)
      .eq("connection_id", connectionId)
      .eq("ad_account_id", accountId)
      .eq("meta_pixel_id", pixelId)
      .maybeSingle();
    if (!pixel)
      throw new MetaError(
        "Selected Pixel is not authorized for this ad account",
        403,
        "permission",
      );
  }
  try {
    const destination = new URL(String(config.destination_url ?? ""));
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error();
  } catch {
    throw new MetaError(
      "A valid destination URL is required",
      400,
      "validation",
    );
  }
}

async function findByName(
  token: string,
  parent: string,
  edge: string,
  name: string,
  namespace: string,
): Promise<string | null> {
  const cacheKey = `${namespace}:${parent}:${edge}`;
  const cached = providerNameCaches.get(cacheKey);
  if (cached) return cached.get(name) ?? null;
  const payload = await fetchAllPages<{ id: string; name?: string }>(
    `${parent}/${edge}`,
    {
      token,
      query: { fields: "id,name", limit: 500 },
    },
  );
  const names = new Map(
    payload.flatMap((row) =>
      row.name ? ([[row.name, row.id]] as Array<[string, string]>) : [],
    ),
  );
  providerNameCaches.set(cacheKey, names);
  return names.get(name) ?? null;
}

async function ensureCampaign(
  token: string,
  accountId: string,
  config: BulkLaunchConfiguration,
  jobId: string,
): Promise<string> {
  if (config.campaign?.id) return String(config.campaign.id);
  const name = replaceNamingVariables(
    config.naming?.campaign ??
      config.campaign?.name ??
      "TEST {PRODUCT_NAME} {DATE}",
    { productName: config.product_name, index: 0 },
  );
  const existing = await findByName(token, accountId, "campaigns", name, jobId);
  if (existing) return existing;
  const result = await metaRequest<{ id?: string }>(`${accountId}/campaigns`, {
    token,
    method: "POST",
    body: {
      name,
      objective: config.campaign?.objective ?? "OUTCOME_SALES",
      status: status(config.create_status),
      special_ad_categories: [],
      execution_options: [],
      buying_type: "AUCTION",
    },
  });
  if (!result.id)
    throw new MetaError(
      "Meta did not confirm campaign creation",
      502,
      "temporary",
      true,
    );
  rememberProviderName(jobId, accountId, "campaigns", name, result.id);
  providerNameCaches.set(`${jobId}:${result.id}:adsets`, new Map());
  return result.id;
}

async function ensureAdset(
  token: string,
  accountId: string,
  campaignId: string,
  config: BulkLaunchConfiguration,
  plan: PlannedAd,
  jobId: string,
): Promise<string> {
  const candidate =
    config.adsets?.[plan.adset_index] ?? config.adsets?.[0] ?? {};
  if (candidate.id) return String(candidate.id);
  const name = replaceNamingVariables(
    config.naming?.adset ?? candidate.name ?? "Broad {PRODUCT_NAME} {INDEX}",
    { productName: config.product_name, index: plan.adset_index },
  );
  const existing = await findByName(token, campaignId, "adsets", name, jobId);
  if (existing) return existing;
  const payload: JsonObject = {
    name,
    campaign_id: campaignId,
    daily_budget: money(candidate.daily_budget ?? 10),
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: candidate.targeting ?? {
      geo_locations: { countries: ["MA"] },
      age_min: 18,
      age_max: 65,
    },
    status: status(config.create_status),
  };
  const pixel = String((config as JsonObject).pixel_id ?? "");
  if (pixel)
    payload.promoted_object = {
      pixel_id: pixel,
      custom_event_type: String(
        (config as JsonObject).conversion_event ?? "PURCHASE",
      ),
    };
  const result = await metaRequest<{ id?: string }>(`${accountId}/adsets`, {
    token,
    method: "POST",
    body: payload,
  });
  if (!result.id)
    throw new MetaError(
      "Meta did not confirm ad set creation",
      502,
      "temporary",
      true,
    );
  rememberProviderName(jobId, campaignId, "adsets", name, result.id);
  providerNameCaches.set(`${jobId}:${result.id}:ads`, new Map());
  return result.id;
}

async function ensureCreative(
  token: string,
  accountId: string,
  workspaceId: string,
  config: BulkLaunchConfiguration,
  plan: PlannedAd,
  jobId: string,
): Promise<{
  id: string;
  name: string;
  imageHash?: string;
  videoId?: string;
}> {
  const creative = config.creatives?.[plan.creative_index] ?? {};
  const name = resolvedCreativeName(config, plan);
  const existing = await findByName(
    token,
    accountId,
    "adcreatives",
    name,
    jobId,
  );
  if (existing)
    return {
      id: existing,
      name,
      imageHash: creative.image_hash,
      videoId: creative.video_id,
    };
  let imageHash = creative.image_hash;
  let videoId = creative.video_id;
  if (!imageHash && !videoId && creative.source_url) {
    if (creative.media_type === "video")
      videoId = (
        await metaUploadVideo(
          token,
          accountId,
          creative.source_url,
          workspaceId,
          name,
        )
      ).id;
    else
      imageHash = (
        await metaUploadImage(
          token,
          accountId,
          creative.source_url,
          workspaceId,
          creative.name ?? "creative.jpg",
        )
      ).hash;
  }
  if (!imageHash && !videoId)
    throw new MetaError(
      "Creative is missing uploaded media",
      400,
      "validation",
    );
  const raw = config as JsonObject;
  const destination = String(raw.destination_url ?? "");
  const pageId = String(raw.page_id ?? "");
  if (!destination || !pageId)
    throw new MetaError(
      "Page and destination URL are required",
      400,
      "validation",
    );
  const primaryText =
    config.primary_texts?.[plan.text_index] ?? String(raw.primary_text ?? "");
  const headline =
    config.headlines?.[plan.headline_index] ?? String(raw.headline ?? "");
  const attachment = videoId
    ? {
        video_id: videoId,
        message: primaryText,
        title: headline,
        link_description: String(raw.description ?? ""),
        call_to_action: {
          type: String(raw.call_to_action ?? "SHOP_NOW"),
          value: { link: destination },
        },
      }
    : {
        image_hash: imageHash,
        link: destination,
        message: primaryText,
        name: headline,
        description: String(raw.description ?? ""),
        call_to_action: {
          type: String(raw.call_to_action ?? "SHOP_NOW"),
          value: { link: destination },
        },
      };
  const story = {
    page_id: pageId,
    ...(raw.instagram_account_id
      ? { instagram_actor_id: String(raw.instagram_account_id) }
      : {}),
    [videoId ? "video_data" : "link_data"]: attachment,
  };
  const result = await metaRequest<{ id?: string }>(
    `${accountId}/adcreatives`,
    { token, method: "POST", body: { name, object_story_spec: story } },
  );
  if (!result.id)
    throw new MetaError(
      "Meta did not confirm creative creation",
      502,
      "temporary",
      true,
    );
  rememberProviderName(jobId, accountId, "adcreatives", name, result.id);
  return { id: result.id, name, imageHash, videoId };
}

async function processLaunchItem(
  client: ReturnType<typeof serviceClient>,
  job: JsonObject,
  item: JsonObject,
  token: string,
) {
  const config = object(job.configuration) as BulkLaunchConfiguration;
  const plan = object(item.payload) as unknown as PlannedAd;
  const accountId = String(job.ad_account_id);
  const configuredAdset =
    config.adsets?.[plan.adset_index] ?? config.adsets?.[0];
  let campaignId: string;
  let adsetId: string;
  if (configuredAdset?.id) {
    const ownedAdset = await assertOwnedEntity(
      client,
      job,
      "adset",
      String(configuredAdset.id),
    );
    campaignId = String(ownedAdset.meta_campaign_id);
    adsetId = String(configuredAdset.id);
  } else {
    if (config.campaign?.id)
      await assertOwnedEntity(
        client,
        job,
        "campaign",
        String(config.campaign.id),
      );
    campaignId = await ensureCampaign(token, accountId, config, String(job.id));
    adsetId = await ensureAdset(
      token,
      accountId,
      campaignId,
      config,
      plan,
      String(job.id),
    );
  }
  const creativeResult = await ensureCreative(
    token,
    accountId,
    String(job.workspace_id),
    config,
    plan,
    String(job.id),
  );
  const creativeId = creativeResult.id;
  const creative = config.creatives?.[plan.creative_index] ?? {};
  const adName = replaceNamingVariables(
    config.naming?.ad ?? "{PRODUCT_NAME} {CREATIVE_NAME} {INDEX}",
    {
      productName: config.product_name,
      index: plan.index,
      creativeName: creative.name,
    },
  );
  const existing = await findByName(
    token,
    adsetId,
    "ads",
    adName,
    String(job.id),
  );
  const adId =
    existing ??
    (
      await metaRequest<{ id?: string }>(`${accountId}/ads`, {
        token,
        method: "POST",
        body: {
          name: adName,
          adset_id: adsetId,
          creative: { creative_id: creativeId },
          status: status(config.create_status),
          url_tags: String(
            (config as JsonObject).url_tags ??
              "utm_source=facebook&utm_medium=paid_social",
          ),
        },
      })
    ).id;
  if (!adId)
    throw new MetaError(
      "Meta did not confirm ad creation",
      502,
      "temporary",
      true,
    );
  rememberProviderName(String(job.id), adsetId, "ads", adName, adId);
  const workspaceId = String(job.workspace_id);
  const createStatus = status(config.create_status);
  if (!config.campaign?.id && !configuredAdset?.id) {
    const campaignName = replaceNamingVariables(
      config.naming?.campaign ??
        config.campaign?.name ??
        "TEST {PRODUCT_NAME} {DATE}",
      { productName: config.product_name, index: 0 },
    );
    await persist(
      client.from("meta_campaigns").upsert(
        {
          workspace_id: workspaceId,
          ad_account_id: accountId,
          meta_campaign_id: campaignId,
          name: campaignName,
          campaign_name: campaignName,
          status: createStatus,
          objective: config.campaign?.objective ?? "OUTCOME_SALES",
        },
        { onConflict: "workspace_id,ad_account_id,meta_campaign_id" },
      ),
    );
  }
  if (!configuredAdset?.id) {
    const adsetCandidate =
      config.adsets?.[plan.adset_index] ?? config.adsets?.[0] ?? {};
    const adsetName = replaceNamingVariables(
      config.naming?.adset ??
        adsetCandidate.name ??
        "Broad {PRODUCT_NAME} {INDEX}",
      { productName: config.product_name, index: plan.adset_index },
    );
    await persist(
      client.from("meta_adsets").upsert(
        {
          workspace_id: workspaceId,
          ad_account_id: accountId,
          meta_campaign_id: campaignId,
          meta_adset_id: adsetId,
          name: adsetName,
          status: createStatus,
          daily_budget: adsetCandidate.daily_budget ?? null,
          targeting_summary: config.adsets?.[plan.adset_index]?.targeting ?? {},
        },
        { onConflict: "workspace_id,ad_account_id,meta_adset_id" },
      ),
    );
  }
  await persist(
    client.from("meta_creatives").upsert(
      {
        workspace_id: workspaceId,
        ad_account_id: accountId,
        meta_creative_id: creativeId,
        name: creativeResult.name,
        creative_type:
          creative.media_type ?? (creative.video_id ? "video" : "image"),
        image_hash: creativeResult.imageHash ?? null,
        video_id: creativeResult.videoId ?? null,
        primary_text:
          config.primary_texts?.[plan.text_index] ??
          String((config as JsonObject).primary_text ?? ""),
        headline:
          config.headlines?.[plan.headline_index] ??
          String((config as JsonObject).headline ?? ""),
        description: String((config as JsonObject).description ?? ""),
        call_to_action: String(
          (config as JsonObject).call_to_action ?? "SHOP_NOW",
        ),
        destination_url:
          String((config as JsonObject).destination_url ?? "") || null,
        product_url:
          String((config as JsonObject).destination_url ?? "") || null,
        page_id: String((config as JsonObject).page_id ?? "") || null,
        instagram_account_id:
          String((config as JsonObject).instagram_account_id ?? "") || null,
      },
      { onConflict: "workspace_id,ad_account_id,meta_creative_id" },
    ),
  );
  await persist(
    client.from("meta_ads").upsert(
      {
        workspace_id: workspaceId,
        ad_account_id: accountId,
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId,
        meta_ad_id: adId,
        meta_creative_id: creativeId,
        name: adName,
        status: createStatus,
        destination_url:
          String((config as JsonObject).destination_url ?? "") || null,
      },
      { onConflict: "workspace_id,ad_account_id,meta_ad_id" },
    ),
  );
  return {
    ad_id: adId,
    creative_id: creativeId,
    adset_id: adsetId,
    campaign_id: campaignId,
  };
}

async function assertOwnedEntity(
  client: ReturnType<typeof serviceClient>,
  job: JsonObject,
  entityType: string,
  id: string,
) {
  const lookup: Record<string, { table: string; column: string }> = {
    campaign: { table: "meta_campaigns", column: "meta_campaign_id" },
    adset: { table: "meta_adsets", column: "meta_adset_id" },
    ad: { table: "meta_ads", column: "meta_ad_id" },
  };
  const target = lookup[entityType];
  if (!target)
    throw new MetaError("Unsupported bulk entity type", 400, "validation");
  const { data } = await client
    .from(target.table)
    .select("*")
    .eq("workspace_id", String(job.workspace_id))
    .eq("ad_account_id", String(job.ad_account_id))
    .eq(target.column, id)
    .maybeSingle();
  if (!data)
    throw new MetaError(
      "Selected Meta object is not authorized for this workspace",
      403,
      "permission",
    );
  return data as JsonObject;
}

async function mirrorDuplicateEntity(
  client: ReturnType<typeof serviceClient>,
  job: JsonObject,
  entityType: string,
  source: JsonObject,
  copiedId: string,
  desiredStatus: "PAUSED" | "ACTIVE",
  renamePrefix: string,
  destination?: JsonObject,
): Promise<void> {
  const lookup: Record<
    string,
    { table: string; column: string; conflict: string }
  > = {
    campaign: {
      table: "meta_campaigns",
      column: "meta_campaign_id",
      conflict: "workspace_id,ad_account_id,meta_campaign_id",
    },
    adset: {
      table: "meta_adsets",
      column: "meta_adset_id",
      conflict: "workspace_id,ad_account_id,meta_adset_id",
    },
    ad: {
      table: "meta_ads",
      column: "meta_ad_id",
      conflict: "workspace_id,ad_account_id,meta_ad_id",
    },
  };
  const target = lookup[entityType];
  if (!target)
    throw new MetaError("Unsupported bulk entity type", 400, "validation");
  const clone: JsonObject = { ...source };
  for (const key of ["id", "created_at", "updated_at", "synced_at"])
    delete clone[key];
  clone.workspace_id = String(job.workspace_id);
  clone.ad_account_id = String(job.ad_account_id);
  clone[target.column] = copiedId;
  clone.status = desiredStatus;
  clone.effective_status = null;
  clone.name =
    `${renamePrefix}${String(source.name ?? source.campaign_name ?? "Copy")}`.slice(
      0,
      240,
    );
  if (entityType === "campaign") clone.campaign_name = clone.name;
  if (entityType === "adset" && destination)
    clone.meta_campaign_id = destination.meta_campaign_id;
  if (entityType === "ad" && destination) {
    clone.meta_adset_id = destination.meta_adset_id;
    clone.meta_campaign_id = destination.meta_campaign_id;
  }
  clone.raw_data = { copied_from: source[target.column] };
  await persist(
    client.from(target.table).upsert(clone, { onConflict: target.conflict }),
  );
}

async function processActionItem(
  client: ReturnType<typeof serviceClient>,
  job: JsonObject,
  item: JsonObject,
  token: string,
) {
  const payload = object(item.payload);
  const id = String(payload.entity_id ?? "");
  if (!id)
    throw new MetaError(
      "Bulk action item is missing an entity ID",
      400,
      "validation",
    );
  const entityType = String(payload.entity_type ?? item.item_type ?? "");
  const source = await assertOwnedEntity(client, job, entityType, id);
  const operation = String(payload.operation ?? "set_status");
  if (!["set_status", "set_budget", "duplicate"].includes(operation))
    throw new MetaError("Unsupported bulk operation", 400, "validation");
  if (operation === "duplicate") {
    let destination: JsonObject | undefined;
    const duplicateBody: JsonObject = {
      status_option: status(payload.status),
      deep_copy: payload.deep_copy !== false,
      rename_options: {
        rename_strategy: "DEEP_RENAME",
        rename_prefix: `${String(payload.name_prefix ?? "Copy ")}[EcomOS ${String(item.id).slice(0, 8)}] `,
      },
    };
    if (payload.campaign_id) {
      if (entityType !== "adset")
        throw new MetaError(
          "Only ad sets can target another campaign",
          400,
          "validation",
        );
      destination = await assertOwnedEntity(
        client,
        job,
        "campaign",
        String(payload.campaign_id),
      );
      duplicateBody.campaign_id = String(payload.campaign_id);
    }
    if (payload.adset_id) {
      if (entityType !== "ad")
        throw new MetaError(
          "Only ads can target another ad set",
          400,
          "validation",
        );
      destination = await assertOwnedEntity(
        client,
        job,
        "adset",
        String(payload.adset_id),
      );
      duplicateBody.adset_id = String(payload.adset_id);
    }
    const renamePrefix = String(
      (duplicateBody.rename_options as JsonObject).rename_prefix,
    );
    const parent =
      entityType === "campaign"
        ? String(job.ad_account_id)
        : entityType === "adset"
          ? String(destination?.meta_campaign_id ?? source.meta_campaign_id)
          : String(destination?.meta_adset_id ?? source.meta_adset_id);
    const edge =
      entityType === "campaign"
        ? "campaigns"
        : entityType === "adset"
          ? "adsets"
          : "ads";
    const expectedName =
      `${renamePrefix}${String(source.name ?? source.campaign_name ?? "")}`.slice(
        0,
        240,
      );
    const existing = expectedName
      ? await findByName(token, parent, edge, expectedName, String(job.id))
      : null;
    const result = existing
      ? {
          [entityType === "campaign"
            ? "copied_campaign_id"
            : entityType === "adset"
              ? "copied_adset_id"
              : "copied_ad_id"]: existing,
        }
      : await metaRequest<JsonObject>(`${id}/copies`, {
          token,
          method: "POST",
          body: duplicateBody,
        });
    const copied =
      result.copied_campaign_id ??
      result.copied_adset_id ??
      result.copied_ad_id;
    if (!copied)
      throw new MetaError(
        "Meta did not confirm duplicate",
        502,
        "temporary",
        true,
      );
    await mirrorDuplicateEntity(
      client,
      job,
      entityType,
      source,
      String(copied),
      status(payload.status),
      renamePrefix,
      destination,
    );
    return { id: copied };
  }
  const body =
    operation === "set_budget"
      ? { daily_budget: money(payload.daily_budget) }
      : { status: status(payload.status) };
  const result = await metaRequest<{ success?: boolean }>(id, {
    token,
    method: "POST",
    body,
  });
  if (!result.success)
    throw new MetaError(
      "Meta did not confirm bulk change",
      502,
      "temporary",
      true,
    );
  const lookup: Record<string, { table: string; column: string }> = {
    campaign: { table: "meta_campaigns", column: "meta_campaign_id" },
    adset: { table: "meta_adsets", column: "meta_adset_id" },
    ad: { table: "meta_ads", column: "meta_ad_id" },
  };
  const target = lookup[entityType];
  if (!target)
    throw new MetaError("Unsupported bulk entity type", 400, "validation");
  const mirror =
    operation === "set_budget"
      ? {
          daily_budget: Number(payload.daily_budget),
          ...(entityType === "campaign"
            ? { budget: Number(payload.daily_budget) }
            : {}),
        }
      : { status: status(payload.status) };
  await persist(
    client
      .from(target.table)
      .update(mirror)
      .eq("workspace_id", String(job.workspace_id))
      .eq("ad_account_id", String(job.ad_account_id))
      .eq(target.column, id),
  );
  return { id, ...body };
}

async function processJob(
  client: ReturnType<typeof serviceClient>,
  jobId: string,
  chunk = 10,
) {
  const { data: job } = await client
    .from("meta_bulk_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (
    !job ||
    ["cancelled", "completed", "partial_failure", "failed"].includes(job.status)
  )
    return job;
  let connection: Awaited<ReturnType<typeof activeConnection>>;
  try {
    connection = await activeConnection(client, String(job.workspace_id));
    if (String(job.connection_id) !== connection.id)
      throw new MetaError(
        "This job belongs to a previous Meta connection and cannot resume",
        409,
        "configuration",
      );
    await authorizedAccount(
      client,
      String(job.workspace_id),
      connection.id,
      job.ad_account_id,
    );
  } catch (error) {
    const message = sanitizeText(
      error instanceof Error ? error.message : "Meta connection unavailable",
    );
    await client
      .from("meta_bulk_jobs")
      .update({
        status: "failed",
        last_error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await client
      .from("meta_workflow_runs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("bulk_job_id", jobId);
    throw error;
  }
  const now = new Date().toISOString();
  await client
    .from("meta_bulk_job_items")
    .update({
      status: "failed",
      next_retry_at: now,
      last_error: "Recovered interrupted worker item",
    })
    .eq("job_id", jobId)
    .eq("status", "processing")
    .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  await client
    .from("meta_bulk_jobs")
    .update({
      status: "processing",
      started_at: job.started_at ?? new Date().toISOString(),
    })
    .eq("id", jobId);
  const { data: items } = await client
    .from("meta_bulk_job_items")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["queued", "failed"])
    .lt("attempts", Number(job.max_attempts ?? 5))
    .lte("next_retry_at", new Date().toISOString())
    .order("item_index")
    .limit(chunk);
  for (const item of items ?? []) {
    const claimed = await client
      .from("meta_bulk_job_items")
      .update({
        status: "processing",
        attempts: Number(item.attempts) + 1,
        started_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .in("status", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed.data) continue;
    try {
      const result =
        job.job_type === "bulk_launch"
          ? await processLaunchItem(client, job, item, connection.accessToken)
          : await processActionItem(client, job, item, connection.accessToken);
      await client
        .from("meta_bulk_job_items")
        .update({
          status: "completed",
          meta_object_id:
            String(
              (result as JsonObject).ad_id ?? (result as JsonObject).id ?? "",
            ) || null,
          result,
          last_error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await writeActionLog(client, {
        workspaceId: String(job.workspace_id),
        actorUserId: job.created_by ? String(job.created_by) : null,
        source: "bulk_job",
        sourceId: String(job.id),
        action: String(job.job_type),
        entityType: String(item.item_type),
        entityId: String(
          (result as JsonObject).ad_id ?? (result as JsonObject).id ?? "",
        ),
        reason: "Durable bulk job",
        after: result,
        result: "success",
      });
    } catch (error) {
      const attempts = Number(item.attempts) + 1;
      const maxAttempts = Number(job.max_attempts ?? 5);
      const retryable = error instanceof MetaError ? error.retryable : true;
      const terminal = !retryable || attempts >= maxAttempts;
      await client
        .from("meta_bulk_job_items")
        .update({
          status: "failed",
          attempts: terminal ? maxAttempts : attempts,
          last_error: sanitizeText(
            error instanceof Error ? error.message : "Bulk operation failed",
          ),
          next_retry_at: new Date(
            Date.now() +
              Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempts, 6)),
          ).toISOString(),
          completed_at: terminal ? new Date().toISOString() : null,
        })
        .eq("id", item.id);
      await writeActionLog(client, {
        workspaceId: String(job.workspace_id),
        actorUserId: job.created_by ? String(job.created_by) : null,
        source: "bulk_job",
        sourceId: String(job.id),
        action: String(job.job_type),
        entityType: String(item.item_type),
        reason: "Durable bulk job",
        result: "failed",
        error: error as Error,
      });
    }
  }
  const { data: all } = await client
    .from("meta_bulk_job_items")
    .select("status,attempts,last_error")
    .eq("job_id", jobId);
  const total = all?.length ?? 0;
  const succeeded =
    all?.filter((row) => row.status === "completed").length ?? 0;
  const failed = all?.filter((row) => row.status === "failed").length ?? 0;
  const pending = total - succeeded - failed;
  const terminalFailures =
    all?.filter(
      (row) =>
        row.status === "failed" &&
        Number(row.attempts) >= Number(job.max_attempts ?? 5),
    ).length ?? 0;
  const finalStatus =
    succeeded === total
      ? "completed"
      : pending === 0 && terminalFailures === failed
        ? succeeded
          ? "partial_failure"
          : "failed"
        : "processing";
  const { data: latestJob } = await client
    .from("meta_bulk_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (latestJob?.status === "cancelled")
    return {
      id: jobId,
      status: "cancelled",
      total_items: total,
      succeeded_items: succeeded,
      failed_items: failed,
    };
  await client
    .from("meta_bulk_jobs")
    .update({
      status: finalStatus,
      processed_items: succeeded + terminalFailures,
      succeeded_items: succeeded,
      failed_items: failed,
      checkpoint: succeeded + terminalFailures,
      last_error:
        all?.find((row) => row.status === "failed")?.last_error ?? null,
      next_run_at: new Date(Date.now() + 60_000).toISOString(),
      completed_at: ["completed", "partial_failure", "failed"].includes(
        finalStatus,
      )
        ? new Date().toISOString()
        : null,
    })
    .eq("id", jobId);
  await client
    .from("meta_workflow_runs")
    .update({
      status: finalStatus,
      error: null,
      completed_at: ["completed", "partial_failure", "failed"].includes(
        finalStatus,
      )
        ? new Date().toISOString()
        : null,
    })
    .eq("bulk_job_id", jobId);
  return {
    id: jobId,
    status: finalStatus,
    total_items: total,
    succeeded_items: succeeded,
    failed_items: failed,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const body = (await req.json().catch(() => ({}))) as {
      scheduled?: boolean;
      action?: string;
      ad_account_id?: string;
      job_type?: string;
      idempotency_key?: string;
      configuration?: BulkLaunchConfiguration & JsonObject;
      items?: JsonObject[];
      job_id?: string;
      workflow_id?: string;
    };
    if (body.scheduled && isCronRequest(req)) {
      const { data: jobs } = await client
        .from("meta_bulk_jobs")
        .select("id")
        .in("status", ["queued", "processing"])
        .lte("next_run_at", new Date().toISOString())
        .order("created_at")
        .limit(5);
      const results = [];
      for (const job of jobs ?? []) {
        try {
          results.push(await processJob(client, String(job.id)));
        } catch (error) {
          results.push({
            id: job.id,
            status: "failed",
            error: sanitizeText(
              error instanceof Error ? error.message : "Bulk job failed",
            ),
          });
        }
      }
      return jsonResponse(req, { success: true, jobs: results });
    }
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    const connection = await activeConnection(client, workspaceId);
    if (body.action === "preview") {
      const preview = buildBulkLaunchPlan(body.configuration ?? {});
      return jsonResponse(req, {
        success: true,
        preview: { ...preview, items: undefined },
      });
    }
    if (body.action === "cancel") {
      const { error } = await client
        .from("meta_bulk_jobs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("id", body.job_id)
        .in("status", ["queued", "processing", "partial_failure"]);
      if (error) throw error;
      await client
        .from("meta_bulk_job_items")
        .update({ status: "cancelled" })
        .eq("workspace_id", workspaceId)
        .eq("job_id", body.job_id)
        .in("status", ["queued", "failed"]);
      await client
        .from("meta_workflow_runs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("bulk_job_id", body.job_id);
      return jsonResponse(req, { success: true });
    }
    if (body.action === "retry_failed") {
      await client
        .from("meta_bulk_job_items")
        .update({
          status: "queued",
          attempts: 0,
          next_retry_at: new Date().toISOString(),
          last_error: null,
          completed_at: null,
        })
        .eq("workspace_id", workspaceId)
        .eq("job_id", body.job_id)
        .eq("status", "failed");
      await client
        .from("meta_bulk_jobs")
        .update({
          status: "queued",
          next_run_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq("workspace_id", workspaceId)
        .eq("id", body.job_id);
      await client
        .from("meta_workflow_runs")
        .update({ status: "queued", error: null, completed_at: null })
        .eq("bulk_job_id", body.job_id);
      return jsonResponse(req, {
        success: true,
        job: await processJob(client, String(body.job_id)),
      });
    }
    if (body.action === "process") {
      const { data: owned } = await client
        .from("meta_bulk_jobs")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", body.job_id)
        .maybeSingle();
      if (!owned) throw new MetaError("Job not found", 404, "validation");
      return jsonResponse(req, {
        success: true,
        job: await processJob(client, String(body.job_id)),
      });
    }
    const accountId = await authorizedAccount(
      client,
      workspaceId,
      connection.id,
      body.ad_account_id ?? connection.row.default_ad_account_id,
    );
    const idempotencyKey = String(body.idempotency_key ?? "").trim();
    if (!/^[A-Za-z0-9:_-]{12,160}$/.test(idempotencyKey))
      throw new MetaError(
        "A stable idempotency key is required",
        400,
        "validation",
      );
    const jobType = String(body.job_type ?? "bulk_launch");
    const allowedTypes = [
      "bulk_launch",
      "bulk_edit",
      "duplicate",
      "vertical_scale",
      "horizontal_scale",
      "creative_scale",
    ];
    if (!allowedTypes.includes(jobType))
      throw new MetaError("Unsupported bulk job type", 400, "validation");
    let preview: JsonObject;
    let items: JsonObject[];
    const configuration = body.configuration ?? {};
    if (jobType === "bulk_launch") {
      const plan = buildBulkLaunchPlan(configuration);
      await authorizeLaunchConfiguration(
        client,
        workspaceId,
        connection.id,
        accountId,
        configuration,
      );
      preview = { ...plan, items: undefined };
      items = plan.items.map((item) => item as unknown as JsonObject);
    } else {
      items = body.items ?? [];
      if (!items.length || items.length > 1000)
        throw new MetaError(
          "Provide between 1 and 1000 selected items",
          400,
          "validation",
        );
      preview = { affected_objects: items.length, operation: jobType };
    }
    let workflow: JsonObject | null = null;
    if (body.workflow_id) {
      const { data } = await client
        .from("meta_workflows")
        .select("id,configuration")
        .eq("workspace_id", workspaceId)
        .eq("id", body.workflow_id)
        .maybeSingle();
      if (!data) throw new MetaError("Workflow not found", 404, "validation");
      workflow = data as JsonObject;
    }
    const { data: enqueued, error: enqueueError } = await client.rpc(
      "enqueue_meta_bulk_job",
      {
        p_workspace_id: workspaceId,
        p_connection_id: connection.id,
        p_ad_account_id: accountId,
        p_created_by: user.id,
        p_job_type: jobType,
        p_idempotency_key: idempotencyKey,
        p_create_status: status(configuration.create_status),
        p_configuration: configuration,
        p_preview: preview,
        p_items: items,
      },
    );
    if (enqueueError || !enqueued)
      throw enqueueError ?? new Error("Job could not be created");
    const enqueueResult = enqueued as {
      deduplicated?: boolean;
      job?: JsonObject;
    };
    const job = enqueueResult.job;
    if (!job?.id) throw new Error("Job could not be created");
    if (workflow) {
      await client.from("meta_workflow_runs").upsert(
        {
          workspace_id: workspaceId,
          workflow_id: workflow.id,
          bulk_job_id: job.id,
          input: configuration,
          resolved_configuration: configuration,
          status: "queued",
          created_by: user.id,
        },
        { onConflict: "bulk_job_id" },
      );
    }
    if (enqueueResult.deduplicated)
      return jsonResponse(req, { success: true, deduplicated: true, job });
    return jsonResponse(
      req,
      { success: true, job: await processJob(client, String(job.id)) },
      202,
    );
  } catch (error) {
    return errorResponse(req, error);
  }
});
