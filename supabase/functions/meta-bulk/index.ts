import {
  activeConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
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

async function authorizedAccount(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  accountValue: unknown,
): Promise<string> {
  const accountId = normalizeAdAccountId(accountValue);
  const { data } = await client
    .from("meta_ad_accounts")
    .select("meta_ad_account_id")
    .eq("workspace_id", workspaceId)
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

async function findByName(
  token: string,
  parent: string,
  edge: string,
  name: string,
): Promise<string | null> {
  const payload = await metaRequest<{
    data?: Array<{ id: string; name?: string }>;
  }>(`${parent}/${edge}`, {
    token,
    query: { fields: "id,name", limit: 500 },
    retries: 2,
  });
  return payload.data?.find((row) => row.name === name)?.id ?? null;
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
  const existing = await findByName(token, accountId, "campaigns", name);
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
  return result.id;
}

async function ensureAdset(
  token: string,
  accountId: string,
  campaignId: string,
  config: BulkLaunchConfiguration,
  plan: PlannedAd,
): Promise<string> {
  const candidate =
    config.adsets?.[plan.adset_index] ?? config.adsets?.[0] ?? {};
  if (candidate.id) return String(candidate.id);
  const name = replaceNamingVariables(
    config.naming?.adset ?? candidate.name ?? "Broad {PRODUCT_NAME} {INDEX}",
    { productName: config.product_name, index: plan.adset_index },
  );
  const existing = await findByName(token, accountId, "adsets", name);
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
  return result.id;
}

async function ensureCreative(
  token: string,
  accountId: string,
  config: BulkLaunchConfiguration,
  plan: PlannedAd,
): Promise<string> {
  const creative = config.creatives?.[plan.creative_index] ?? {};
  const name = replaceNamingVariables(
    config.naming?.creative ?? "{CREATIVE_NAME} {INDEX}",
    {
      productName: config.product_name,
      index: plan.creative_index,
      creativeName: creative.name,
    },
  );
  const existing = await findByName(token, accountId, "adcreatives", name);
  if (existing) return existing;
  let imageHash = creative.image_hash;
  let videoId = creative.video_id;
  if (!imageHash && !videoId && creative.source_url) {
    if (creative.media_type === "video")
      videoId = (
        await metaUploadVideo(token, accountId, creative.source_url, name)
      ).id;
    else
      imageHash = (
        await metaUploadImage(
          token,
          accountId,
          creative.source_url,
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
  return result.id;
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
    campaignId = await ensureCampaign(
      token,
      accountId,
      config,
      String(job.id),
    );
    adsetId = await ensureAdset(
      token,
      accountId,
      campaignId,
      config,
      plan,
    );
  }
  const creativeId = await ensureCreative(token, accountId, config, plan);
  const creative = config.creatives?.[plan.creative_index] ?? {};
  const adName = replaceNamingVariables(
    config.naming?.ad ?? "{PRODUCT_NAME} {CREATIVE_NAME} {INDEX}",
    {
      productName: config.product_name,
      index: plan.index,
      creativeName: creative.name,
    },
  );
  const existing = await findByName(token, adsetId, "ads", adName);
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
  await client
    .from("meta_campaigns")
    .upsert(
      {
        workspace_id: job.workspace_id,
        ad_account_id: accountId,
        meta_campaign_id: campaignId,
        name: config.campaign?.name ?? "Bulk campaign",
        campaign_name: config.campaign?.name ?? "Bulk campaign",
        status: status(config.create_status),
        objective: config.campaign?.objective ?? "OUTCOME_SALES",
      },
      { onConflict: "workspace_id,ad_account_id,meta_campaign_id" },
    );
  await client
    .from("meta_adsets")
    .upsert(
      {
        workspace_id: job.workspace_id,
        ad_account_id: accountId,
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId,
        name:
          config.adsets?.[plan.adset_index]?.name ??
          `Ad set ${plan.adset_index + 1}`,
        status: status(config.create_status),
        targeting_summary: config.adsets?.[plan.adset_index]?.targeting ?? {},
      },
      { onConflict: "workspace_id,ad_account_id,meta_adset_id" },
    );
  await client
    .from("meta_ads")
    .upsert(
      {
        workspace_id: job.workspace_id,
        ad_account_id: accountId,
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId,
        meta_ad_id: adId,
        meta_creative_id: creativeId,
        name: adName,
        status: status(config.create_status),
        destination_url:
          String((config as JsonObject).destination_url ?? "") || null,
      },
      { onConflict: "workspace_id,ad_account_id,meta_ad_id" },
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
  await assertOwnedEntity(
    client,
    job,
    String(payload.entity_type ?? item.item_type ?? ""),
    id,
  );
  const operation = String(payload.operation ?? "set_status");
  if (operation === "duplicate") {
    const result = await metaRequest<JsonObject>(`${id}/copies`, {
      token,
      method: "POST",
      body: {
        status_option: status(payload.status),
        deep_copy: payload.deep_copy !== false,
        rename_options: {
          rename_strategy: "DEEP_RENAME",
          rename_prefix: String(payload.name_prefix ?? "Copy "),
        },
      },
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
  if (!job || job.status === "cancelled" || job.status === "completed")
    return job;
  const connection = await activeConnection(client, String(job.workspace_id));
  const now = new Date().toISOString();
  await client
    .from("meta_bulk_job_items")
    .update({ status: "failed", next_retry_at: now, last_error: "Recovered interrupted worker item" })
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
  await client.from("meta_workflow_runs").update({ status: finalStatus, completed_at: ["completed", "partial_failure", "failed"].includes(finalStatus) ? new Date().toISOString() : null }).eq("bulk_job_id", jobId);
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
      const retryable = error instanceof MetaError ? error.retryable : true;
      const terminal = !retryable || attempts >= Number(job.max_attempts ?? 5);
      await client
        .from("meta_bulk_job_items")
        .update({
          status: "failed",
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
    .select("status,attempts")
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
  await client
    .from("meta_bulk_jobs")
    .update({
      status: finalStatus,
      processed_items: succeeded + terminalFailures,
      succeeded_items: succeeded,
      failed_items: failed,
      checkpoint: succeeded + terminalFailures,
      next_run_at: new Date(Date.now() + 60_000).toISOString(),
      completed_at: ["completed", "partial_failure", "failed"].includes(
        finalStatus,
      )
        ? new Date().toISOString()
        : null,
    })
    .eq("id", jobId);
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
        .in("status", ["queued", "processing", "partial_failure"])
        .lte("next_run_at", new Date().toISOString())
        .order("created_at")
        .limit(5);
      const results = [];
      for (const job of jobs ?? [])
        results.push(await processJob(client, String(job.id)));
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
      const { data } = await client.from("meta_workflows").select("id,configuration").eq("workspace_id", workspaceId).eq("id", body.workflow_id).maybeSingle();
      if (!data) throw new MetaError("Workflow not found", 404, "validation");
      workflow = data as JsonObject;
    }
    const { data: enqueued, error: enqueueError } = await client.rpc("enqueue_meta_bulk_job", {
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
    });
    if (enqueueError || !enqueued) throw enqueueError ?? new Error("Job could not be created");
    const enqueueResult = enqueued as { deduplicated?: boolean; job?: JsonObject };
    const job = enqueueResult.job;
    if (!job?.id) throw new Error("Job could not be created");
    if (workflow) {
      await client.from("meta_workflow_runs").upsert({ workspace_id: workspaceId, workflow_id: workflow.id, bulk_job_id: job.id, input: configuration, resolved_configuration: configuration, status: "queued", created_by: user.id }, { onConflict: "bulk_job_id" });
    }
    if (enqueueResult.deduplicated) return jsonResponse(req, { success: true, deduplicated: true, job });
    return jsonResponse(
      req,
      { success: true, job: await processJob(client, String(job.id)) },
      202,
    );
  } catch (error) {
    return errorResponse(req, error);
  }
});
