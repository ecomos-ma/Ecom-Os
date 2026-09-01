import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const responseHeaders = { "Content-Type": "application/json" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

async function validHmac(body: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const actual = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const expected = new Uint8Array(signature.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.min(actual.length, expected.length); index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function orderRow(order: Record<string, any>, workspaceId: string, integrationId: string): Record<string, any> {
  const customer = order.customer ?? {};
  const firstVariant = Array.isArray(order.variants) ? order.variants[0] : null;
  const address = Array.isArray(customer.address) ? customer.address[0] : null;
  const addressText = [address?.first_line, address?.second_line].map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean).join(", ") || null;
  const rawStatus = String(order.status ?? "pending").toLowerCase();
  const statusMap: Record<string, string> = {
    pending: "pending", processing: "confirmed", completed: "delivered",
    cancelled: "cancelled", canceled: "cancelled", refunded: "returned", "on-hold": "pending",
  };
  const tracking = order.attribution ?? order.tracking ?? order.metadata ?? {};
  const landingPage = order.landing_page ?? order.landing_page_url ?? tracking.landing_page ?? null;
  let query: URLSearchParams | null = null;
  try { if (landingPage) query = new URL(String(landingPage)).searchParams; } catch { /* keep explicit attribution */ }
  const tracked = (name: string) => order[name] ?? tracking[name] ?? query?.get(name) ?? null;
  const externalId = String(order.id);
  return {
    workspace_id: workspaceId,
    source: "youcan",
    source_integration_id: integrationId,
    external_order_id: externalId,
    youcan_order_id: externalId,
    order_number: `#YC-${order.reference ?? externalId}`,
    phone: customer.phone ? String(customer.phone).trim() : null,
    address: addressText,
    city: customer.city ? String(customer.city).trim() : null,
    raw_city: customer.city ? String(customer.city).trim() : "",
    total: Number(order.total_price ?? order.total ?? 0),
    status: statusMap[rawStatus] ?? "pending",
    created_at: order.created_at ?? new Date().toISOString(),
    customer_name: customer.full_name?.trim?.() || [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || null,
    sku: firstVariant?.variant?.sku ?? null,
    product_variant: Array.isArray(firstVariant?.variant?.values) ? firstVariant.variant.values.join(", ") : null,
    product_name: firstVariant?.variant?.product?.name ?? null,
    quantity: firstVariant?.quantity ?? null,
    unit_price: firstVariant?.price ?? null,
    source_platform: tracked("source_platform") ?? (String(tracked("utm_source") ?? "").toLowerCase().includes("tiktok") ? "tiktok" : null),
    utm_source: tracked("utm_source"), utm_medium: tracked("utm_medium"), utm_campaign: tracked("utm_campaign"),
    utm_content: tracked("utm_content"), utm_term: tracked("utm_term"), ttclid: tracked("ttclid"),
    landing_page: landingPage, referrer: order.referrer ?? tracking.referrer ?? null,
    tiktok_campaign_id: tracked("tiktok_campaign_id"), tiktok_adgroup_id: tracked("tiktok_adgroup_id"), tiktok_ad_id: tracked("tiktok_ad_id"),
    attribution_data: { imported_from: "youcan", tracking_fields_supplied: Boolean(tracked("ttclid") || tracked("utm_source") || tracked("tiktok_campaign_id")) },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const integrationId = url.searchParams.get("integration_id")?.trim() ?? "";
  const webhookToken = url.searchParams.get("token")?.trim() ?? "";
  if (!uuidPattern.test(integrationId) || webhookToken.length < 32) return reply({ received: true, accepted: false });

  const rawBody = await req.text();
  let payload: Record<string, any>;
  try { payload = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON" }, 400); }

  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: integration, error } = await client.from("integrations")
      .select("id, workspace_id, external_store_id, status, webhook_secret, access_token")
      .eq("id", integrationId).eq("provider", "youcan").maybeSingle();
    if (error || !integration || integration.status !== "active" || !integration.access_token || integration.webhook_secret !== webhookToken) {
      console.warn("[YouCan webhook] inactive_or_unknown_integration");
      return reply({ received: true, accepted: false });
    }

    const providerSignature = req.headers.get("x-youcan-hmac-sha256");
    const providerSecret = Deno.env.get("YOUCAN_CLIENT_SECRET")?.trim();
    if (providerSignature && providerSecret && !await validHmac(rawBody, providerSignature, providerSecret)) {
      return reply({ error: "Invalid signature" }, 401);
    }

    const eventType = String(payload.event ?? payload.type ?? "unknown");
    const order = (payload.order ?? payload.data ?? payload) as Record<string, any>;
    if (!order?.id) return reply({ received: true, accepted: true, ignored: "not_an_order" });
    const mapped = orderRow(order, integration.workspace_id, integration.id);

    // Recheck immediately before the write. A database trigger also locks and
    // verifies this integration in the same transaction as the order upsert.
    const { data: active } = await client.from("integrations").select("id")
      .eq("id", integration.id).eq("status", "active").not("access_token", "is", null).maybeSingle();
    if (!active) return reply({ received: true, accepted: false });

    const { error: orderError } = await client.from("orders").upsert(mapped, {
      onConflict: "workspace_id,source_integration_id,external_order_id",
      ignoreDuplicates: false,
    });
    if (orderError) {
      const reason = orderError.message.includes("ORDER_") ? "plan_limit" : orderError.message.includes("SOURCE_INTEGRATION_INACTIVE") ? "integration_inactive" : "persistence_error";
      console.error("[YouCan webhook] order_rejected", reason);
      await client.from("webhook_logs").insert({
        provider: "youcan", event_type: eventType, youcan_order_id: String(order.id),
        payload: { integration_id: integration.id, external_order_id: String(order.id) },
        status: "rejected", error_message: reason, created_at: new Date().toISOString(),
      });
      return reply({ received: true, accepted: false, reason });
    }

    await Promise.all([
      client.from("integration_sync_state").upsert({
        workspace_id: integration.workspace_id, provider: "youcan", enabled: true,
        last_success_at: new Date().toISOString(), last_sync_completed_at: new Date().toISOString(),
        last_processed_external_id: String(order.id), consecutive_failures: 0, last_error: null,
      }, { onConflict: "workspace_id,provider" }),
      client.from("webhook_logs").insert({
        provider: "youcan", event_type: eventType, youcan_order_id: String(order.id),
        payload: { integration_id: integration.id, external_order_id: String(order.id) },
        status: "processed", processed_at: new Date().toISOString(), created_at: new Date().toISOString(),
      }),
    ]);
    return reply({ received: true, accepted: true, order_id: String(order.id) });
  } catch (error) {
    console.error("[YouCan webhook] unexpected_error", error instanceof Error ? error.name : "unknown");
    return reply({ received: true, accepted: false, reason: "temporary_error" }, 503);
  }
});
