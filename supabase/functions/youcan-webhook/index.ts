// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-youcan-hmac-sha256",
};

// ---------------------------------------------------------------------------
// Verify YouCan webhook HMAC signature using native Web Crypto (no deps)
// ---------------------------------------------------------------------------
async function verifyHmac(payload: string, secret: string, signature: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const computed = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Map YouCan webhook order payload → orders table row
// (Same logic as youcan-sync-orders for consistency)
// ---------------------------------------------------------------------------
function mapWebhookOrder(order: any, workspaceId: string): Record<string, any> {
  // YouCan payload structure: order.customer contains all info directly
  const customer = order.customer || {};

  const phone = customer.phone || null;

  const rawCity = customer.city || null;

  // Product info from order.variants (YouCan API structure)
  const firstVariant = (order.variants || [])[0];
  const sku = firstVariant?.variant?.sku || null;
  const productName = firstVariant?.variant?.product?.name || null;
  const variantLabel = (firstVariant?.variant?.values || []).join(', ') || null;
  const quantity = firstVariant?.quantity || null;
  const unitPrice = firstVariant?.price || null;

  const total = Number(order.total_price || order.total || 0);

  const statusMap: Record<string, string> = {
    pending: "pending",
    processing: "confirmed",
    completed: "delivered",
    cancelled: "cancelled",
    canceled: "cancelled",
    refunded: "returned",
    "on-hold": "pending",
  };
  const rawStatus = String(order.status || "pending").toLowerCase();
  const status = statusMap[rawStatus] || "pending";

  const orderNumber = `#YC-${order.reference || order.id}`;

  // Extract customer name from order.customer
  const customerName = customer.full_name?.trim() ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() ||
    null;

  // Build address string from order.customer.address[0] - only detailed address lines, no city fallback
  const addr = customer.address?.[0];
  const addressParts = [
    addr?.first_line && typeof addr.first_line === 'string' ? addr.first_line.trim() : null,
    addr?.second_line && typeof addr.second_line === 'string' ? addr.second_line.trim() : null,
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;
  const tracking = order.attribution || order.tracking || order.metadata || {};
  const landingPage = order.landing_page || order.landing_page_url || tracking.landing_page || null;
  let landingQuery: URLSearchParams | null = null;
  try { if (landingPage) landingQuery = new URL(String(landingPage)).searchParams; } catch { /* Preserve explicit fields when URL is invalid. */ }
  const tracked = (field: string) => order[field] || tracking[field] || landingQuery?.get(field) || null;

  return {
    workspace_id: workspaceId,
    youcan_order_id: order.id,
    order_number: orderNumber,
    phone: phone ? String(phone).trim() : null,
    address: address,
    raw_city: rawCity ? String(rawCity).trim() : "",
    total,
    status,
    source: "youcan",
    created_at: order.created_at || new Date().toISOString(),
    customer_name: customerName,
    sku,
    product_variant: variantLabel,
    product_name: productName,
    quantity,
    unit_price: unitPrice,
    source_platform: tracked("source_platform") || (String(tracked("utm_source") || "").toLowerCase().includes("tiktok") ? "tiktok" : null),
    utm_source: tracked("utm_source"), utm_medium: tracked("utm_medium"), utm_campaign: tracked("utm_campaign"),
    utm_content: tracked("utm_content"), utm_term: tracked("utm_term"), ttclid: tracked("ttclid"),
    landing_page: landingPage, referrer: order.referrer || tracking.referrer || null,
    tiktok_campaign_id: tracked("tiktok_campaign_id"), tiktok_adgroup_id: tracked("tiktok_adgroup_id"), tiktok_ad_id: tracked("tiktok_ad_id"),
    attribution_data: { imported_from: "youcan", tracking_fields_supplied: Boolean(tracked("ttclid") || tracked("utm_source") || tracked("tiktok_campaign_id")) },
  };
}

// ---------------------------------------------------------------------------
// Resolve city → ozon_city_id
// ---------------------------------------------------------------------------
async function resolveCityId(
  supabase: any,
  cityName: string
): Promise<{ ozon_city_id: number | null; city_name: string }> {
  if (!cityName) return { ozon_city_id: null, city_name: "" };
  const normalized = cityName.trim().toLowerCase();

  const { data: exact } = await supabase
    .from("ozon_cities")
    .select("id, name")
    .ilike("name", normalized)
    .limit(1);
  if (exact && exact.length > 0) {
    return { ozon_city_id: exact[0].id, city_name: exact[0].name };
  }

  const { data: alias } = await supabase
    .from("city_aliases")
    .select("ozon_city_id")
    .eq("alias", normalized)
    .limit(1);
  if (alias && alias.length > 0) {
    const { data: city } = await supabase
      .from("ozon_cities")
      .select("id, name")
      .eq("id", alias[0].ozon_city_id)
      .single();
    if (city) return { ozon_city_id: city.id, city_name: city.name };
  }

  const { data: fuzzy } = await supabase
    .from("ozon_cities")
    .select("id, name")
    .ilike("name", `%${normalized}%`)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) {
    return { ozon_city_id: fuzzy[0].id, city_name: fuzzy[0].name };
  }

  return { ozon_city_id: null, city_name: cityName };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // YouCan sends POST webhook events
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Read raw body for HMAC verification
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // YouCan passes workspace_id in the webhook payload or query params
    const url = new URL(req.url);
    const workspaceId =
      url.searchParams.get("workspace_id") ||
      payload.workspace_id ||
      payload.store?.workspace_id;

    if (!workspaceId) {
      console.error("[YouCan Webhook] Missing workspace_id in payload or query string");
      // Return 200 to prevent YouCan from retrying indefinitely
      return new Response(JSON.stringify({ received: true, warning: "workspace_id missing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load workspace to verify it exists
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .single();

    if (wsError || !workspace) {
      console.error("[YouCan Webhook] Workspace not found:", workspaceId);
      return new Response(JSON.stringify({ received: true, warning: "workspace not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract event type before logging
    const eventType = payload.event || payload.type || url.searchParams.get("event");

    // Log raw payload for debugging
    await supabase
      .from("webhook_logs")
      .insert({
        provider: "youcan",
        event_type: eventType || "unknown",
        payload: payload,
        status: "received",
        created_at: new Date().toISOString(),
      });

    // Verify HMAC using global client secret
    const YOUCAN_CLIENT_SECRET = Deno.env.get("YOUCAN_CLIENT_SECRET");
    const hmacHeader = req.headers.get("x-youcan-hmac-sha256");
    if (YOUCAN_CLIENT_SECRET && hmacHeader) {
      const valid = await verifyHmac(rawBody, YOUCAN_CLIENT_SECRET, hmacHeader);
      if (!valid) {
        console.error("[YouCan Webhook] Invalid HMAC signature for workspace:", workspaceId);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Handle order.created / order.create events
    const order = payload.order || payload.data || payload;

    if (!order || !order.id) {
      console.log("[YouCan Webhook] Event received but no order data:", eventType);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[YouCan Webhook] Processing ${eventType} for order ${order.id} (workspace: ${workspaceId})`);

    console.log('[YouCan Webhook] Full variants array:', JSON.stringify(order.variants, null, 2));

    const mapped = mapWebhookOrder(order, workspaceId);

    console.log('[YouCan Webhook] Mapped result:', JSON.stringify(mapped, null, 2));

    // Resolve city
    const { ozon_city_id, city_name } = await resolveCityId(supabase, mapped.raw_city);

    // Match or create customer
    let customerId: string | null = null;
    if (mapped.phone || mapped.customer_name) {
      if (mapped.phone) {
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("phone", mapped.phone)
          .maybeSingle();

        if (existingCustomer?.id) {
          customerId = existingCustomer.id;
        }
      }

      if (!customerId && mapped.customer_name) {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            name: mapped.customer_name,
            phone: mapped.phone,
            city: city_name || mapped.raw_city,
            workspace_id: workspaceId,
          })
          .select("id")
          .single();
        if (newCustomer) customerId = newCustomer.id;
      }
    }

    // Upsert order
    const orderPayload: Record<string, any> = {
      workspace_id: workspaceId,
      youcan_order_id: mapped.youcan_order_id,
      order_number: mapped.order_number,
      phone: mapped.phone,
      address: mapped.address,
      city: city_name || mapped.raw_city || null,
      ozon_city_id: ozon_city_id || null,
      city_name: city_name || null,
      total: mapped.total,
      status: mapped.status,
      source: "youcan",
      created_at: mapped.created_at,
      sku: mapped.sku || null,
      product_variant: mapped.product_variant || null,
      customer_name: mapped.customer_name || null,
      source_platform: mapped.source_platform, utm_source: mapped.utm_source, utm_medium: mapped.utm_medium,
      utm_campaign: mapped.utm_campaign, utm_content: mapped.utm_content, utm_term: mapped.utm_term,
      ttclid: mapped.ttclid, landing_page: mapped.landing_page, referrer: mapped.referrer,
      tiktok_campaign_id: mapped.tiktok_campaign_id, tiktok_adgroup_id: mapped.tiktok_adgroup_id, tiktok_ad_id: mapped.tiktok_ad_id,
      attribution_data: mapped.attribution_data,
    };
    if (customerId) orderPayload.customer_id = customerId;

    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(orderPayload, {
        onConflict: "workspace_id,youcan_order_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error("[YouCan Webhook] Upsert error:", upsertError);
      // Still return 200 to avoid YouCan retrying
      return new Response(
        JSON.stringify({ received: true, error: upsertError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[YouCan Webhook] Order ${order.id} upserted successfully`);

    // ──────────────────────────────────────────────────────────────────────────

    // Update global sync state
    await supabase.from("integration_sync_state").upsert({
      workspace_id: workspaceId,
      provider: "youcan",
      last_success_at: new Date().toISOString(),
      last_sync_completed_at: new Date().toISOString(),
      last_processed_external_id: String(mapped.youcan_order_id),
    }, { onConflict: "workspace_id, provider" });

    return new Response(JSON.stringify({ received: true, order_id: order.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[YouCan Webhook] Unexpected error:", err);
    // Return 200 to avoid endless retries from YouCan
    return new Response(JSON.stringify({ received: true, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
