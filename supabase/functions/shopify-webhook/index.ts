import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { serviceClient } from "../_shared/security.ts";
import { resolveOrderCityFuzzy } from "../_shared/city-matcher.ts";

async function verifyShopifyHmac(bodyText: string, hmacHeader: string): Promise<boolean> {
  const secret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (!secret) return false;
  
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(bodyText)
  );
  
  const expectedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return expectedHmac === hmacHeader;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");
  const shopDomain = req.headers.get("x-shopify-shop-domain");

  if (!hmac || !topic || !shopDomain) {
    return new Response("Missing Shopify Headers", { status: 400 });
  }

  const rawBody = await req.text();
  const isValid = await verifyShopifyHmac(rawBody, hmac);
  
  if (!isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const client = serviceClient();

  // FIX: querying for "active", not "connected"
  const { data: creds } = await client
    .from("shopify_credentials")
    .select("workspace_id")
    .eq("shop_domain", shopDomain)
    .eq("status", "active")
    .maybeSingle();

  if (!creds) return new Response("OK", { status: 200 });
  const workspaceId = creds.workspace_id;

  try {
    if (topic === "app/uninstalled") {
      // FIX: Using 'disconnected' as required by schema check constraint
      await client.from("shopify_credentials").update({ status: 'disconnected' }).eq("workspace_id", workspaceId);
      await client.from("shopify_webhook_subscriptions").update({ status: 'failed' }).eq("workspace_id", workspaceId);
      return new Response("OK", { status: 200 });
    }

    let status = "pending";
    if (["paid", "partially_paid"].includes(payload.financial_status)) status = "confirmed";
    if (["refunded", "partially_refunded"].includes(payload.financial_status)) status = "returned";
    if (payload.financial_status === "voided") status = "cancelled";

    let shippingStatus = "unfulfilled";
    if (payload.fulfillment_status === "partial") shippingStatus = "processing";
    if (payload.fulfillment_status === "fulfilled") shippingStatus = "fulfilled";

    if (topic === "orders/updated") {
      await client.from("orders").update({
        status,
        shipping_status: shippingStatus,
        provider_payload_updated_at: payload.updated_at || new Date().toISOString()
      }).eq("workspace_id", workspaceId).eq("external_order_id", String(payload.id));
      return new Response("OK", { status: 200 });
    }

    if (topic === "orders/create") {
      const { data: workspaceData } = await client.from("workspaces").select("carrier").eq("id", workspaceId).maybeSingle();
      const carrier = workspaceData?.carrier || "ozon";

      const rawCity = payload.billing_address?.city || payload.customer?.default_address?.city || "";
      const resolvedCity = await resolveOrderCityFuzzy(client, rawCity, carrier);

      const customerName = payload.customer 
        ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
        : (payload.billing_address?.name || "");
      const phone = payload.billing_address?.phone || payload.customer?.phone || "";
      const lineItem = payload.line_items?.[0];
      const quantity = payload.line_items?.reduce((acc: any, item: any) => acc + item.quantity, 0) || 0;

      await client.from("orders").upsert({
        workspace_id: workspaceId,
        external_order_id: String(payload.id),
        order_date: payload.created_at,
        customer_name: customerName,
        phone,
        raw_city: rawCity,
        city: resolvedCity.city_mapping_status === 'resolved' ? resolvedCity.city_name : null,
        ozon_city_id: resolvedCity.ozon_city_id,
        provider_city_id: resolvedCity.provider_city_id,
        province: payload.billing_address?.province || null,
        country: payload.billing_address?.country || null,
        total: payload.current_total_price || payload.total_price,
        currency: payload.currency,
        product_name: lineItem?.title || null,
        product_variant: lineItem?.variant_title || null,
        quantity,
        unit_price: lineItem?.price || null,
        status,
        shipping_status: shippingStatus,
        notes: `Shopify #${payload.order_number}${payload.note ? `\n${payload.note}` : ''}`,
        source: 'shopify'
      }, { 
        onConflict: 'workspace_id,external_order_id',
        ignoreDuplicates: true 
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
