import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  TikTokError,
  asObject,
  asString,
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  decryptSecret,
  errorResponse,
  isCronRequest,
  jsonResponse,
  serviceClient,
  sha256,
  tiktokRequest,
} from "../_shared/tiktok.ts";

interface EventsBody {
  workspace_id?: string;
  scheduled?: boolean;
  action?: "process" | "test";
}

interface EventsConfig {
  id: string;
  workspace_id: string;
  event_source_id: string | null;
  access_token_encrypted: string | null;
  enabled: boolean;
  test_event_code: string | null;
}

function effectiveStatus(order: Record<string, unknown>): string {
  return asString(order.shipping_status || order.delivery_status || order.status).toUpperCase().replace(/[\s-]+/g, "_");
}

function invalidOrderStatus(status: string): boolean {
  return ["CANCELLED", "CANCELED", "REFUSED", "RETURNED", "FAKE", "BLACKLISTED", "DUPLICATE", "COMING_BACK"].includes(status);
}

async function hashedArray(value: unknown, normalize: (input: string) => string): Promise<string[] | undefined> {
  const normalized = normalize(asString(value));
  return normalized ? [await sha256(normalized)] : undefined;
}

async function eventPayload(order: Record<string, unknown>, log: Record<string, unknown>): Promise<Record<string, unknown>> {
  const user: Record<string, unknown> = {};
  const email = await hashedArray(order.email, (value) => value.trim().toLowerCase());
  const phone = await hashedArray(order.phone, (value) => value.replace(/[^0-9]/g, ""));
  if (email) user.email = email;
  if (phone) user.phone = phone;
  if (order.customer_id) user.external_id = [await sha256(String(order.customer_id))];
  if (order.ttclid) user.ttclid = String(order.ttclid);

  const eventTimestamp = String(log.event_name) === "CompletePayment"
    ? asString(order.delivered_at || order.updated_at || order.created_at)
    : asString(order.created_at);
  const event: Record<string, unknown> = {
    event: String(log.event_name),
    event_time: Math.floor(new Date(eventTimestamp || Date.now()).getTime() / 1000),
    event_id: String(log.event_id),
    user,
  };
  const landingPage = asString(order.landing_page);
  if (/^https:\/\//i.test(landingPage)) event.page = { url: landingPage };
  const currency = asString(order.workspace_currency).toUpperCase();
  const total = Number(order.total ?? 0);
  if (currency && Number.isFinite(total) && total >= 0) {
    event.properties = { value: total, currency, content_type: "product" };
  }
  return event;
}

async function loadOrder(client: SupabaseClient, orderId: string, workspaceId: string): Promise<Record<string, unknown> | null> {
  // Production Ecom OS databases use the legacy "Order ID" primary-key name;
  // fresh schemas may use id. Fall back only when the first column is absent.
  let result = await client.from("orders").select("*").eq("Order ID", orderId).eq("workspace_id", workspaceId).maybeSingle();
  if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
    result = await client.from("orders").select("*").eq("id", orderId).eq("workspace_id", workspaceId).maybeSingle();
  }
  if (result.error) throw new TikTokError("Order for TikTok event could not be loaded", "temporary", 500, true);
  return result.data as Record<string, unknown> | null;
}

async function processWorkspace(client: SupabaseClient, config: EventsConfig): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (!config.enabled || !config.event_source_id || !config.access_token_encrypted) return { processed: 0, succeeded: 0, failed: 0 };
  const token = await decryptSecret(config.access_token_encrypted);
  const { data: workspace } = await client.from("workspaces").select("reporting_currency").eq("id", config.workspace_id).maybeSingle();
  const { data: queued, error } = await client
    .from("tiktok_event_logs")
    .select("id, workspace_id, order_id, event_name, event_id, attempt_count, attempt_status")
    .eq("workspace_id", config.workspace_id)
    .in("attempt_status", ["pending", "retry"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new TikTokError("TikTok event queue could not be loaded", "temporary", 500, true);
  let succeeded = 0;
  let failed = 0;
  for (const candidate of queued ?? []) {
    const { data: claimed } = await client.from("tiktok_event_logs")
      .update({ attempt_status: "processing", last_attempt_at: new Date().toISOString(), attempt_count: Number(candidate.attempt_count) + 1 })
      .eq("id", candidate.id)
      .in("attempt_status", ["pending", "retry"])
      .select("id, workspace_id, order_id, event_name, event_id, attempt_count")
      .maybeSingle();
    if (!claimed) continue;
    const orderData = await loadOrder(client, String(claimed.order_id), config.workspace_id);
    const order = { ...asObject(orderData), workspace_currency: workspace?.reporting_currency ?? null };
    const status = effectiveStatus(order);
    const valid = Object.keys(order).length > 0
      && (claimed.event_name === "CompletePayment"
        ? status === "DELIVERED" && order.cod_payment_collected === true && !invalidOrderStatus(status)
        : !invalidOrderStatus(status));
    if (!valid) {
      await client.from("tiktok_event_logs").update({ attempt_status: "cancelled", sanitized_response: { message: "Order no longer qualifies for this event" } }).eq("id", claimed.id);
      continue;
    }
    try {
      await tiktokRequest<Record<string, unknown>>("/event/track/", {
        token,
        method: "POST",
        body: {
          event_source: "web",
          event_source_id: config.event_source_id,
          data: [await eventPayload(order, claimed)],
        },
        retries: 2,
      });
      const now = new Date().toISOString();
      await client.from("tiktok_event_logs").update({ attempt_status: "success", tiktok_response_code: "0", sanitized_response: { message: "Accepted" }, next_retry_at: null }).eq("id", claimed.id);
      await client.from("tiktok_events_config").update({ last_event_sent_at: now, last_successful_event_at: now, last_error: null }).eq("id", config.id);
      succeeded += 1;
    } catch (sendError) {
      const normalized = sendError instanceof TikTokError ? sendError : new TikTokError("TikTok event delivery failed", "temporary", 502, true);
      const attempts = Number(claimed.attempt_count);
      const retry = normalized.retryable && attempts < 5;
      const nextRetry = retry ? new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString() : null;
      await client.from("tiktok_event_logs").update({
        attempt_status: retry ? "retry" : "permanent_failure",
        tiktok_response_code: normalized.category,
        sanitized_response: { message: normalized.message, retryable: normalized.retryable },
        next_retry_at: nextRetry,
      }).eq("id", claimed.id);
      await client.from("tiktok_events_config").update({ last_event_sent_at: new Date().toISOString(), last_error: normalized.message }).eq("id", config.id);
      failed += 1;
    }
  }
  return { processed: succeeded + failed, succeeded, failed };
}

async function testConnection(config: EventsConfig): Promise<void> {
  if (!config.event_source_id || !config.access_token_encrypted || !config.test_event_code) {
    throw new TikTokError("Event Source ID, access token, and Test Event Code are required", "configuration", 400);
  }
  await tiktokRequest<Record<string, unknown>>("/event/track/", {
    token: await decryptSecret(config.access_token_encrypted),
    method: "POST",
    body: {
      event_source: "web",
      event_source_id: config.event_source_id,
      test_event_code: config.test_event_code,
      data: [{
        event: "ViewContent",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `ecomos_test_${crypto.randomUUID()}`,
        user: { external_id: [await sha256(`ecomos:tiktok:test:${config.workspace_id}`)] },
        page: { url: Deno.env.get("FRONTEND_URL")?.trim() || Deno.env.get("APP_URL")?.trim() || "https://www.ecomos.ma" },
      }],
    },
    retries: 0,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const body = await req.json().catch(() => ({})) as EventsBody;
    if (isCronRequest(req) && body.scheduled === true) {
      const { data: configs } = await client.from("tiktok_events_config").select("id, workspace_id, event_source_id, access_token_encrypted, enabled, test_event_code").eq("enabled", true);
      const results: Record<string, unknown>[] = [];
      for (const config of (configs ?? []) as EventsConfig[]) {
        try { results.push({ workspace_id: config.workspace_id, ...(await processWorkspace(client, config)) }); }
        catch (error) { results.push({ workspace_id: config.workspace_id, error: error instanceof TikTokError ? error.message : "Event processing failed" }); }
      }
      return jsonResponse({ success: true, scheduled: true, workspaces: results });
    }

    const user = await authenticateRequest(req, client);
    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId) return jsonResponse({ error: "workspace_id is required" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId, body.action === "test");
    const { data: config } = await client.from("tiktok_events_config").select("id, workspace_id, event_source_id, access_token_encrypted, enabled, test_event_code").eq("workspace_id", workspaceId).maybeSingle();
    if (!config) throw new TikTokError("Events API is not configured", "configuration", 409);
    if (body.action === "test") {
      await testConnection(config as EventsConfig);
      await client.from("tiktok_events_config").update({ last_successful_event_at: new Date().toISOString(), last_error: null }).eq("id", config.id);
      return jsonResponse({ success: true, test_event_sent: true });
    }
    return jsonResponse({ success: true, ...(await processWorkspace(client, config as EventsConfig)) });
  } catch (error) {
    return errorResponse(error);
  }
});
