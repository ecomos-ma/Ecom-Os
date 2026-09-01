// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertOnlyKeys,
  authenticate,
  authorizeOperationalWorkspace,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";

// ---------------------------------------------------------------------------
// Token refresh helper
// ---------------------------------------------------------------------------
async function refreshYouCanToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch("https://api.youcan.shop/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Fetch a single page of YouCan orders
// ---------------------------------------------------------------------------
async function fetchOrdersPage(accessToken: string, page: number): Promise<any> {
  const res = await fetch(`https://api.youcan.shop/orders?page=${page}&limit=50`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /orders page ${page} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Resolve city name → ozon_city_id using ozon_cities + city_aliases tables
// ---------------------------------------------------------------------------
async function resolveCityId(
  supabase: any,
  cityName: string
): Promise<{ ozon_city_id: number | null; city_name: string }> {
  if (!cityName) return { ozon_city_id: null, city_name: "" };

  const normalized = cityName.trim().toLowerCase();

  // 1. Exact match on ozon_cities.name
  const { data: exact } = await supabase
    .from("ozon_cities")
    .select("id, name")
    .ilike("name", normalized)
    .limit(1);
  if (exact && exact.length > 0) {
    return { ozon_city_id: exact[0].id, city_name: exact[0].name };
  }

  // 2. Alias match
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

  // 3. Trigram / substring match
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
// Map a single YouCan order → orders table row
// ---------------------------------------------------------------------------
function mapYouCanOrder(order: any, workspaceId: string): Record<string, any> {
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

  // Total
  const total = Number(order.total_price || order.total || 0);

  // Status mapping — YouCan statuses → our statuses
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

  // Order reference: prefer `reference` field, fall back to id
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
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const supabase = serviceClient();
    const user = await authenticate(req, supabase);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["workspace_id"]);
    const workspace_id = requireUuid(body.workspace_id, "workspace_id");
    await authorizeOperationalWorkspace(supabase, user.id, workspace_id);

    // The canonical integration row is the only import authority.
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, access_token, refresh_token, expires_at, status")
      .eq("workspace_id", workspace_id)
      .eq("provider", "youcan")
      .maybeSingle();
    if (integrationError) throw new HttpError("YouCan connection could not be verified", 503);
    if (!integration || integration.status !== "active" || !integration.access_token) {
      throw new HttpError("YouCan is disconnected", 409);
    }

    // ── 2. Refresh token if expired ──
    let accessToken: string = integration.access_token;

    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at);
      // Refresh 5 minutes before expiry to avoid race conditions
      if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        const YOUCAN_CLIENT_ID = Deno.env.get("YOUCAN_CLIENT_ID");
        const YOUCAN_CLIENT_SECRET = Deno.env.get("YOUCAN_CLIENT_SECRET");
        
        if (!integration.refresh_token || !YOUCAN_CLIENT_ID || !YOUCAN_CLIENT_SECRET) {
          await supabase.from("integrations").update({ status: "auth_expired" }).eq("id", integration.id);
          throw new HttpError("YouCan authentication expired. Reconnect the store.", 409);
        }
        const newTokens = await refreshYouCanToken(
          integration.refresh_token,
          YOUCAN_CLIENT_ID,
          YOUCAN_CLIENT_SECRET
        );
        accessToken = newTokens.access_token;
        const refreshedExpiry = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
        await Promise.all([
          supabase.from("integrations").update({
            access_token: newTokens.access_token, refresh_token: newTokens.refresh_token,
            expires_at: refreshedExpiry, status: "active",
          }).eq("id", integration.id).eq("status", "active"),
          supabase.from("workspaces").update({
            youcan_access_token: newTokens.access_token,
            youcan_refresh_token: newTokens.refresh_token,
            youcan_token_expires_at: refreshedExpiry,
          }).eq("id", workspace_id),
        ]);
      }
    }

    // ── 3. Paginate through all orders ──
    let page = 1;
    let totalPages = 1;
    const allOrders: any[] = [];

    do {
      const pageData = await fetchOrdersPage(accessToken, page);
      const orders = pageData.data || pageData.orders || [];
      allOrders.push(...orders);
      totalPages = pageData.meta?.last_page || pageData.last_page || 1;
      page++;
    } while (page <= totalPages);

    console.log(`[YouCan Sync] Fetched ${allOrders.length} orders (${totalPages} pages) for workspace ${workspace_id}`);

    // ── 4. Upsert each order ──
    let syncedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const order of allOrders) {
      try {
        const mapped = mapYouCanOrder(order, workspace_id);

        // Resolve city
        const { ozon_city_id, city_name } = await resolveCityId(supabase, mapped.raw_city);

        // Match or create customer
        let customerId: string | null = null;
        if (mapped.phone || mapped.customer_name) {
          // Try to find existing customer by phone
          if (mapped.phone) {
            const { data: existingCustomer } = await supabase
              .from("customers")
              .select("id")
              .eq("workspace_id", workspace_id)
              .eq("phone", mapped.phone)
              .maybeSingle();

            if (existingCustomer) {
              customerId = existingCustomer.id;
            }
          }

          // Create customer if not found and we have a name
          if (!customerId && mapped.customer_name) {
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                name: mapped.customer_name,
                phone: mapped.phone,
                city: city_name || mapped.raw_city,
                workspace_id,
              })
              .select("id")
              .single();
            if (newCustomer) customerId = newCustomer.id;
          }
        }

        // Calculate shipping cost using Smart Pricing Engine logic
        let shippingCost: number | null = null;
        
        // Priority 1: Try provider pricing from ozon_cities
        if (ozon_city_id) {
          const { data: cityData } = await supabase
            .from("ozon_cities")
            .select("delivered_price")
            .eq("id", ozon_city_id)
            .single();
          if (cityData && cityData.delivered_price) {
            shippingCost = cityData.delivered_price;
          }
        }
        
        // Priority 2: Fallback to business delivery fee if no provider pricing
        if (shippingCost === null) {
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("business_delivery_fee")
            .eq("id", workspace_id)
            .single();
          shippingCost = workspaceData?.business_delivery_fee || 35;
        }

        // Build order payload
        const orderPayload: Record<string, any> = {
          workspace_id,
          source_integration_id: integration.id,
          external_order_id: String(mapped.youcan_order_id),
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
          sku: mapped.sku ?? null,
          product_variant: mapped.product_variant ?? null,
          customer_name: mapped.customer_name ?? null,
          shipping_cost: shippingCost,
          source_platform: mapped.source_platform, utm_source: mapped.utm_source, utm_medium: mapped.utm_medium,
          utm_campaign: mapped.utm_campaign, utm_content: mapped.utm_content, utm_term: mapped.utm_term,
          ttclid: mapped.ttclid, landing_page: mapped.landing_page, referrer: mapped.referrer,
          tiktok_campaign_id: mapped.tiktok_campaign_id, tiktok_adgroup_id: mapped.tiktok_adgroup_id, tiktok_ad_id: mapped.tiktok_ad_id,
          attribution_data: mapped.attribution_data,
        };
        if (customerId) orderPayload.customer_id = customerId;

        // The database trigger rejects this write if disconnect won the race.
        const { error: upsertError } = await supabase
          .from("orders")
          .upsert(orderPayload, {
            onConflict: "workspace_id,source_integration_id,external_order_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`[YouCan Sync] Upsert error for order ${order.id}:`, upsertError);
          errors.push(`Order ${order.reference || order.id}: not imported`);
          skippedCount++;
        } else {
          syncedCount++;
        }
      } catch (orderErr: any) {
        console.error(`[YouCan Sync] Processing error for order ${order.id}:`, orderErr);
        errors.push(`Order ${order.reference || order.id}: not imported`);
        skippedCount++;
      }
    }

    const result = {
      success: true,
      total_fetched: allOrders.length,
      synced_count: syncedCount,
      skipped_count: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[YouCan Sync] Done:`, result);

    return json(req, result);
  } catch (err: any) {
    console.error("[YouCan Sync] Fatal error:", err instanceof HttpError ? err.message : "internal_error");
    return errorResponse(req, err);
  }
});
