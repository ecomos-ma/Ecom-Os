import {
  activeConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  jsonResponse,
  MetaError,
  metaRequest,
  metaUploadImage,
  metaUploadVideo,
  normalizeAdAccountId,
  resolveActiveWorkspace,
  serviceClient,
  writeActionLog,
  type JsonObject,
} from "../_shared/meta.ts";

type EntityType = "campaign" | "adset" | "ad" | "creative";

const entityConfig: Record<EntityType, { table: string; id: string }> = {
  campaign: { table: "meta_campaigns", id: "meta_campaign_id" },
  adset: { table: "meta_adsets", id: "meta_adset_id" },
  ad: { table: "meta_ads", id: "meta_ad_id" },
  creative: { table: "meta_creatives", id: "meta_creative_id" },
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function cleanName(value: unknown, fallback: string): string {
  const name = String(value ?? "").trim();
  if (!name || name.length > 240)
    throw new MetaError(
      `${fallback} name is required and must be at most 240 characters`,
      400,
      "validation",
    );
  return name;
}
function status(value: unknown): "PAUSED" | "ACTIVE" {
  return String(value ?? "PAUSED").toUpperCase() === "ACTIVE"
    ? "ACTIVE"
    : "PAUSED";
}
function minor(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1)
    throw new MetaError(
      "Budget must be at least 1 in the ad account currency",
      400,
      "validation",
    );
  return Math.round(amount * 100);
}

async function assertAccount(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  value: unknown,
): Promise<string> {
  const accountId = normalizeAdAccountId(value);
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

async function assertEntity(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  accountId: string,
  type: EntityType,
  id: unknown,
) {
  const config = entityConfig[type];
  const entityId = String(id ?? "").trim();
  if (!entityId)
    throw new MetaError(`${type} ID is required`, 400, "validation");
  const { data, error } = await client
    .from(config.table)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("ad_account_id", accountId)
    .eq(config.id, entityId)
    .maybeSingle();
  if (error || !data)
    throw new MetaError(
      `${type} is not available in this workspace`,
      403,
      "permission",
    );
  return data as JsonObject;
}

async function assertAsset(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  table: string,
  idColumn: string,
  value: unknown,
  accountId?: string,
): Promise<string> {
  const id = String(value ?? "").trim();
  if (!id)
    throw new MetaError(
      `${idColumn.replace("meta_", "").replaceAll("_", " ")} is required`,
      400,
      "validation",
    );
  let query = client
    .from(table)
    .select(idColumn)
    .eq("workspace_id", workspaceId)
    .eq("connection_id", connectionId)
    .eq(idColumn, id);
  if (accountId && table === "meta_pixels")
    query = query.eq("ad_account_id", accountId);
  const { data } = await query.maybeSingle();
  if (!data)
    throw new MetaError(
      "Selected Meta asset is not authorized for this workspace",
      403,
      "permission",
    );
  return id;
}

async function confirmedWrite<T extends JsonObject>(
  client: ReturnType<typeof serviceClient>,
  input: {
    workspaceId: string;
    userId: string;
    token: string;
    action: string;
    entityType: EntityType;
    entityId?: string;
    path: string;
    body: JsonObject;
    before?: JsonObject;
    mirror: (response: T) => Promise<void>;
  },
): Promise<T> {
  try {
    const response = await metaRequest<T>(input.path, {
      token: input.token,
      method: "POST",
      body: input.body,
    });
    if (!(response.success === true || response.id))
      throw new MetaError(
        "Meta did not confirm the change",
        502,
        "temporary",
        true,
      );
    await input.mirror(response);
    await writeActionLog(client, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      source: "user",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? String(response.id ?? ""),
      before: input.before,
      after: input.body,
      result: "success",
    });
    return response;
  } catch (error) {
    await writeActionLog(client, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      source: "user",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.body,
      result: "failed",
      error: error as Error,
    });
    throw error;
  }
}

async function mirrorDuplicate(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  accountId: string,
  type: Exclude<EntityType, "creative">,
  source: JsonObject,
  copiedId: string,
  desiredStatus: "PAUSED" | "ACTIVE",
  namePrefix: string,
): Promise<void> {
  const config = entityConfig[type];
  const clone: JsonObject = { ...source };
  for (const key of ["id", "created_at", "updated_at", "synced_at"])
    delete clone[key];
  clone.workspace_id = workspaceId;
  clone.ad_account_id = accountId;
  clone[config.id] = copiedId;
  clone.name =
    `${namePrefix}${String(source.name ?? source.campaign_name ?? "Copy")}`.slice(
      0,
      240,
    );
  if (type === "campaign") clone.campaign_name = clone.name;
  clone.status = desiredStatus;
  clone.effective_status = null;
  clone.raw_data = { copied_from: source[config.id] };
  const { error } = await client.from(config.table).upsert(clone, {
    onConflict: `workspace_id,ad_account_id,${config.id}`,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    const request = (await req.json()) as {
      action?: string;
      entity_type?: EntityType;
      entity_id?: string;
      ad_account_id?: string;
      payload?: JsonObject;
      idempotency_key?: string;
    };
    const action = String(request.action ?? "");
    const payload = object(request.payload);

    if (
      [
        "save_workflow",
        "duplicate_workflow",
        "delete_workflow",
        "save_rule",
        "delete_rule",
      ].includes(action)
    ) {
      if (action === "delete_workflow" || action === "delete_rule") {
        const table =
          action === "delete_workflow" ? "meta_workflows" : "meta_rules";
        const { error } = await client
          .from(table)
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("id", request.entity_id);
        if (error) throw error;
        return jsonResponse(req, { success: true });
      }
      if (action === "duplicate_workflow") {
        const { data: existing } = await client
          .from("meta_workflows")
          .select("name,description,configuration")
          .eq("workspace_id", workspaceId)
          .eq("id", request.entity_id)
          .maybeSingle();
        if (!existing)
          throw new MetaError("Workflow not found", 404, "validation");
        const { data, error } = await client
          .from("meta_workflows")
          .insert({
            workspace_id: workspaceId,
            created_by: user.id,
            name: `${existing.name} Copy`,
            description: existing.description,
            configuration: existing.configuration,
          })
          .select("*")
          .single();
        if (error) throw error;
        return jsonResponse(req, { success: true, item: data });
      }
      const table =
        action === "save_workflow" ? "meta_workflows" : "meta_rules";
      const allowed =
        action === "save_workflow"
          ? ["name", "description", "configuration", "is_template"]
          : [
              "name",
              "entity_level",
              "conditions",
              "action",
              "schedule_minutes",
              "lookback_days",
              "stale_after_minutes",
              "max_budget_increase_percent_day",
              "max_duplicates_day",
              "dry_run",
              "enabled",
            ];
      const values = Object.fromEntries(
        Object.entries(payload).filter(([key]) => allowed.includes(key)),
      );
      if (!values.name)
        throw new MetaError("Name is required", 400, "validation");
      const row = { ...values, workspace_id: workspaceId, created_by: user.id };
      const query = request.entity_id
        ? client
            .from(table)
            .update(values)
            .eq("workspace_id", workspaceId)
            .eq("id", request.entity_id)
        : client.from(table).insert(row);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return jsonResponse(req, { success: true, item: data });
    }

    const connection = await activeConnection(client, workspaceId);
    const accountId = await assertAccount(
      client,
      workspaceId,
      connection.id,
      request.ad_account_id ?? connection.row.default_ad_account_id,
    );

    if (action === "upload_creative") {
      const sourceUrl = String(payload.source_url ?? "");
      if (!/^https:\/\//i.test(sourceUrl))
        throw new MetaError(
          "A secure creative source URL is required",
          400,
          "validation",
        );
      const mediaType = String(payload.media_type ?? "image");
      const result =
        mediaType === "video"
          ? await metaUploadVideo(
              connection.accessToken,
              accountId,
              sourceUrl,
              workspaceId,
              String(payload.name ?? "Creative video"),
            )
          : await metaUploadImage(
              connection.accessToken,
              accountId,
              sourceUrl,
              workspaceId,
              String(payload.filename ?? "creative.jpg"),
            );
      return jsonResponse(req, { success: true, ...result });
    }

    if (action === "create_campaign") {
      const name = cleanName(payload.name, "Campaign");
      const createStatus = status(payload.status);
      const body: JsonObject = {
        name,
        objective: String(payload.objective ?? "OUTCOME_SALES"),
        status: createStatus,
        special_ad_categories: Array.isArray(payload.special_ad_categories)
          ? payload.special_ad_categories
          : [],
      };
      const dailyBudget = minor(payload.daily_budget);
      const lifetimeBudget = minor(payload.lifetime_budget);
      if (dailyBudget) body.daily_budget = dailyBudget;
      if (lifetimeBudget) body.lifetime_budget = lifetimeBudget;
      const response = await confirmedWrite<{ id: string }>(client, {
        workspaceId,
        userId: user.id,
        token: connection.accessToken,
        action,
        entityType: "campaign",
        path: `${accountId}/campaigns`,
        body,
        mirror: async (meta) => {
          const { error } = await client.from("meta_campaigns").upsert(
            {
              workspace_id: workspaceId,
              ad_account_id: accountId,
              meta_campaign_id: meta.id,
              name,
              campaign_name: name,
              status: createStatus,
              objective: body.objective,
              special_ad_categories: body.special_ad_categories,
              daily_budget: payload.daily_budget ?? null,
              lifetime_budget: payload.lifetime_budget ?? null,
              raw_data: meta,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id,ad_account_id,meta_campaign_id" },
          );
          if (error) throw error;
        },
      });
      return jsonResponse(req, { success: true, id: response.id });
    }

    if (action === "create_adset") {
      const campaign = await assertEntity(
        client,
        workspaceId,
        accountId,
        "campaign",
        payload.campaign_id,
      );
      const name = cleanName(payload.name, "Ad set");
      const createStatus = status(payload.status);
      const body: JsonObject = {
        name,
        campaign_id: campaign.meta_campaign_id,
        billing_event: String(payload.billing_event ?? "IMPRESSIONS"),
        optimization_goal: String(
          payload.optimization_goal ?? "OFFSITE_CONVERSIONS",
        ),
        bid_strategy: String(payload.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP"),
        targeting: object(payload.targeting),
        status: createStatus,
      };
      const dailyBudget = minor(payload.daily_budget);
      const lifetimeBudget = minor(payload.lifetime_budget);
      if (dailyBudget) body.daily_budget = dailyBudget;
      if (lifetimeBudget) body.lifetime_budget = lifetimeBudget;
      if (payload.start_time) body.start_time = payload.start_time;
      if (payload.end_time) body.end_time = payload.end_time;
      if (payload.pixel_id)
        body.promoted_object = {
          pixel_id: await assertAsset(
            client,
            workspaceId,
            connection.id,
            "meta_pixels",
            "meta_pixel_id",
            payload.pixel_id,
            accountId,
          ),
          custom_event_type: String(payload.conversion_event ?? "PURCHASE"),
        };
      const response = await confirmedWrite<{ id: string }>(client, {
        workspaceId,
        userId: user.id,
        token: connection.accessToken,
        action,
        entityType: "adset",
        path: `${accountId}/adsets`,
        body,
        mirror: async (meta) => {
          const { error } = await client.from("meta_adsets").upsert(
            {
              workspace_id: workspaceId,
              ad_account_id: accountId,
              meta_campaign_id: String(campaign.meta_campaign_id),
              meta_adset_id: meta.id,
              name,
              status: createStatus,
              optimization_goal: body.optimization_goal,
              billing_event: body.billing_event,
              bid_strategy: body.bid_strategy,
              daily_budget: payload.daily_budget ?? null,
              lifetime_budget: payload.lifetime_budget ?? null,
              targeting_summary: body.targeting,
              promoted_object: body.promoted_object ?? {},
              raw_data: meta,
            },
            { onConflict: "workspace_id,ad_account_id,meta_adset_id" },
          );
          if (error) throw error;
        },
      });
      return jsonResponse(req, { success: true, id: response.id });
    }

    if (action === "create_creative") {
      const name = cleanName(payload.name, "Creative");
      const pageId = await assertAsset(
        client,
        workspaceId,
        connection.id,
        "meta_pages",
        "meta_page_id",
        payload.page_id ?? connection.row.default_page_id,
      );
      const instagramId = payload.instagram_account_id
        ? await assertAsset(
            client,
            workspaceId,
            connection.id,
            "meta_instagram_accounts",
            "meta_instagram_account_id",
            payload.instagram_account_id,
          )
        : null;
      const destination = String(payload.destination_url ?? "");
      if (!/^https?:\/\//i.test(destination))
        throw new MetaError(
          "A valid destination URL is required",
          400,
          "validation",
        );
      const attachment = payload.video_id
        ? {
            video_id: String(payload.video_id),
            message: String(payload.primary_text ?? ""),
            title: String(payload.headline ?? ""),
            link_description: String(payload.description ?? ""),
            call_to_action: {
              type: String(payload.call_to_action ?? "SHOP_NOW"),
              value: { link: destination },
            },
          }
        : {
            image_hash: String(payload.image_hash ?? ""),
            link: destination,
            message: String(payload.primary_text ?? ""),
            name: String(payload.headline ?? ""),
            description: String(payload.description ?? ""),
            call_to_action: {
              type: String(payload.call_to_action ?? "SHOP_NOW"),
              value: { link: destination },
            },
          };
      if (!payload.video_id && !payload.image_hash)
        throw new MetaError(
          "An uploaded image hash or video ID is required",
          400,
          "validation",
        );
      const story: JsonObject = {
        page_id: pageId,
        ...(instagramId ? { instagram_actor_id: instagramId } : {}),
        [payload.video_id ? "video_data" : "link_data"]: attachment,
      };
      const body = { name, object_story_spec: story };
      const response = await confirmedWrite<{ id: string }>(client, {
        workspaceId,
        userId: user.id,
        token: connection.accessToken,
        action,
        entityType: "creative",
        path: `${accountId}/adcreatives`,
        body,
        mirror: async (meta) => {
          const { error } = await client.from("meta_creatives").upsert(
            {
              workspace_id: workspaceId,
              ad_account_id: accountId,
              meta_creative_id: meta.id,
              name,
              creative_type: payload.video_id ? "video" : "image",
              image_hash: payload.image_hash ?? null,
              video_id: payload.video_id ?? null,
              primary_text: payload.primary_text ?? null,
              headline: payload.headline ?? null,
              description: payload.description ?? null,
              call_to_action: payload.call_to_action ?? "SHOP_NOW",
              destination_url: destination,
              product_url: destination,
              page_id: pageId,
              instagram_account_id: instagramId,
              object_story_spec: story,
              raw_data: meta,
            },
            { onConflict: "workspace_id,ad_account_id,meta_creative_id" },
          );
          if (error) throw error;
        },
      });
      return jsonResponse(req, { success: true, id: response.id });
    }

    if (action === "create_ad") {
      const adset = await assertEntity(
        client,
        workspaceId,
        accountId,
        "adset",
        payload.adset_id,
      );
      const creative = await assertEntity(
        client,
        workspaceId,
        accountId,
        "creative",
        payload.creative_id,
      );
      const name = cleanName(payload.name, "Ad");
      const createStatus = status(payload.status);
      const body = {
        name,
        adset_id: String(adset.meta_adset_id),
        creative: { creative_id: String(creative.meta_creative_id) },
        status: createStatus,
        ...(payload.url_tags ? { url_tags: String(payload.url_tags) } : {}),
      };
      const response = await confirmedWrite<{ id: string }>(client, {
        workspaceId,
        userId: user.id,
        token: connection.accessToken,
        action,
        entityType: "ad",
        path: `${accountId}/ads`,
        body,
        mirror: async (meta) => {
          const { error } = await client.from("meta_ads").upsert(
            {
              workspace_id: workspaceId,
              ad_account_id: accountId,
              meta_campaign_id: String(adset.meta_campaign_id),
              meta_adset_id: String(adset.meta_adset_id),
              meta_ad_id: meta.id,
              meta_creative_id: String(creative.meta_creative_id),
              name,
              status: createStatus,
              destination_url: creative.destination_url ?? null,
              raw_data: meta,
            },
            { onConflict: "workspace_id,ad_account_id,meta_ad_id" },
          );
          if (error) throw error;
        },
      });
      return jsonResponse(req, { success: true, id: response.id });
    }

    if (["update", "set_status", "set_budget", "duplicate"].includes(action)) {
      const type = request.entity_type;
      if (!type || type === "creative")
        throw new MetaError(
          "A campaign, ad set, or ad is required",
          400,
          "validation",
        );
      const before = await assertEntity(
        client,
        workspaceId,
        accountId,
        type,
        request.entity_id,
      );
      const id = String(before[entityConfig[type].id]);
      if (action === "duplicate") {
        const copies = Math.min(
          20,
          Math.max(1, Number(payload.copy_count ?? 1)),
        );
        const ids: string[] = [];
        const desiredStatus = status(payload.status);
        const namePrefix = String(payload.name_prefix ?? "Copy ");
        try {
          for (let index = 0; index < copies; index += 1) {
            const result = await metaRequest<{
              copied_campaign_id?: string;
              copied_adset_id?: string;
              copied_ad_id?: string;
            }>(`${id}/copies`, {
              token: connection.accessToken,
              method: "POST",
              body: {
                status_option: desiredStatus,
                deep_copy: payload.deep_copy !== false,
                rename_options: {
                  rename_strategy: "DEEP_RENAME",
                  rename_prefix: namePrefix,
                },
              },
            });
            const copied =
              result.copied_campaign_id ??
              result.copied_adset_id ??
              result.copied_ad_id;
            if (!copied)
              throw new MetaError(
                "Meta did not confirm a duplicate",
                502,
                "temporary",
                true,
              );
            await mirrorDuplicate(
              client,
              workspaceId,
              accountId,
              type,
              before,
              copied,
              desiredStatus,
              namePrefix,
            );
            ids.push(copied);
          }
          await writeActionLog(client, {
            workspaceId,
            actorUserId: user.id,
            source: "user",
            action,
            entityType: type,
            entityId: id,
            before,
            after: { copies: ids },
            result: "success",
          });
          return jsonResponse(req, { success: true, ids });
        } catch (error) {
          await writeActionLog(client, {
            workspaceId,
            actorUserId: user.id,
            source: "user",
            action,
            entityType: type,
            entityId: id,
            before,
            after: { copies: ids },
            result: "failed",
            error: error as Error,
          });
          throw error;
        }
      }
      const body: JsonObject = {};
      if (action === "set_status") body.status = status(payload.status);
      else if (action === "set_budget") {
        const daily = minor(payload.daily_budget);
        const lifetime = minor(payload.lifetime_budget);
        if (daily) body.daily_budget = daily;
        else if (lifetime) body.lifetime_budget = lifetime;
        else throw new MetaError("A budget is required", 400, "validation");
      } else {
        for (const key of [
          "name",
          "status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "targeting",
          "bid_amount",
          "bid_strategy",
          "optimization_goal",
          "billing_event",
          "start_time",
          "end_time",
          "url_tags",
        ])
          if (payload[key] !== undefined)
            body[key] = [
              "daily_budget",
              "lifetime_budget",
              "bid_amount",
            ].includes(key)
              ? minor(payload[key])
              : payload[key];
      }
      await confirmedWrite<{ success: boolean }>(client, {
        workspaceId,
        userId: user.id,
        token: connection.accessToken,
        action,
        entityType: type,
        entityId: id,
        path: id,
        body,
        before,
        mirror: async () => {
          const mirror: JsonObject = {};
          for (const [key, value] of Object.entries(body))
            mirror[
              key === "name" && type === "campaign" ? "campaign_name" : key
            ] = ["daily_budget", "lifetime_budget", "bid_amount"].includes(key)
              ? Number(value) / 100
              : value;
          if (body.name && type === "campaign") mirror.name = body.name;
          const { error } = await client
            .from(entityConfig[type].table)
            .update(mirror)
            .eq("workspace_id", workspaceId)
            .eq("ad_account_id", accountId)
            .eq(entityConfig[type].id, id);
          if (error) throw error;
        },
      });
      return jsonResponse(req, { success: true });
    }
    return jsonResponse(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    return errorResponse(req, error);
  }
});
