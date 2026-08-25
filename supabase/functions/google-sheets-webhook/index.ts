// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Generate content hash for deduplication
// ---------------------------------------------------------------------------
async function generateContentHash(data: any): Promise<string> {
  const str = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Resolve city name → ozon_city_id using ozon_cities + city_aliases tables
// (Same logic as youcan-sync-orders for consistency)
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
// Map Google Sheets row to orders table
// ---------------------------------------------------------------------------
function mapSheetRow(row: any, workspaceId: string, sheetId: string): Record<string, any> {
  // Case-insensitive column mapping
  const normalizeKey = (key: string): string => key.toLowerCase().trim();
  
  const rowKeys = Object.keys(row).reduce((acc, key) => {
    acc[normalizeKey(key)] = row[key];
    return acc;
  }, {} as Record<string, any>);

  // Extract fields with fallbacks
  const customerName = rowKeys['customer_name'] || rowKeys['name'] || rowKeys['client'] || null;
  const phone = rowKeys['phone'] || rowKeys['tel'] || rowKeys['mobile'] || null;
  const city = rowKeys['city'] || rowKeys['ville'] || null;
  const address = rowKeys['address'] || rowKeys['adresse'] || null;
  const product = rowKeys['product'] || rowKeys['product_name'] || null;
  const sku = rowKeys['sku'] || rowKeys['reference'] || null;
  const quantity = rowKeys['quantity'] || rowKeys['qty'] || 1;
  const unitPrice = rowKeys['price'] || rowKeys['unit_price'] || null;
  const total = rowKeys['total'] || rowKeys['amount'] || null;
  const orderNumber = rowKeys['order_number'] || rowKeys['ref'] || rowKeys['reference'] || null;
  const status = rowKeys['status'] || 'pending';

  return {
    workspace_id: workspaceId,
    order_number: orderNumber ? `#GS-${orderNumber}` : null,
    customer_name: customerName,
    phone: phone ? String(phone).trim() : null,
    address: address,
    raw_city: city ? String(city).trim() : "",
    product_name: product,
    sku: sku,
    quantity: Number(quantity) || 1,
    unit_price: unitPrice ? Number(unitPrice) : null,
    total: total ? Number(total) : null,
    status: String(status).toLowerCase(),
    source: "sheets",
    created_at: new Date().toISOString(),
    source_platform: rowKeys['source_platform'] || null,
    utm_source: rowKeys['utm_source'] || null,
    utm_medium: rowKeys['utm_medium'] || null,
    utm_campaign: rowKeys['utm_campaign'] || null,
    utm_content: rowKeys['utm_content'] || null,
    utm_term: rowKeys['utm_term'] || null,
    ttclid: rowKeys['ttclid'] || null,
    landing_page: rowKeys['landing_page'] || rowKeys['landing_page_url'] || null,
    referrer: rowKeys['referrer'] || null,
    tiktok_campaign_id: rowKeys['tiktok_campaign_id'] || null,
    tiktok_adgroup_id: rowKeys['tiktok_adgroup_id'] || null,
    tiktok_ad_id: rowKeys['tiktok_ad_id'] || null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { webhook_token, row } = body;

    if (!webhook_token) {
      return new Response(JSON.stringify({ error: "Missing webhook_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!row || typeof row !== "object") {
      return new Response(JSON.stringify({ error: "Missing or invalid row data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up workspace by webhook_token
    const { data: credentials, error: credError } = await supabase
      .from("google_sheets_credentials")
      .select("workspace_id, sheet_id")
      .eq("webhook_token", webhook_token)
      .single();

    if (credError || !credentials) {
      return new Response(JSON.stringify({ error: "Invalid webhook_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workspaceId = credentials.workspace_id;
    const sheetId = credentials.sheet_id;

    // ── Verify Google Sheets integration is still active for this workspace ─────
    const { data: isActive, error: activeError } = await supabase
      .rpc("is_google_sheets_integration_active", { p_workspace_id: workspaceId });

    if (activeError || !isActive) {
      console.error(`[Google Sheets Webhook] Integration not active for workspace ${workspaceId}`);
      return new Response(
        JSON.stringify({ error: "Integration not active" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log incoming webhook and capture id
    const { data: logEntry } = await supabase.from("webhook_logs").insert({
      provider: "sheets",
      event_type: "row_change",
      payload: body,
      status: "received",
      created_at: new Date().toISOString(),
    }).select("id").single();

    const logId = logEntry?.id;

    // Map row data
    const mapped = mapSheetRow(row, workspaceId, sheetId);

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
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            name: mapped.customer_name,
            phone: mapped.phone,
            city: city_name || mapped.raw_city,
            workspace_id: workspaceId,
          })
          .select("id")
          .single();
        
        if (customerError) {
          console.error("[Google Sheets Webhook] Customer insert error:", customerError);
          await supabase.from("webhook_logs").update({
            status: "error",
            error_message: `Customer insert failed: ${customerError.message}`,
            processed_at: new Date().toISOString(),
          }).eq("id", logId);
          
          return new Response(
            JSON.stringify({ error: `Customer insert failed: ${customerError.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (newCustomer) customerId = newCustomer.id;
      }
    }

    // Generate content hash for deduplication
    const contentHash = await generateContentHash(row);

    // Build order payload
    const orderPayload: Record<string, any> = {
      workspace_id: workspaceId,
      order_number: mapped.order_number,
      phone: mapped.phone,
      address: mapped.address,
      city: city_name || mapped.raw_city || null,
      ozon_city_id: ozon_city_id || null,
      city_name: city_name || null,
      total: mapped.total,
      status: mapped.status,
      source: "sheets",
      created_at: mapped.created_at,
      sku: mapped.sku || null,
      product_variant: null,
      customer_name: mapped.customer_name || null,
      source_platform: mapped.source_platform, utm_source: mapped.utm_source, utm_medium: mapped.utm_medium,
      utm_campaign: mapped.utm_campaign, utm_content: mapped.utm_content, utm_term: mapped.utm_term,
      ttclid: mapped.ttclid, landing_page: mapped.landing_page, referrer: mapped.referrer,
      tiktok_campaign_id: mapped.tiktok_campaign_id, tiktok_adgroup_id: mapped.tiktok_adgroup_id, tiktok_ad_id: mapped.tiktok_ad_id,
      product_name: mapped.product_name || null,
      quantity: mapped.quantity,
      unit_price: mapped.unit_price,
      content_hash: contentHash,
      sheet_id: sheetId,
    };
    if (customerId) orderPayload.customer_id = customerId;

    // Upsert with appropriate conflict resolution
    let upsertResult;
    if (mapped.order_number) {
      // Use order_number for deduplication if present
      upsertResult = await supabase
        .from("orders")
        .upsert(orderPayload, {
          onConflict: "workspace_id,order_number",
          ignoreDuplicates: false,
        });
    } else {
      // Use content hash for deduplication if no order_number
      upsertResult = await supabase
        .from("orders")
        .upsert(orderPayload, {
          onConflict: "workspace_id,content_hash",
          ignoreDuplicates: false,
        });
    }

    if (upsertResult.error) {
      console.error("[Google Sheets Webhook] Upsert error:", upsertResult.error);
      await supabase.from("webhook_logs").update({
        status: "error",
        error_message: upsertResult.error.message,
        processed_at: new Date().toISOString(),
      }).eq("id", logId);
      
      return new Response(
        JSON.stringify({ error: upsertResult.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update webhook log status
    await supabase.from("webhook_logs").update({
      status: "success",
      processed_at: new Date().toISOString(),
    }).eq("id", logId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[Google Sheets Webhook] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
