import webpush from "npm:web-push@3.6.7";
import { corsHeaders, json, serviceClient } from "../_shared/security.ts";

type OutboxJob = {
  id: string;
  notification_id: string;
  workspace_id: string;
  recipient_user_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};

type PushDevice = {
  id: string;
  endpoint_encrypted_or_protected: string;
  p256dh_key: string;
  auth_key: string;
};

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function authorized(req: Request): Promise<boolean> {
  const supplied = req.headers.get("x-notification-worker-secret") ?? "";
  const expected = env("NOTIFICATION_WORKER_SECRET");
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function errorStatus(error: unknown): number {
  const value = error as { statusCode?: number; status?: number };
  return Number(value?.statusCode ?? value?.status ?? 0);
}

function sanitizedError(status: number): string {
  if (status === 404 || status === 410) return "Push subscription is no longer valid";
  if (status === 408 || status === 429 || status >= 500) return "Push provider temporarily unavailable";
  if (status === 401 || status === 403) return "Push provider authorization failed";
  return "Push delivery failed";
}

function pushPayload(job: OutboxJob): Record<string, unknown> {
  const payload = job.payload ?? {};
  const category = String(payload.category ?? "system").replace(/_/g, " ");
  const isPrivate = payload.private_preview !== false;
  return {
    notification_id: job.notification_id,
    title: isPrivate ? "Ecom OS" : String(payload.title ?? "Ecom OS").slice(0, 180),
    body: isPrivate ? `You have a new ${category} notification in Ecom OS.` : String(payload.message ?? "You have a new notification.").slice(0, 600),
    action_url: String(payload.action_url ?? "/notifications").slice(0, 500),
    category,
    priority: String(payload.priority ?? "normal"),
  };
}

async function recordDelivery(client: ReturnType<typeof serviceClient>, job: OutboxJob, device: PushDevice | null, status: string, providerStatus: string, error: string | null) {
  await client.from("notification_deliveries").upsert({
    notification_id: job.notification_id,
    channel: "push",
    subscription_id: device?.id ?? null,
    status,
    attempt_count: job.attempt_count,
    provider_status: providerStatus,
    sanitized_error: error,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    failed_at: status === "failed" || status === "discarded" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "notification_id,channel,subscription_id" });
}

async function processJob(client: ReturnType<typeof serviceClient>, job: OutboxJob): Promise<void> {
  const { data: devices, error } = await client.from("push_subscriptions")
    .select("id, endpoint_encrypted_or_protected, p256dh_key, auth_key")
    .eq("workspace_id", job.workspace_id).eq("user_id", job.recipient_user_id).eq("is_active", true);
  if (error) throw error;
  if (!devices?.length) {
    await recordDelivery(client, job, null, "discarded", "no_active_subscription", "No active notification device");
    await client.from("notification_outbox").update({ status: "discarded", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: "No active notification device" }).eq("id", job.id);
    return;
  }

  const payload = JSON.stringify(pushPayload(job));
  let successes = 0;
  let temporaryFailures = 0;
  for (const device of devices as PushDevice[]) {
    try {
      await webpush.sendNotification({
        endpoint: device.endpoint_encrypted_or_protected,
        keys: { p256dh: device.p256dh_key, auth: device.auth_key },
      }, payload, { TTL: 60 * 60 * 24, urgency: String(job.payload?.priority) === "critical" ? "high" : "normal" });
      successes += 1;
      await client.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), last_active_at: new Date().toISOString(), failure_count: 0, last_failure_at: null }).eq("id", device.id);
      await recordDelivery(client, job, device, "sent", "accepted", null);
    } catch (deliveryError) {
      const status = errorStatus(deliveryError);
      const temporary = status === 0 || status === 408 || status === 429 || status >= 500;
      if (temporary) temporaryFailures += 1;
      const invalid = status === 404 || status === 410;
      const message = sanitizedError(status);
      await client.from("push_subscriptions").update({
        is_active: invalid ? false : true,
        last_failure_at: new Date().toISOString(),
        failure_count: invalid ? 5 : Math.min(job.attempt_count, 4),
        expires_at: invalid ? new Date().toISOString() : null,
      }).eq("id", device.id);
      await recordDelivery(client, job, device, invalid ? "discarded" : "failed", status ? String(status) : "network_error", message);
    }
  }

  if (successes > 0) {
    await client.from("notification_outbox").update({ status: "sent", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
  } else if (temporaryFailures > 0 && job.attempt_count < job.max_attempts) {
    const seconds = Math.min(3600, 30 * (2 ** Math.max(0, job.attempt_count - 1)));
    await client.from("notification_outbox").update({ status: "pending", next_attempt_at: new Date(Date.now() + seconds * 1000).toISOString(), locked_at: null, locked_by: null, last_error: "Temporary push delivery failure", updated_at: new Date().toISOString() }).eq("id", job.id);
  } else {
    await client.from("notification_outbox").update({ status: "discarded", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: "No deliverable subscription", updated_at: new Date().toISOString() }).eq("id", job.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    if (!await authorized(req)) return json(req, { error: "Unauthorized" }, 401);
    webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
    const body = await req.json().catch(() => ({})) as { limit?: number };
    const client = serviceClient();
    const workerId = `edge-${Deno.env.get("SB_EXECUTION_ID") ?? crypto.randomUUID()}`;
    await client.rpc("recover_stale_notification_outbox", { p_timeout_minutes: 10 });
    const { data, error } = await client.rpc("claim_notification_outbox", { p_worker_id: workerId, p_limit: Math.min(Math.max(Number(body.limit ?? 25), 1), 100) });
    if (error) throw error;
    for (const job of (data ?? []) as OutboxJob[]) await processJob(client, job);
    await client.rpc("cleanup_notification_data");
    return json(req, { ok: true, processed: data?.length ?? 0 });
  } catch {
    return json(req, { error: "Notification processing failed" }, 500);
  }
});
