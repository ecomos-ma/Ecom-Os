import {
  assertOnlyKeys,
  authenticate,
  authorizeWorkspace,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";

const memberRoles = ["owner", "supervisor", "admin", "manager", "agent", "viewer", "employee", "user"];

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError("Push notifications are not configured", 503);
  return value;
}

function text(value: unknown, max: number, fallback = ""): string {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function base64Url(value: unknown, field: string): string {
  const normalized = text(value, 512);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) throw new HttpError(`${field} is invalid`, 400);
  return normalized;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(?:10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return true;
  } catch {
    return false;
  }
}

function currentPushUrl(): string {
  return `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/notification-push`;
}

async function wakePushProcessor(): Promise<void> {
  const secret = requiredEnv("NOTIFICATION_WORKER_SECRET");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(currentPushUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": serviceKey, "x-notification-worker-secret": secret },
    body: JSON.stringify({ action: "process", limit: 25 }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    await authorizeWorkspace(client, user.id, workspaceId, memberRoles);

    if (action === "public_key") {
      assertOnlyKeys(body, ["action", "workspace_id"]);
      return json(req, { public_key: requiredEnv("VAPID_PUBLIC_KEY") });
    }

    if (action === "list") {
      assertOnlyKeys(body, ["action", "workspace_id"]);
      const { data, error } = await client.rpc("notification_list_devices", { p_workspace_id: workspaceId });
      if (error) throw new HttpError("Devices could not be loaded", 500);
      return json(req, { devices: data ?? [] });
    }

    if (action === "register") {
      assertOnlyKeys(body, ["action", "workspace_id", "subscription", "device"]);
      const subscription = body.subscription as Record<string, unknown> | null;
      const keys = subscription?.keys as Record<string, unknown> | null;
      const endpoint = text(subscription?.endpoint, 4096);
      if (!validPushEndpoint(endpoint)) throw new HttpError("Push endpoint is invalid", 400);
      const device = (body.device ?? {}) as Record<string, unknown>;
      const endpointHash = await sha256(endpoint);
      const row = {
        workspace_id: workspaceId,
        user_id: user.id,
        endpoint_encrypted_or_protected: endpoint,
        endpoint_hash: endpointHash,
        p256dh_key: base64Url(keys?.p256dh, "p256dh key"),
        auth_key: base64Url(keys?.auth, "auth key"),
        device_name: text(device.name, 80, "Browser") || "Browser",
        browser: text(device.browser, 60, "Unknown") || "Unknown",
        operating_system: text(device.operating_system, 60, "Unknown") || "Unknown",
        device_type: ["desktop", "mobile", "tablet", "unknown"].includes(String(device.device_type)) ? device.device_type : "unknown",
        is_pwa: device.is_pwa === true,
        is_active: true,
        last_active_at: new Date().toISOString(),
        failure_count: 0,
        expires_at: null,
      };
      const { data, error } = await client.from("push_subscriptions").upsert(row, { onConflict: "workspace_id,user_id,endpoint_hash" }).select("id").single();
      if (error) throw new HttpError("This device could not be registered", 500);
      await client.from("notification_user_settings").upsert({ workspace_id: workspaceId, user_id: user.id, notifications_enabled: true, push_enabled: true }, { onConflict: "workspace_id,user_id" });
      return json(req, { ok: true, device_id: data.id });
    }

    if (action === "update") {
      assertOnlyKeys(body, ["action", "workspace_id", "device_id", "device_name", "is_active"]);
      const deviceId = requireUuid(body.device_id, "device_id");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.device_name === "string") patch.device_name = text(body.device_name, 80, "Browser") || "Browser";
      if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
      const { error } = await client.from("push_subscriptions").update(patch).eq("id", deviceId).eq("workspace_id", workspaceId).eq("user_id", user.id);
      if (error) throw new HttpError("Device could not be updated", 500);
      return json(req, { ok: true });
    }

    if (action === "remove" || action === "remove_others") {
      assertOnlyKeys(body, ["action", "workspace_id", "device_id"]);
      const deviceId = requireUuid(body.device_id, "device_id");
      let query = client.from("push_subscriptions").delete().eq("workspace_id", workspaceId).eq("user_id", user.id);
      query = action === "remove" ? query.eq("id", deviceId) : query.neq("id", deviceId);
      const { error } = await query;
      if (error) throw new HttpError("Device could not be removed", 500);
      return json(req, { ok: true });
    }

    if (action === "test") {
      assertOnlyKeys(body, ["action", "workspace_id"]);
      const sourceId = crypto.randomUUID();
      const { error } = await client.rpc("emit_notification_event_service", {
        p_workspace_id: workspaceId,
        p_event_key: "system.announcement",
        p_related_entity_type: "notification_test",
        p_related_entity_id: null,
        p_payload: { title: "Ecom OS notifications are ready", message: "This device can receive secure Ecom OS Web Push notifications.", action_url: "/notifications" },
        p_dedupe_key: `notification.test:${workspaceId}:${user.id}:${sourceId}`,
        p_recipient_user_id: user.id,
        p_source_event_id: sourceId,
      });
      if (error) throw new HttpError("Test notification could not be created", 500);
      EdgeRuntime.waitUntil(wakePushProcessor().catch(() => undefined));
      return json(req, { ok: true });
    }

    throw new HttpError("Unsupported notification action", 400);
  } catch (error) {
    return errorResponse(req, error);
  }
});
