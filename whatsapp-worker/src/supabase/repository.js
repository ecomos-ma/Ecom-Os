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
    const res = await result(this.client.rpc("process_whatsapp_inbound", {
      p_workspace_id: message.workspaceId,
      p_provider_event_id: message.providerEventId,
      p_remote_jid: message.remoteJid,
      p_phone: message.phone,
      p_body: message.text || "",
      p_quoted_message_id: message.quotedMessageId || null,
      p_received_at: message.receivedAt,
      p_raw_payload: message.rawPayload || {},
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
}

export function createWhatsAppRepository(client) {
  return client ? new SupabaseWhatsAppRepository(client) : new UnconfiguredWhatsAppRepository();
}
