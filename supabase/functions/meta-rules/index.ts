import {
  activeConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  isCronRequest,
  jsonResponse,
  MetaError,
  metaRequest,
  resolveActiveWorkspace,
  serviceClient,
  writeActionLog,
  type JsonObject,
} from "../_shared/meta.ts";
import {
  cappedBudgetIncrease,
  evaluateRuleConditions,
  isStale,
  type RuleCondition,
} from "../_shared/meta-rules-core.ts";

function value(rows: unknown, names: string[]): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce(
    (sum, row) =>
      row &&
      typeof row === "object" &&
      names.includes(String((row as JsonObject).action_type ?? ""))
        ? sum + Number((row as JsonObject).value ?? 0)
        : sum,
    0,
  );
}

function nextEvaluationAt(rule: JsonObject): string {
  return new Date(
    Date.now() + Number(rule.schedule_minutes ?? 60) * 60_000,
  ).toISOString();
}

async function runRule(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  rule: JsonObject,
  actorUserId?: string | null,
  forceDryRun?: boolean,
) {
  const started = new Date().toISOString();
  const dryRun = forceDryRun === true || rule.dry_run === true;
  const { data: run, error: runError } = await client
    .from("meta_rule_runs")
    .insert({
      workspace_id: workspaceId,
      rule_id: rule.id,
      status: dryRun ? "dry_run" : "running",
      started_at: started,
    })
    .select("id")
    .single();
  if (runError || !run)
    throw runError ?? new Error("Rule run could not be created");
  try {
    const connection = await activeConnection(client, workspaceId);
    if (!dryRun && connection.row.automation_enabled !== true) {
      await client
        .from("meta_rule_runs")
        .update({
          status: "skipped",
          summary: { reason: "global_automation_kill_switch" },
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await client
        .from("meta_rules")
        .update({
          last_evaluated_at: new Date().toISOString(),
          next_evaluation_at: nextEvaluationAt(rule),
        })
        .eq("id", rule.id);
      return {
        id: run.id,
        status: "skipped",
        reason: "Global automation is disabled",
      };
    }
    const staleAfter = Number(rule.stale_after_minutes ?? 180);
    const latest = connection.row.last_successful_sync_at
      ? String(connection.row.last_successful_sync_at)
      : null;
    if (isStale(latest, staleAfter)) {
      await client
        .from("meta_rule_runs")
        .update({
          status: "skipped",
          stale_data_guard_triggered: true,
          summary: { reason: "stale_data", latest_sync: latest },
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await client
        .from("meta_rules")
        .update({
          last_evaluated_at: new Date().toISOString(),
          next_evaluation_at: nextEvaluationAt(rule),
        })
        .eq("id", rule.id);
      return { id: run.id, status: "skipped", reason: "Stale-data guard" };
    }
    const level = String(rule.entity_level ?? "ad");
    const insightLevel = ["campaign", "adset", "ad"].includes(level)
      ? level
      : "ad";
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - Number(rule.lookback_days ?? 3) + 1);
    const sinceDate = since.toISOString().slice(0, 10);
    const untilDate = new Date().toISOString().slice(0, 10);
    const { data: insights, error: insightsError } = await client
      .from("meta_insights_daily")
      .select(
        "entity_id,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchases,purchase_value,leads,synced_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("reporting_level", insightLevel)
      .gte("report_date", sinceDate)
      .lte("report_date", untilDate);
    if (insightsError) throw insightsError;
    const { data: codData } = await client.rpc("get_meta_cod_metrics", {
      p_workspace_id: workspaceId,
      p_since: sinceDate,
      p_until: untilDate,
    });
    let cod = (codData && typeof codData === "object" ? codData : {}) as Record<
      string,
      JsonObject
    >;
    let metricsByEntity = new Map<string, JsonObject>();
    for (const row of insights ?? []) {
      const id = String(row.entity_id);
      const current = metricsByEntity.get(id) ?? {
        spend: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        purchase_value: 0,
        leads: 0,
        frequency_weighted: 0,
      };
      current.spend = Number(current.spend) + Number(row.spend ?? 0);
      current.reach = Number(current.reach) + Number(row.reach ?? 0);
      current.impressions =
        Number(current.impressions) + Number(row.impressions ?? 0);
      current.clicks = Number(current.clicks) + Number(row.clicks ?? 0);
      current.purchases =
        Number(current.purchases) +
        Number(
          row.purchases ?? value(row.actions, ["purchase", "omni_purchase"]),
        );
      current.purchase_value =
        Number(current.purchase_value) +
        Number(
          row.purchase_value ??
            value(row.action_values, ["purchase", "omni_purchase"]),
        );
      current.leads = Number(current.leads) + Number(row.leads ?? 0);
      current.frequency_weighted =
        Number(current.frequency_weighted) +
        Number(row.frequency ?? 0) * Number(row.impressions ?? 0);
      metricsByEntity.set(id, current);
    }
    let table =
      insightLevel === "campaign"
        ? "meta_campaigns"
        : insightLevel === "adset"
          ? "meta_adsets"
          : "meta_ads";
    let idColumn =
      insightLevel === "campaign"
        ? "meta_campaign_id"
        : insightLevel === "adset"
          ? "meta_adset_id"
          : "meta_ad_id";
    const { data: baseEntities } = await client
      .from(table)
      .select("*")
      .eq("workspace_id", workspaceId);
    let entities = (baseEntities ?? []) as JsonObject[];
    const groupedLevel = level === "creative" || level === "product";
    if (groupedLevel) {
      const adRows = entities;
      const productIds =
        level === "product"
          ? [
              ...new Set(
                adRows.map((ad) => String(ad.product_id ?? "")).filter(Boolean),
              ),
            ]
          : [];
      const { data: productRows } = productIds.length
        ? await client
            .from("products")
            .select("id,name,sku,stock")
            .eq("workspace_id", workspaceId)
            .in("id", productIds)
        : { data: [] as JsonObject[] };
      const products = new Map<string, JsonObject>(
        ((productRows ?? []) as JsonObject[]).map((product) => [
          String(product.id),
          product,
        ]),
      );
      const groupedMetrics = new Map<string, JsonObject>();
      const groupedCod: Record<string, JsonObject> = {};
      const groupedEntities = new Map<string, JsonObject>();
      for (const ad of adRows) {
        const groupId = String(
          level === "creative"
            ? (ad.meta_creative_id ?? "")
            : (ad.product_id ?? ""),
        );
        const adId = String(ad.meta_ad_id ?? "");
        if (!groupId || !adId) continue;
        const product = products.get(groupId);
        const entity = groupedEntities.get(groupId) ?? {
          group_entity_id: groupId,
          name:
            level === "product"
              ? String(product?.name ?? product?.sku ?? groupId)
              : `Creative ${groupId}`,
          stock: level === "product" ? Number(product?.stock ?? 0) : null,
          _action_target_ids: [],
        };
        (entity._action_target_ids as string[]).push(adId);
        groupedEntities.set(groupId, entity);
        const sourceMeta = metricsByEntity.get(adId) ?? {};
        const targetMeta = groupedMetrics.get(groupId) ?? {
          spend: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          purchase_value: 0,
          leads: 0,
          frequency_weighted: 0,
        };
        for (const key of [
          "spend",
          "reach",
          "impressions",
          "clicks",
          "purchases",
          "purchase_value",
          "leads",
          "frequency_weighted",
        ])
          targetMeta[key] =
            Number(targetMeta[key] ?? 0) + Number(sourceMeta[key] ?? 0);
        groupedMetrics.set(groupId, targetMeta);
        const sourceCod = cod[adId] ?? {};
        const targetCod = groupedCod[groupId] ?? {
          orders: 0,
          confirmed: 0,
          shipped: 0,
          delivered: 0,
          returned: 0,
          revenue: 0,
          net_profit: 0,
          attribution_reliable: true,
        };
        for (const key of [
          "orders",
          "confirmed",
          "shipped",
          "delivered",
          "returned",
          "revenue",
          "net_profit",
        ])
          targetCod[key] =
            Number(targetCod[key] ?? 0) + Number(sourceCod[key] ?? 0);
        groupedCod[groupId] = targetCod;
      }
      metricsByEntity = groupedMetrics;
      cod = groupedCod;
      entities = [...groupedEntities.values()];
      table = "meta_ads";
      idColumn = "group_entity_id";
    }
    let matched = 0;
    let actions = 0;
    const results: JsonObject[] = [];
    for (const entity of entities ?? []) {
      const id = String(entity[idColumn]);
      const actionTargetIds = groupedLevel
        ? ((entity._action_target_ids as string[] | undefined) ?? [])
        : [id];
      const meta = metricsByEntity.get(id) ?? {
        spend: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        purchase_value: 0,
        leads: 0,
        frequency_weighted: 0,
      };
      const orders = cod[id] ?? {};
      const spend = Number(meta.spend);
      const clicks = Number(meta.clicks);
      const impressions = Number(meta.impressions);
      const delivered = Number(orders.delivered ?? 0);
      const orderCount = Number(orders.orders ?? 0);
      const revenue = Number(orders.revenue ?? 0);
      const netProfit =
        orders.net_profit == null ? null : Number(orders.net_profit) - spend;
      const metrics: JsonObject = {
        ...meta,
        ...orders,
        net_profit: netProfit,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpc: clicks ? spend / clicks : 0,
        cpm: impressions ? (spend / impressions) * 1000 : 0,
        frequency: impressions
          ? Number(meta.frequency_weighted) / impressions
          : 0,
        cpa: orderCount ? spend / orderCount : null,
        delivered_roas: spend ? revenue / spend : null,
        delivery_rate: orderCount ? (delivered / orderCount) * 100 : null,
        profit: netProfit,
        stock: entity.stock ?? null,
      };
      if (
        !evaluateRuleConditions(
          metrics,
          Array.isArray(rule.conditions)
            ? (rule.conditions as RuleCondition[])
            : [],
        )
      )
        continue;
      matched += 1;
      const action =
        rule.action && typeof rule.action === "object"
          ? (rule.action as JsonObject)
          : {};
      const actionType = String(action.type ?? "alert");
      const reason = `Rule ${String(rule.name)} matched: ${JSON.stringify(rule.conditions)}`;
      if (dryRun || actionType === "alert") {
        await writeActionLog(client, {
          workspaceId,
          actorUserId,
          source: "rule",
          sourceId: String(rule.id),
          action: actionType,
          entityType: level,
          entityId: id,
          reason,
          before: entity,
          after: metrics,
          result: dryRun ? "dry_run" : "success",
        });
        results.push({ entity_id: id, action: actionType, dry_run: dryRun });
        continue;
      }
      let actionAfter: JsonObject = action;
      try {
        if (actionType === "pause" || actionType === "activate") {
          const desired = actionType === "pause" ? "PAUSED" : "ACTIVE";
          for (const targetId of actionTargetIds) {
            const response = await metaRequest<{ success?: boolean }>(
              targetId,
              {
                token: connection.accessToken,
                method: "POST",
                body: { status: desired },
              },
            );
            if (!response.success)
              throw new MetaError(
                "Meta did not confirm rule action",
                502,
                "temporary",
                true,
              );
          }
          await client
            .from(table)
            .update({ status: desired })
            .eq("workspace_id", workspaceId)
            .in(groupedLevel ? "meta_ad_id" : idColumn, actionTargetIds);
        } else if (actionType === "increase_budget_percent") {
          if (insightLevel !== "campaign" && insightLevel !== "adset")
            throw new MetaError(
              "Budget rules require a campaign or ad set",
              400,
              "validation",
            );
          const current = Number(entity.daily_budget ?? entity.budget ?? 0);
          if (!current)
            throw new MetaError(
              "Entity has no daily budget",
              400,
              "validation",
            );
          const today = new Date().toISOString().slice(0, 10);
          const { data: prior } = await client
            .from("meta_action_logs")
            .select("before_state,after_state")
            .eq("workspace_id", workspaceId)
            .eq("source", "rule")
            .eq("action", "increase_budget_percent")
            .eq("entity_id", id)
            .eq("result", "success")
            .gte("created_at", `${today}T00:00:00Z`);
          const already = (prior ?? []).reduce((sum, log) => {
            const before = Number(
              (log.before_state as JsonObject)?.daily_budget ?? 0,
            );
            const after = Number(
              (log.after_state as JsonObject)?.daily_budget ?? before,
            );
            return sum + (before ? ((after - before) / before) * 100 : 0);
          }, 0);
          const next = cappedBudgetIncrease(
            current,
            Number(action.percent ?? 20),
            already,
            Number(rule.max_budget_increase_percent_day ?? 30),
          );
          if (next <= current)
            throw new MetaError(
              "Daily budget increase cap reached",
              409,
              "validation",
            );
          const response = await metaRequest<{ success?: boolean }>(id, {
            token: connection.accessToken,
            method: "POST",
            body: { daily_budget: Math.round(next * 100) },
          });
          if (!response.success)
            throw new MetaError(
              "Meta did not confirm budget change",
              502,
              "temporary",
              true,
            );
          await client
            .from(table)
            .update({
              daily_budget: next,
              ...(insightLevel === "campaign" ? { budget: next } : {}),
            })
            .eq("workspace_id", workspaceId)
            .eq(idColumn, id);
          actionAfter = { ...action, daily_budget: next };
        } else if (actionType === "duplicate") {
          const today = new Date().toISOString().slice(0, 10);
          const { data: priorDuplicates } = await client
            .from("meta_action_logs")
            .select("after_state")
            .eq("workspace_id", workspaceId)
            .eq("source", "rule")
            .eq("source_id", rule.id)
            .eq("action", "duplicate")
            .eq("result", "success")
            .gte("created_at", `${today}T00:00:00Z`);
          const duplicatesToday = (priorDuplicates ?? []).reduce(
            (sum, log) =>
              sum +
              Number((log.after_state as JsonObject)?.duplicates_created ?? 1),
            0,
          );
          const allowed = Math.max(
            0,
            Number(rule.max_duplicates_day ?? 3) - duplicatesToday,
          );
          const copies = Math.min(
            allowed,
            Math.max(1, Number(action.copy_count ?? 1)),
          );
          if (!copies)
            throw new MetaError(
              "Daily duplicate cap reached",
              409,
              "validation",
            );
          let created = 0;
          for (const targetId of actionTargetIds) {
            for (
              let index = 0;
              index < copies && created < allowed;
              index += 1
            ) {
              const response = await metaRequest<JsonObject>(
                `${targetId}/copies`,
                {
                  token: connection.accessToken,
                  method: "POST",
                  body: {
                    status_option: status(action.status),
                    deep_copy: true,
                    rename_options: {
                      rename_strategy: "DEEP_RENAME",
                      rename_prefix: "Rule winner ",
                    },
                  },
                },
              );
              if (
                !response.copied_campaign_id &&
                !response.copied_adset_id &&
                !response.copied_ad_id
              )
                throw new MetaError(
                  "Meta did not confirm rule duplicate",
                  502,
                  "temporary",
                  true,
                );
              created += 1;
            }
            if (created >= allowed) break;
          }
          actionAfter = { ...action, duplicates_created: created };
        } else
          throw new MetaError("Unsupported rule action", 400, "validation");
        actions += 1;
        await writeActionLog(client, {
          workspaceId,
          actorUserId,
          source: "rule",
          sourceId: String(rule.id),
          action: actionType,
          entityType: level,
          entityId: id,
          reason,
          before: entity,
          after: actionAfter,
          result: "success",
        });
        results.push({ entity_id: id, action: actionType, success: true });
      } catch (error) {
        await writeActionLog(client, {
          workspaceId,
          actorUserId,
          source: "rule",
          sourceId: String(rule.id),
          action: actionType,
          entityType: level,
          entityId: id,
          reason,
          before: entity,
          after: action,
          result: "failed",
          error: error as Error,
        });
        results.push({
          entity_id: id,
          action: actionType,
          success: false,
          error: error instanceof Error ? error.message : "Action failed",
        });
      }
    }
    const runStatus = dryRun
      ? "dry_run"
      : results.some((row) => row.success === false)
        ? "partial_failure"
        : "completed";
    await client
      .from("meta_rule_runs")
      .update({
        status: runStatus,
        evaluated_entities: entities?.length ?? 0,
        matched_entities: matched,
        actions_taken: actions,
        summary: { results },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await client
      .from("meta_rules")
      .update({
        last_evaluated_at: new Date().toISOString(),
        next_evaluation_at: nextEvaluationAt(rule),
      })
      .eq("id", rule.id);
    return {
      id: run.id,
      status: runStatus,
      evaluated: entities?.length ?? 0,
      matched,
      actions,
      results,
    };
  } catch (error) {
    await client
      .from("meta_rule_runs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Rule failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await client
      .from("meta_rules")
      .update({
        last_evaluated_at: new Date().toISOString(),
        next_evaluation_at: nextEvaluationAt(rule),
      })
      .eq("id", rule.id);
    throw error;
  }
}

function status(value: unknown): "PAUSED" | "ACTIVE" {
  return String(value ?? "PAUSED").toUpperCase() === "ACTIVE"
    ? "ACTIVE"
    : "PAUSED";
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
      rule_id?: string;
      dry_run?: boolean;
    };
    if (body.scheduled && isCronRequest(req)) {
      const { data: rules } = await client
        .from("meta_rules")
        .select("*")
        .eq("enabled", true)
        .lte("next_evaluation_at", new Date().toISOString())
        .limit(50);
      const results = [];
      for (const rule of rules ?? []) {
        try {
          results.push(
            await runRule(
              client,
              String(rule.workspace_id),
              rule as JsonObject,
            ),
          );
        } catch (error) {
          results.push({
            rule_id: rule.id,
            status: "failed",
            error: error instanceof Error ? error.message : "Rule failed",
          });
        }
      }
      return jsonResponse(req, { success: true, rules: results });
    }
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    if (!body.rule_id)
      return jsonResponse(req, { error: "rule_id is required" }, 400);
    const { data: rule } = await client
      .from("meta_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", body.rule_id)
      .maybeSingle();
    if (!rule) throw new MetaError("Rule not found", 404, "validation");
    return jsonResponse(req, {
      success: true,
      run: await runRule(
        client,
        workspaceId,
        rule as JsonObject,
        user.id,
        body.action === "test" || body.dry_run,
      ),
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
