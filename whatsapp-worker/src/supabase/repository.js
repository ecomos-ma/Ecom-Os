import { ErrorCode, WorkerError } from "../utils/errors.js";

function databaseError(context, error) {
  return new WorkerError(ErrorCode.DATABASE_ERROR, `${context}: ${error?.message || error}`, { cause: error, retryable: true });
}

async function result(query, context) {
  const response = await query;
  if (response.error) throw databaseError(context, response.error);
  return response;
}

export class SupabaseWhatsAppRepository {
  constructor(client) {
    this.client = client;
    this.configured = Boolean(client);
  }

  async getSettings(workspaceId) {
    return (await result(this.client.from("whatsapp_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(), "Load WhatsApp settings")).data;
  }

  async enableWorkspace(workspaceId) {
    await result(this.client.from("whatsapp_settings").upsert({ workspace_id: workspaceId, enabled: true }, { onConflict: "workspace_id" }), "Enable WhatsApp workspace");
  }

  async listEnabledWorkspaces() {
    return (await result(this.client.from("whatsapp_settings").select("workspace_id, connection_status, enabled").eq("enabled", true), "List enabled WhatsApp workspaces")).data || [];
  }

  async updateConnectionStatus(workspaceId, state, values = {}) {
    const now = new Date().toISOString();
    const payload = {
      connection_status: state,
      provider: "baileys",
      last_error: values.lastError ?? null,
      connected_phone: values.connectedPhone ?? null,
      connection_started_at: values.connectionStartedAt ?? null,
      ...(state === "ready" ? { last_connected_at: values.lastConnectedAt || now } : {}),
      ...(state === "disconnected" ? { last_disconnected_at: values.lastDisconnectedAt || now } : {}),
    };
    await result(this.client.from("whatsapp_settings").update(payload).eq("workspace_id", workspaceId), "Persist WhatsApp connection state");
  }

  async recoverStaleJobs(timeoutMinutes) {
    return (await result(this.client.rpc("recover_stale_whatsapp_jobs", { p_timeout_minutes: timeoutMinutes }), "Recover stale WhatsApp jobs")).data || 0;
  }

  async claimJobs(workspaceId, limit) {
    return (await result(this.client.rpc("claim_whatsapp_jobs", { p_workspace_id: workspaceId, p_limit: limit }), "Claim WhatsApp jobs")).data || [];
  }

  async queueDepth(workspaceId) {
    return (await result(this.client.from("whatsapp_queue").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "pending"), "Read WhatsApp queue depth")).count || 0;
  }

  async heartbeat({ workspaceId, workerId, workerVersion, status, queueDepth, lastError, metadata }) {
    const seenAt = new Date().toISOString();
    await result(this.client.rpc("record_whatsapp_worker_heartbeat", {
      p_workspace_id: workspaceId,
      p_worker_id: workerId,
      p_worker_version: workerVersion,
      p_status: status,
      p_queue_depth: queueDepth,
      p_last_error: lastError || null,
      p_metadata: { provider: "baileys", ...metadata },
    }), "Record WhatsApp worker heartbeat");
    await result(this.client.from("whatsapp_worker_heartbeats").update({ provider: "baileys" }).eq("workspace_id", workspaceId), "Record WhatsApp heartbeat provider");
    await result(this.client.from("whatsapp_settings").update({
      connection_status: metadata?.connection_status || "disconnected",
      provider: "baileys",
      connected_phone: metadata?.connected_phone || null,
      last_error: lastError || null,
      worker_last_seen_at: seenAt,
      worker_version: workerVersion,
    }).eq("workspace_id", workspaceId), "Synchronize WhatsApp worker state");
  }

  async getJobContext(job) {
    const [settings, order, workspace, rule] = await Promise.all([
      result(this.client.from("whatsapp_settings").select("*").eq("workspace_id", job.workspace_id).maybeSingle(), "Load job settings"),
      result(this.client.from("orders").select("*").eq("workspace_id", job.workspace_id).eq("Order ID", job.order_id).maybeSingle(), "Load job order"),
      result(this.client.from("workspaces").select("id,name").eq("id", job.workspace_id).maybeSingle(), "Load job workspace"),
      job.rule_id
        ? result(this.client.from("whatsapp_automation_rules").select("*").eq("workspace_id", job.workspace_id).eq("id", job.rule_id).maybeSingle(), "Load automation rule")
        : Promise.resolve({ data: null }),
    ]);
    return { settings: settings.data, order: order.data, workspace: workspace.data, rule: rule.data };
  }

  async getRecording(workspaceId, recordingId) {
    if (!recordingId) return null;
    return (await result(this.client.from("whatsapp_audio_recordings").select("*").eq("workspace_id", workspaceId).eq("id", recordingId).maybeSingle(), "Load WhatsApp audio metadata")).data;
  }

  async downloadRecording(storagePath) {
    const response = await this.client.storage.from("whatsapp-audio").download(storagePath);
    if (response.error) throw databaseError("Download WhatsApp audio", response.error);
    return Buffer.from(await response.data.arrayBuffer());
  }

  async isOptedOut(workspaceId, phone) {
    const response = await result(this.client.from("whatsapp_opt_outs").select("id").eq("workspace_id", workspaceId).eq("normalized_phone", phone).maybeSingle(), "Check WhatsApp opt-out");
    return Boolean(response.data);
  }

  async updateJob(jobId, workspaceId, values, { sendToken, status } = {}) {
    let query = this.client.from("whatsapp_queue").update(values).eq("id", jobId).eq("workspace_id", workspaceId);
    if (sendToken) query = query.eq("send_token", sendToken);
    if (status) query = query.eq("status", status);
    await result(query, "Update WhatsApp queue job");
  }

  async updateLastMessageSent(workspaceId, sentAt) {
    await result(this.client.from("whatsapp_settings").update({ last_message_sent_at: sentAt }).eq("workspace_id", workspaceId), "Update WhatsApp send interval");
  }

  async logMessage(values) {
    const response = await this.client.from("whatsapp_messages").insert(values);
    if (response.error && response.error.code !== "23505") throw databaseError("Log WhatsApp message", response.error);
  }

  async logEvent(values) {
    try {
      const response = await this.client.from("whatsapp_events").insert(values);
      // Non-duplicate errors bubble up; duplicates/constraint violations are silently ignored
      if (response.error && response.error.code !== "23505") {
        console.warn("[logEvent] insert failed:", response.error.message);
      }
    } catch {
      // logEvent must never crash the calling pipeline
    }
  }

  async processInbound(message) {
    const parameters = {
      p_workspace_id: message.workspaceId,
      p_provider_event_id: message.providerEventId,
      p_remote_jid: message.remoteJid,
      p_phone: message.phone,
      p_body: message.text || "",
      p_quoted_message_id: message.quotedMessageId || null,
      p_received_at: message.receivedAt,
      p_raw_payload: message.rawPayload || {},
    };
    const extended = await result(this.client.rpc("process_whatsapp_extended_reply_action", parameters), "Process extended WhatsApp Reply Action");
    if (extended.data?.handled) return extended.data;
    const res = await result(this.client.rpc("process_whatsapp_inbound", {
      ...parameters,
    }), "Process inbound WhatsApp message");
    // RPC returns jsonb; Supabase parses it automatically
    return res.data;
  }

  async loadInboundTemplateContext(workspaceId, orderId) {
    if (!orderId) return { order: null, workspace: null };
    const [order, workspace] = await Promise.all([
      result(this.client.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", orderId).maybeSingle(), "Load inbound reply order"),
      result(this.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(), "Load inbound reply workspace"),
    ]);
    return { order: order.data, workspace: workspace.data };
  }

  async loadAiContext(workspaceId, orderId, phone) {
    let orderQuery = this.client.from("orders").select("*").eq("workspace_id", workspaceId);
    orderQuery = orderId
      ? orderQuery.eq("Order ID", orderId).maybeSingle()
      : orderQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

    const [aiSettings, order, workspace, replyActions, statuses, messages] = await Promise.all([
      result(this.client.from("whatsapp_ai_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(), "Load WhatsApp AI settings"),
      result(orderQuery, "Load WhatsApp AI order"),
      result(this.client.from("workspaces").select("id,name,business_delivery_fee,carrier").eq("id", workspaceId).maybeSingle(), "Load WhatsApp AI workspace"),
      result(this.client.from("whatsapp_reply_actions").select("id,name,action_type,target_status,keywords,response_template,priority").eq("workspace_id", workspaceId).eq("enabled", true).order("priority"), "Load WhatsApp AI reply actions"),
      result(this.client.from("order_statuses").select("id,name,slug").eq("workspace_id", workspaceId).order("position"), "Load WhatsApp AI statuses"),
      result(this.client.from("whatsapp_messages").select("direction,body,message_type,created_at").eq("workspace_id", workspaceId).eq("normalized_phone", normalizePhoneForQuery(phone)).order("created_at", { ascending: false }).limit(12), "Load WhatsApp AI conversation"),
    ]);

    const selectedOrder = order.data || null;
    const items = selectedOrder
      ? (await result(this.client.from("order_items").select("*").eq("workspace_id", workspaceId).eq("order_id", selectedOrder["Order ID"]), "Load WhatsApp AI order items")).data || []
      : [];
    const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
    const [products, variants] = productIds.length
      ? await Promise.all([
        result(this.client.from("products").select("id,name,sku,price,stock,status,description").eq("workspace_id", workspaceId).in("id", productIds), "Load WhatsApp AI products"),
        result(this.client.from("product_variants").select("id,product_id,variant_name,variant_type,variant_value,sku,price,stock,is_active").eq("workspace_id", workspaceId).in("product_id", productIds).eq("is_active", true), "Load WhatsApp AI variants"),
      ])
      : [{ data: [] }, { data: [] }];

    return {
      aiSettings: aiSettings.data,
      order: selectedOrder,
      workspace: workspace.data,
      replyActions: replyActions.data || [],
      statuses: statuses.data || [],
      messages: (messages.data || []).reverse(),
      items,
      products: products.data || [],
      variants: variants.data || [],
    };
  }

  async listAiProviders() {
    const now = new Date().toISOString();
    return (await result(this.client.from("tool_api_providers")
      .select("id,name,endpoint,credential_ciphertext,credential_iv,priority,health_status,cooldown_until,last_used_at")
      .eq("provider", "gemini")
      .eq("enabled", true)
      .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
      .order("priority", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true }), "Load WhatsApp AI providers")).data || [];
  }

  async listAiProviderAvailability() {
    return (await result(this.client.from("tool_api_providers")
      .select("id,enabled,health_status,cooldown_until")
      .eq("provider", "gemini"), "Load WhatsApp AI provider availability")).data || [];
  }

  async recordAiProviderResult(providerId, values) {
    const now = new Date().toISOString();
    const current = await result(this.client.from("tool_api_providers").select("failure_count").eq("id", providerId).maybeSingle(), "Load AI provider health");
    const failureCount = values.success ? 0 : Number(current.data?.failure_count || 0) + 1;
    const cooldownSeconds = values.cooldownSeconds == null ? 30 : Math.max(0, Number(values.cooldownSeconds));
    const cooldownUntil = values.success ? null : new Date(Date.now() + cooldownSeconds * 1000).toISOString();
    await Promise.all([
      result(this.client.from("tool_api_providers").update({
        failure_count: failureCount,
        health_status: values.success ? "healthy" : values.terminal ? "unhealthy" : "cooldown",
        last_error: values.success ? null : values.error || "Provider request failed",
        cooldown_until: cooldownUntil,
        last_used_at: now,
        ...(values.success ? { last_success_at: now } : { last_failure_at: now }),
      }).eq("id", providerId), "Update WhatsApp AI provider health"),
      result(this.client.from("tool_api_usage_logs").insert({
        provider_id: providerId,
        workspace_id: values.workspaceId,
        action: values.action || "whatsapp_ai_inbound",
        success: Boolean(values.success),
        duration_ms: values.durationMs || null,
        error_message: values.success ? null : values.error || "Provider request failed",
      }), "Log WhatsApp AI provider use"),
    ]);
  }

  async executeAiAction(values) {
    return (await result(this.client.rpc("execute_whatsapp_ai_action", {
      p_workspace_id: values.workspaceId,
      p_order_id: values.orderId,
      p_provider_event_id: values.providerEventId,
      p_inbound_message_id: values.inboundMessageId,
      p_decision: values.decision,
    }), "Execute validated WhatsApp AI action")).data;
  }

  async executeAiHandoff(values) {
    return (await result(this.client.rpc("execute_whatsapp_ai_handoff", {
      p_workspace_id: values.workspaceId,
      p_order_id: values.orderId,
      p_provider_event_id: values.providerEventId,
      p_inbound_message_id: values.inboundMessageId || null,
      p_reason: values.reason,
      p_phone: values.phone || null,
      p_inbound_body: values.inboundBody || null,
    }), "Execute WhatsApp AI human handoff")).data;
  }

  async updateReceipt(workspaceId, providerMessageId, status, at = new Date().toISOString()) {
    const timestamps = status === "read"
      ? { delivered_at: at, read_at: at }
      : status === "delivered"
        ? { delivered_at: at }
        : {};
    const allowedCurrentStatuses = status === "sent"
      ? ["pending", "processing", "sent"]
      : status === "delivered"
        ? ["pending", "processing", "sent", "delivered"]
        : status === "read"
          ? ["pending", "processing", "sent", "delivered", "read"]
          : ["pending", "processing", "sent", "failed"];
    await Promise.all([
      result(this.client.from("whatsapp_messages").update({ status, ...timestamps }).eq("workspace_id", workspaceId).eq("wa_message_id", providerMessageId).in("status", allowedCurrentStatuses), "Update WhatsApp message receipt"),
      result(this.client.from("whatsapp_queue").update({ status, ...timestamps }).eq("workspace_id", workspaceId).eq("wa_message_id", providerMessageId).in("status", allowedCurrentStatuses), "Update WhatsApp queue receipt"),
    ]);
  }
}

export class UnconfiguredWhatsAppRepository {
  constructor() { this.configured = false; }
  async getSettings() { return null; }
  async enableWorkspace() { }
  async updateConnectionStatus() { }
  async listEnabledWorkspaces() { return []; }
  async listAiProviders() { return []; }
  async listAiProviderAvailability() { return []; }
  async executeAiHandoff() { return { applied: false, handoff_disabled: true }; }
}

function normalizePhoneForQuery(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "__none__";
  if (/^0[67]\d{8}$/.test(digits)) return `212${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `212${digits}`;
  return digits.replace(/^00/, "");
}

export function createWhatsAppRepository(client) {
  return client ? new SupabaseWhatsAppRepository(client) : new UnconfiguredWhatsAppRepository();
}
