import {
  authenticateUser,
  authorizeWorkspace,
  corsHeaders,
  classifyWhatsAppError,
  json,
  requiredEnv,
  serviceClient,
} from "../_shared/whatsapp.ts";

const actions = new Set(["connect", "disconnect", "status", "test", "reconnect", "logout", "send", "send_audio", "send_media", "send_order_status", "profile_photo"]);
const audioMimeTypes = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

type ControlBody = {
  action?: string;
  workspace_id?: string;
  phone?: string;
  message?: string;
  revoke_session?: boolean;
  order_id?: string;
  storage_path?: string;
  mime_type?: string;
  file_size?: number;
  duration_seconds?: number;
  file_name?: string;
  kind?: string;
  caption?: string;
  request_id?: string;
};

function normalizeMoroccanPhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(2);
  if (/^0[67]\d{8}$/.test(digits)) digits = `212${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) digits = `212${digits}`;
  return /^212[67]\d{8}$/.test(digits) ? digits : null;
}

function normalizeOrderStatus(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ({ nouveau: "new", en_attente: "pending", ramasse: "picked_up", livre: "delivered", injoignable: "customer_unreachable", ne_repond_pas: "no_answer", retourne: "returned", annule: "cancelled" } as Record<string, string>)[normalized] || normalized;
}

async function authorizeWorkspaceMember(client: ReturnType<typeof serviceClient>, userId: string, workspaceId: string) {
  const { data: membership, error: membershipError } = await client
    .from("profile_workspaces")
    .select("workspace_id")
    .eq("profile_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (membership) return;
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.workspace_id !== workspaceId) throw new Error("Workspace access denied");
}

function workerPath(action: string, workspaceId: string) {
  const sessionPrefix = `/sessions/${workspaceId}`;
  switch (action) {
    case "status":
      return `${sessionPrefix}/status`;
    case "connect":
      return `${sessionPrefix}/connect`;
    case "disconnect":
      return `${sessionPrefix}/disconnect`;
    case "reconnect":
      return `${sessionPrefix}/reconnect`;
    case "logout":
      return `${sessionPrefix}/logout`;
    case "send":
    case "test":
      return `${sessionPrefix}/send`;
    case "send_media":
      return `${sessionPrefix}/send-media`;
    case "profile_photo":
      return `${sessionPrefix}/profile-photo`;
    default:
      throw new Error(`Unsupported WhatsApp worker action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST" && req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticateUser(req, client);
    const body = req.method === "POST"
      ? await req.json().catch(() => ({})) as ControlBody
      : {} as ControlBody;
    const action = (body.action ?? "status").trim();
    const workspaceId = (body.workspace_id ?? req.url.split("/").slice(-2, -1)[0] ?? "").trim();
    if (!actions.has(action)) return json(req, { error: "Invalid action" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json(req, { error: "Invalid workspace_id" }, 400);
    if (action === "send_order_status") await authorizeWorkspaceMember(client, user.id, workspaceId);
    else await authorizeWorkspace(client, user.id, workspaceId);

    if (action === "send_order_status") {
      const orderId = String(body.order_id ?? "").trim();
      const requestId = String(body.request_id ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json(req, { error: "A valid order is required" }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(req, { error: "A valid request identifier is required" }, 400);

      const [{ data: order, error: orderError }, { data: settings, error: settingsError }, { data: rules, error: rulesError }] = await Promise.all([
        client.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", orderId).maybeSingle(),
        client.from("whatsapp_settings").select("enabled,connection_status").eq("workspace_id", workspaceId).maybeSingle(),
        client.from("whatsapp_automation_rules").select("id,rule_key,display_name,event_type,status_source,trigger_statuses,channel_sequence,audio_recording_id,expires_after_minutes").eq("workspace_id", workspaceId),
      ]);
      if (orderError || !order) return json(req, { error: "Order was not found in this workspace" }, 404);
      if (settingsError || !settings?.enabled || settings.connection_status !== "ready") {
        return json(req, { error: "WhatsApp is not connected and enabled for this workspace" }, 409);
      }
      if (rulesError) return json(req, { error: "WhatsApp automation rules could not be loaded" }, 500);

      const phone = normalizeMoroccanPhone(order.phone);
      if (!phone) return json(req, { error: "Customer does not have a valid Moroccan WhatsApp number" }, 400);
      const { data: optOut, error: optOutError } = await client
        .from("whatsapp_opt_outs")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("normalized_phone", phone)
        .maybeSingle();
      if (optOutError) return json(req, { error: "Customer messaging preference could not be checked" }, 500);
      if (optOut) return json(req, { error: "This customer has opted out of WhatsApp messages" }, 409);

      const allowedSources = new Set(["status", "shipping_status", "delivery_status", "provider_status"]);
      const matchingRules = (rules ?? []).filter((rule) => {
        if (!allowedSources.has(rule.status_source)) return false;
        const currentStatus = normalizeOrderStatus(order[rule.status_source]);
        return currentStatus && (rule.trigger_statuses ?? []).some((candidate: unknown) => normalizeOrderStatus(candidate) === currentStatus);
      });
      const rule = matchingRules.sort((left, right) => {
        const priority = { status: 0, confirmation: 1, delivery: 2 } as Record<string, number>;
        return (priority[left.event_type] ?? 3) - (priority[right.event_type] ?? 3);
      })[0];
      if (!rule) return json(req, { error: "Configure a WhatsApp Automation message for this order status first" }, 409);

      const statusSource = rule.status_source;
      const currentStatus = normalizeOrderStatus(order[statusSource]);
      const now = new Date();
      const expiresMinutes = Math.max(5, Math.min(10080, Number(rule.expires_after_minutes) || 60));
      const messageType = rule.event_type === "confirmation" || rule.event_type === "delivery" ? rule.event_type : "status_update";
      const { data: job, error: queueError } = await client.from("whatsapp_queue").insert({
        workspace_id: workspaceId,
        order_id: orderId,
        phone: order.phone,
        normalized_phone: phone,
        message_type: messageType,
        automation_event: "manual_status",
        rule_id: rule.id,
        idempotency_key: `manual-status:${workspaceId}:${orderId}:${rule.id}:${requestId}`,
        channel_sequence: rule.channel_sequence,
        audio_recording_id: rule.audio_recording_id,
        payload: { source: "confirmation_crm", status_source: statusSource, status: currentStatus, rule_key: rule.rule_key, requested_by: user.id },
        status: "pending",
        scheduled_for: now.toISOString(),
        expires_at: new Date(now.getTime() + expiresMinutes * 60_000).toISOString(),
        attempts: 0,
        max_attempts: 3,
      }).select("id").single();
      if (queueError || !job) return json(req, { error: "Status message could not be queued" }, 500);
      return json(req, { ok: true, queued: true, job_id: job.id, rule_name: rule.display_name, status: currentStatus }, 202);
    }

    if (action === "send_audio") {
      const phone = normalizeMoroccanPhone(body.phone);
      const orderId = String(body.order_id ?? "").trim();
      const storagePath = String(body.storage_path ?? "").trim();
      const mimeType = String(body.mime_type ?? "").trim().toLowerCase();
      const fileSize = Number(body.file_size);
      const durationSeconds = Math.max(1, Math.min(900, Number(body.duration_seconds) || 1));

      if (!phone) return json(req, { error: "Invalid Moroccan mobile number" }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json(req, { error: "Voice messages require a linked order" }, 400);
      if (!storagePath.startsWith(`${workspaceId}/`) || storagePath.includes("..") || storagePath.includes("\\")) {
        return json(req, { error: "Invalid audio storage path" }, 400);
      }
      if (!audioMimeTypes.has(mimeType)) return json(req, { error: "Unsupported audio format" }, 400);
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > 10 * 1024 * 1024) {
        return json(req, { error: "Voice message must be smaller than 10 MB" }, 400);
      }

      const [{ data: order }, { data: settings }] = await Promise.all([
        client.from("orders").select("workspace_id").eq("Order ID", orderId).eq("workspace_id", workspaceId).maybeSingle(),
        client.from("whatsapp_settings").select("enabled,connection_status").eq("workspace_id", workspaceId).maybeSingle(),
      ]);
      if (!order) return json(req, { error: "Linked order was not found" }, 404);
      if (!settings?.enabled || settings.connection_status !== "ready") {
        return json(req, { error: "WhatsApp is not connected" }, 409);
      }

      const { data: recording, error: recordingError } = await client
        .from("whatsapp_audio_recordings")
        .insert({
          workspace_id: workspaceId,
          name: `Voice message ${new Date().toISOString()}`,
          storage_path: storagePath,
          mime_type: mimeType,
          file_size: fileSize,
          duration_seconds: durationSeconds,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (recordingError || !recording) {
        return json(req, { error: "Voice message could not be prepared" }, 500);
      }

      const now = new Date();
      const { data: job, error: queueError } = await client
        .from("whatsapp_queue")
        .insert({
          workspace_id: workspaceId,
          order_id: orderId,
          phone,
          normalized_phone: phone,
          message_type: "custom",
          automation_event: "manual_voice",
          idempotency_key: `manual-voice:${workspaceId}:${crypto.randomUUID()}`,
          channel_sequence: ["audio"],
          audio_recording_id: recording.id,
          payload: { source: "inbox" },
          status: "pending",
          scheduled_for: now.toISOString(),
          expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          attempts: 0,
          max_attempts: 3,
        })
        .select("id")
        .single();
      if (queueError || !job) {
        await Promise.all([
          client.from("whatsapp_audio_recordings").delete().eq("id", recording.id).eq("workspace_id", workspaceId),
          client.storage.from("whatsapp-audio").remove([storagePath]),
        ]);
        return json(req, { error: "Voice message could not be queued" }, 500);
      }

      return json(req, { ok: true, queued: true, job_id: job.id }, 202);
    }

    if (action === "send_media") {
      const phone = normalizeMoroccanPhone(body.phone);
      const storagePath = String(body.storage_path ?? "").trim();
      const mimeType = String(body.mime_type ?? "").trim().toLowerCase();
      const fileName = String(body.file_name ?? "attachment").trim().slice(0, 180);
      const fileSize = Number(body.file_size);
      const kind = body.kind === "image" ? "image" : "document";
      const allowedMimeTypes = new Set([
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip", "text/plain",
      ]);
      if (!phone) return json(req, { error: "Invalid Moroccan mobile number" }, 400);
      if (!storagePath.startsWith(`${workspaceId}/`) || storagePath.includes("..") || storagePath.includes("\\")) {
        return json(req, { error: "Invalid attachment storage path" }, 400);
      }
      if (!allowedMimeTypes.has(mimeType)) return json(req, { error: "Unsupported attachment format" }, 400);
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > 16 * 1024 * 1024) {
        return json(req, { error: "Attachment must be smaller than 16 MB" }, 400);
      }
      if (!fileName) return json(req, { error: "Attachment name is required" }, 400);
    }

    const workerUrl = new URL(requiredEnv("WHATSAPP_WORKER_URL"));
    const workerSecret = requiredEnv("WHATSAPP_WORKER_API_SECRET");
    const workerEndpoint = workerPath(action, workspaceId);
    const workerRequestUrl = new URL(workerEndpoint, `${workerUrl.toString().replace(/\/$/, "")}/`);
    console.info("[whatsapp-control] worker request", { action, method: action === "status" ? "GET" : "POST", origin: workerRequestUrl.origin, path: workerRequestUrl.pathname });
    const response = await fetch(workerRequestUrl, {
      method: action === "status" ? "GET" : "POST",
      headers: { "Authorization": `Bearer ${workerSecret}`, "Content-Type": "application/json" },
      body: action === "status" ? undefined : JSON.stringify({
        workspace_id: workspaceId,
        phone: body.phone,
        message: body.message,
        revoke_session: body.revoke_session,
        storage_path: body.storage_path,
        mime_type: body.mime_type,
        file_size: body.file_size,
        file_name: body.file_name,
        kind: body.kind,
        caption: body.caption,
        order_id: body.order_id,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    console.info("[whatsapp-control] worker response", { action, status: response.status, origin: workerRequestUrl.origin, path: workerRequestUrl.pathname });
    const payload = await response.json().catch(() => ({ error: "Invalid worker response" }));
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const normalizedStatus = typeof payload.connection_status === "string"
        ? payload.connection_status
        : typeof payload.status === "string"
          ? payload.status
          : typeof payload.state === "string"
            ? payload.state
            : null;
      payload.connection_status = normalizedStatus ?? payload.connection_status ?? null;
      payload.status = normalizedStatus ?? payload.status ?? payload.connection_status ?? null;
      payload.state = normalizedStatus ?? payload.state ?? payload.connection_status ?? null;
      payload.worker_available = typeof payload.worker_available === "boolean" ? payload.worker_available : true;
    }
    return json(req, payload, response.status);
  } catch (error) {
    const classified = classifyWhatsAppError(error);
    console.error("[whatsapp-control] request failed", { code: classified.code, message: error instanceof Error ? error.message : String(error) });
    return json(req, { error: classified.message, code: classified.code }, classified.status);
  }
});
