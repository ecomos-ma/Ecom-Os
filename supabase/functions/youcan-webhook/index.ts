import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { requiredYouCanEnv, YOUCAN_WEBHOOK_EVENTS } from "../_shared/youcan.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
async function sign(raw: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(requiredYouCanEnv("YOUCAN_CLIENT_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
}
function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}
function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    const received = hexBytes(req.headers.get("x-youcan-signature")?.trim() ?? "");
    if (!received || !equal(received, await sign(raw))) return json({ error: "Invalid signature" }, 401);
    const deliveryId = req.headers.get("x-youcan-delivery-id")?.trim() ?? "";
    if (!deliveryId || deliveryId.length > 200) return json({ error: "Invalid delivery" }, 400);
    const payload = JSON.parse(raw) as Record<string, any>;
    const eventType = String(payload.event_name ?? req.headers.get("x-youcan-topic") ?? "").trim();
    if (!(YOUCAN_WEBHOOK_EVENTS as readonly string[]).includes(eventType)) return json({ received: true, ignored: true }, 202);
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const storeId = String(data.store_id ?? "").trim();
    if (!storeId) return json({ error: "Invalid delivery" }, 400);
    const client = createClient(requiredYouCanEnv("SUPABASE_URL"), requiredYouCanEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: integration, error } = await client.from("integrations").select("id, workspace_id, status").eq("provider", "youcan").eq("external_store_id", storeId).maybeSingle();
    if (error || !integration) return json({ error: "Integration not found" }, 404);
    const { error: deliveryError } = await client.from("youcan_webhook_deliveries").insert({ workspace_id: integration.workspace_id, integration_id: integration.id, delivery_id: deliveryId, event_type: eventType });
    if (deliveryError?.code === "23505") return json({ received: true, duplicate: true }, 200);
    if (deliveryError) return json({ error: "Delivery could not be queued" }, 503);
    if (eventType === "app.uninstalled") {
      await Promise.all([
        client.from("integrations").update({ status: "revoked", disconnected_at: new Date().toISOString(), access_token: null, refresh_token: null, access_token_encrypted: null, refresh_token_encrypted: null, webhook_health: "deactivated", webhook_last_received_at: new Date().toISOString() }).eq("id", integration.id),
        client.from("integration_sync_state").update({ enabled: false, updated_at: new Date().toISOString() }).eq("workspace_id", integration.workspace_id).eq("provider", "youcan"),
        client.from("youcan_sync_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("integration_id", integration.id).in("status", ["pending", "retry"]),
        client.from("youcan_webhook_deliveries").update({ status: "processed", processed_at: new Date().toISOString() }).eq("integration_id", integration.id).eq("delivery_id", deliveryId),
      ]);
      return json({ received: true });
    }
    if (integration.status !== "active") {
      await client.from("youcan_webhook_deliveries").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("integration_id", integration.id).eq("delivery_id", deliveryId);
      return json({ received: true, ignored: true });
    }
    await Promise.all([
      client.from("youcan_sync_jobs").upsert({ workspace_id: integration.workspace_id, integration_id: integration.id, job_type: "orders", idempotency_key: `webhook:${deliveryId}`, payload: { event_type: eventType, event_payload: data, delivery_id: deliveryId, source_integration_id: integration.id }, status: "pending", available_at: new Date().toISOString() }, { onConflict: "workspace_id,integration_id,job_type,idempotency_key" }),
      client.from("integrations").update({ webhook_last_received_at: new Date().toISOString(), webhook_health: "healthy", webhook_last_error: null }).eq("id", integration.id),
      client.from("youcan_webhook_subscriptions").update({ last_delivery_at: new Date().toISOString(), status: "active" }).eq("integration_id", integration.id).eq("event_type", eventType),
    ]);
    return json({ received: true, queued: true }, 202);
  } catch (error) {
    console.error("[YouCan webhook] rejected", error instanceof Error ? error.message : "invalid_delivery");
    return json({ error: "Webhook could not be accepted" }, 400);
  }
});
