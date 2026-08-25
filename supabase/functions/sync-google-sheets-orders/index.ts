// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Allowed destination fields whitelist (for security)
// Only user-relevant fields that appear in Orders UI
// ---------------------------------------------------------------------------
const ALLOWED_DESTINATION_FIELDS = new Set([
  "customer_name",
  "phone",
  "address",
  "city",
  "product_name",
  "product_variant",
  "sku",
  "total",
  "tracking_number",
  "order_date",
  "customer_ip",
  "notes",
  "status",
  "shipping_status",
  "source_platform", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "ttclid", "landing_page", "referrer", "tiktok_campaign_id", "tiktok_adgroup_id", "tiktok_ad_id"
]);

// ---------------------------------------------------------------------------
// Validate field mappings against whitelist
// ---------------------------------------------------------------------------
function validateFieldMappings(fieldMappings: any[] | null): boolean {
  if (!fieldMappings || !Array.isArray(fieldMappings)) {
    return true; // Empty mappings are valid (will use fallback)
  }
  
  for (const mapping of fieldMappings) {
    const destinationField = mapping.destinationField;
    if (destinationField && destinationField !== "do_not_import") {
      if (!ALLOWED_DESTINATION_FIELDS.has(destinationField)) {
        console.error(`Invalid destination field in mapping: ${destinationField}`);
        return false;
      }
    }
  }
  
  return true;
}

// ---------------------------------------------------------------------------
// Normalize status to canonical values using centralized status system
// ---------------------------------------------------------------------------
function normalizeStatusValue(rawValue: string | null | undefined, customMappings: Record<string, string>, isShipping: boolean = false): string | null {
  // For Google Sheets: empty/null values should remain null, not default to pending
  if (!rawValue || rawValue.trim() === "" || rawValue.trim() === "-" || rawValue.trim() === "N/A") {
    console.log(`[GS SYNC] Empty status value detected, returning null. Raw:`, rawValue);
    return null;
  }
  
  const trimmed = rawValue.trim();
  
  // Check custom mappings first
  if (customMappings[trimmed]) {
    console.log(`[GS SYNC] Using custom mapping: "${trimmed}" -> "${customMappings[trimmed]}"`);
    return customMappings[trimmed];
  }
  
  // Fallback to hardcoded mapping for backward compatibility
  const lower = trimmed.toLowerCase();
  
  if (isShipping) {
    // Shipping status mappings (these match the centralized statusEngine)
    if (lower === "livre" || lower === "livré" || lower === "delivered") return "delivered";
    if (lower === "retour" || lower === "retourné" || lower === "returned") return "returned";
    if (lower === "en transit" || lower === "in transit" || lower === "transit") return "shipped";
    if (lower === "refuse" || lower === "refusé" || lower === "refused") return "refused";
    if (lower === "en distribution" || lower === "mise en distribution" || lower === "distribution") return "shipped";
    if (lower === "en cours" || lower === "in progress" || lower === "processing") return "shipped";
    if (lower === "reporte" || lower === "reporté" || lower === "postponed" || lower === "scheduled") return "scheduled";
    if (lower === "pas de reponse" || lower === "pas de réponse" || lower === "no answer") return "no_answer";
    console.log(`[GS SYNC] Unknown shipping status: "${trimmed}", returning null`);
    return null; // Unknown values should be null, not pending
  } else {
    // Confirmation status mappings
    if (lower === "confirme" || lower === "confirmé" || lower === "confirmed") return "confirmed";
    if (lower === "canceled" || lower === "cancelled" || lower === "annulé" || lower === "annule") return "cancelled";
    if (lower === "blacklisted" || lower === "blacklisté") return "blacklisted";
    if (lower === "double" || lower === "doublon" || lower === "duplicate") return "duplicate";
    if (lower === "reporte" || lower === "reporté" || lower === "postponed" || lower === "scheduled") return "scheduled";
    if (lower === "refuse" || lower === "refusé" || lower === "refused") return "refused";
    if (lower === "no answer" || lower === "pas de reponse" || lower === "pas de réponse") return "no_answer";
    console.log(`[GS SYNC] Unknown confirmation status: "${trimmed}", returning null`);
    return null; // Unknown values should be null, not pending
  }
}

// ---------------------------------------------------------------------------
// Map Web App JSON row to orders table using custom field mappings
// ---------------------------------------------------------------------------
function mapWebAppRow(row: any, workspaceId: string, fieldMappings: any[] | null, customStatusMappings: Record<string, any> | null): Record<string, any> {
  const result: Record<string, any> = {
    workspace_id: workspaceId,
    source: "sheets",
  };
  
  console.log("[GS SYNC] Mapping row with fieldMappings:", fieldMappings ? "YES" : "NO (using fallback)");
  
  // If custom field mappings exist, use them
  if (fieldMappings && Array.isArray(fieldMappings) && fieldMappings.length > 0) {
    console.log("[GS SYNC] Using custom field mappings, count:", fieldMappings.length);
    fieldMappings.forEach((mapping: any) => {
      const sheetHeader = mapping.sheetHeader;
      const destinationField = mapping.destinationField;
      
      if (!destinationField || destinationField === "do_not_import") {
        return; // Skip unmapped columns
      }
      
      const value = row[sheetHeader];
      
      // Log key field mappings for debugging
      if (destinationField === "city" || destinationField === "total" || destinationField === "shipping_status") {
        console.log(`[GS SYNC] Mapping ${sheetHeader} -> ${destinationField}, raw value:`, value);
      }
      
      // Handle special fields
      if (destinationField === "status") {
        const normalizedStatus = normalizeStatusValue(value, customStatusMappings?.confirmation || {}, false);
        if (normalizedStatus) result.status = normalizedStatus;
      } else if (destinationField === "shipping_status") {
        const normalizedShippingStatus = normalizeStatusValue(value, customStatusMappings?.shipping || {}, true);
        if (normalizedShippingStatus) result.shipping_status = normalizedShippingStatus;
        console.log(`[GS SYNC] Shipping status normalized:`, normalizedShippingStatus);
      } else if (destinationField === "total") {
        // Parse numeric value, strip currency symbols if present
        if (value) {
          const parsed = typeof value === 'string' 
            ? parseFloat(value.replace(/[^\d.-]/g, '')) 
            : Number(value);
          result.total = isNaN(parsed) ? null : parsed;
          console.log(`[GS SYNC] Total parsed:`, result.total, "from:", value);
        }
      } else if (destinationField === "order_date") {
        if (value) {
          try {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
              result.order_date = parsed.toISOString();
            }
          } catch {
            // Invalid date, skip
          }
        }
      } else {
        // Direct mapping for other fields
        result[destinationField] = value || null;
      }
    });
    
    // If customer_name not set but first_name is, use first_name
    if (!result.customer_name && result.first_name) {
      result.customer_name = result.first_name;
    }
    
    // Generate sync key for deduplication (phone + order_date)
    const phone = result.phone || "";
    const orderDate = result.order_date || "no-date";
    result.sync_key = `${phone}_${orderDate}`;
    
  } else {
    console.log("[GS SYNC] Using fallback hardcoded mapping");
    // Fall back to hardcoded mapping for backward compatibility
    // Parse SKU with quantity suffix (e.g., "joint-creme x2" → sku="joint-creme", quantity=2)
    let sku = row["SKU"] || null;
    
    if (sku && typeof sku === "string") {
      const match = sku.match(/^(.+?)\s*x(\d+)$/i);
      if (match) {
        sku = match[1].trim();
      }
    }

    // Map confirmation status to order status
    const confirmation = row["confirmation"] || "";
    let status = "pending";
    if (confirmation === "CONFIRME" || confirmation === "confirmé") status = "confirmed";
    else if (confirmation === "CANCELED" || confirmation === "annulé") status = "cancelled";
    else if (confirmation === "BLACKLISTED") status = "blacklisted";
    else if (confirmation === "double") status = "duplicate";
    else if (confirmation === "REPORTE" || confirmation === "reporté") status = "scheduled";

    // Map shipping status to shipping_status (NOT delivery_status)
    const delivery = row["delivery"] || "";
    let shippingStatus: string | null = null;
    
    // Only set shipping status if delivery has a real value
    if (delivery && delivery.trim() !== "" && delivery.trim() !== "-" && delivery.trim() !== "N/A") {
      if (delivery === "LIVRE" || delivery === "livré") shippingStatus = "delivered";
      else if (delivery === "Retour" || delivery === "retour" || delivery === "retourné") shippingStatus = "returned";
      else if (delivery === "EN TRANSIT" || delivery === "En transit" || delivery === "en transit") shippingStatus = "shipped";
      else if (delivery === "REFUSE" || delivery === "refusé" || delivery === "refuse") shippingStatus = "refused";
      else if (delivery === "REPORTE" || delivery === "reporté") shippingStatus = "scheduled";
      else {
        console.log(`[GS SYNC] Fallback - Unknown delivery value: "${delivery}", keeping shipping_status null`);
      }
    } else {
      console.log(`[GS SYNC] Fallback - Empty delivery value, keeping shipping_status null`);
    }

    console.log(`[GS SYNC] Fallback - City:`, row["City"], ", Shipping status:", shippingStatus, "from delivery:", delivery);

    // Parse order date
    const orderDateStr = row["Order date"] || "";
    let orderDate: string | null = null;
    if (orderDateStr) {
      try {
        const parsed = new Date(orderDateStr);
        if (!isNaN(parsed.getTime())) {
          orderDate = parsed.toISOString();
        }
      } catch {
        // Invalid date, keep null
      }
    }

    // Parse total amount (strip currency symbols)
    const variantPriceStr = row["Variant price"] || "";
    let total: number | null = null;
    if (variantPriceStr) {
      const parsed = typeof variantPriceStr === 'string' 
        ? parseFloat(variantPriceStr.replace(/[^\d.-]/g, '')) 
        : Number(variantPriceStr);
      total = isNaN(parsed) ? null : parsed;
      console.log(`[GS SYNC] Fallback - Total parsed:`, total, "from:", variantPriceStr);
    }

    // Generate sync key for deduplication (phone + order_date)
    const phone = row["Phone"] || "";
    const syncKey = `${phone}_${orderDate || "no-date"}`;

    result.phone = phone || null;
    result.first_name = row["First name"] || null;
    result.customer_name = row["First name"] || null;
    result.city = row["City"] || null; // Use city (what Orders UI reads)
    result.product_variant = row["Product variant"] || null;
    result.total = total; // Use total (what Orders UI reads)
    result.sku = sku;
    result.customer_ip = row["Customer IP"] || null;
    result.status = status;
    result.shipping_status = shippingStatus; // Use shipping_status (what Orders UI reads)
    result.order_date = orderDate;
    result.tracking_number = row["Tracking number"] || null;
    result.address = row["Address"] || null;
    result.source_platform = row["source_platform"] || row["Source Platform"] || null;
    result.utm_source = row["utm_source"] || row["UTM Source"] || null;
    result.utm_medium = row["utm_medium"] || row["UTM Medium"] || null;
    result.utm_campaign = row["utm_campaign"] || row["UTM Campaign"] || null;
    result.utm_content = row["utm_content"] || row["UTM Content"] || null;
    result.utm_term = row["utm_term"] || row["UTM Term"] || null;
    result.ttclid = row["ttclid"] || row["TTCLID"] || null;
    result.landing_page = row["landing_page"] || row["Landing Page"] || null;
    result.referrer = row["referrer"] || row["Referrer"] || null;
    result.tiktok_campaign_id = row["tiktok_campaign_id"] || row["TikTok Campaign ID"] || null;
    result.tiktok_adgroup_id = row["tiktok_adgroup_id"] || row["TikTok Ad Group ID"] || null;
    result.tiktok_ad_id = row["tiktok_ad_id"] || row["TikTok Ad ID"] || null;
    result.sync_key = syncKey;
  }
  
  console.log("[GS SYNC] Final result - city:", result.city, ", total:", result.total, ", shipping_status:", result.shipping_status);
  
  // Do NOT set created_at — let the DB default (now()) handle it on insert
  // order_number will be set separately based on whether this is a new or existing order
  
  return result;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  console.log("Function invoked, method:", req.method);
  
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("Getting environment variables");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    console.log("SUPABASE_URL exists:", !!SUPABASE_URL);
    console.log("SUPABASE_SERVICE_ROLE_KEY exists:", !!SUPABASE_SERVICE_ROLE_KEY);
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log("Supabase client created");

    const body = await req.json();
    console.log("Request body parsed:", body);
    const { workspace_id } = body;

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "Missing workspace_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Getting web_app_url and mappings from credentials");
    // Get web_app_url and mappings from credentials
    const { data: credentials, error: credError } = await supabase
      .from("google_sheets_credentials")
      .select("web_app_url, field_mappings, custom_status_mappings")
      .eq("workspace_id", workspace_id)
      .single();

    if (credError || !credentials?.web_app_url) {
      return new Response(JSON.stringify({ error: "Web App URL not configured for this workspace" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webAppUrl = credentials.web_app_url;
    const fieldMappings = credentials.field_mappings;
    const customStatusMappings = credentials.custom_status_mappings;
    
    // Validate field mappings against whitelist
    if (!validateFieldMappings(fieldMappings)) {
      return new Response(JSON.stringify({ error: "Invalid field mappings detected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("Field mappings found:", fieldMappings ? "yes" : "no");
    console.log("Custom status mappings found:", customStatusMappings ? "yes" : "no");

    // Fetch data from Google Sheets Web App
    let webAppData: any;
    try {
      console.log("Fetching from Web App URL:", webAppUrl);
      const response = await fetch(webAppUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        // Follow redirects (Google Apps Script may redirect once)
        redirect: "follow",
      });

      console.log("Web App response status:", response.status);
      const text = await response.text();
      console.log("Web App response text length:", text.length, "first 200 chars:", text.substring(0, 200));

      if (!response.ok) {
        throw new Error(`Web App returned HTTP ${response.status}. Response: ${text.substring(0, 300)}`);
      }

      try {
        webAppData = JSON.parse(text);
      } catch {
        throw new Error(`Web App response is not valid JSON. Check your Apps Script doGet() returns ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON). First 300 chars: ${text.substring(0, 300)}`);
      }
      console.log("Web App data parsed, array length:", Array.isArray(webAppData) ? webAppData.length : "not an array");
    } catch (error: any) {
      console.error("Web App fetch error:", error);
      return new Response(
        JSON.stringify({ error: `Failed to fetch from Web App: ${error.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(webAppData)) {
      return new Response(
        JSON.stringify({ error: "Web App did not return an array" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each row
    let processed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const row of webAppData) {
      try {
        const orderPayload = mapWebAppRow(row, workspace_id, fieldMappings, customStatusMappings);

        // Check if order already exists (for determining order_number)
        const { data: existingOrder, error: checkError } = await supabase
          .from("orders")
          .select("order_number")
          .eq("workspace_id", workspace_id)
          .eq("sync_key", orderPayload.sync_key)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw new Error(`Check existing order failed: ${checkError.message}`);
        }

        const isNewOrder = !existingOrder;
        let orderNumber: string;
        
        if (existingOrder?.order_number) {
          // Use existing order_number for updates
          orderNumber = existingOrder.order_number;
        } else {
          // New order: get next sequential number from database function
          console.log("Getting next sequential order number for workspace:", workspace_id);
          const { data: nextNumberData, error: numberError } = await supabase
            .rpc("get_next_google_sheets_order_number", {
              p_workspace_id: workspace_id
            });

          if (numberError) {
            throw new Error(`Failed to get sequential order number: ${numberError.message}`);
          }

          orderNumber = nextNumberData as string;
          console.log("Assigned order number:", orderNumber);
        }

        // Add order_number to payload
        orderPayload.order_number = orderNumber;

        // Upsert using sync_key for deduplication.
        // On conflict, update status/delivery/variant fields — never overwrite order_number.
        const { error: upsertError, data: upsertData } = await supabase
          .from("orders")
          .upsert(orderPayload, {
            onConflict: "workspace_id,sync_key",
            ignoreDuplicates: false,
          })
          .select("created_at, updated_at, order_number");

        if (upsertError) {
          const detail = `[${orderPayload.sync_key}] ${upsertError.message} | code: ${upsertError.code} | details: ${upsertError.details}`;
          console.error("Upsert error:", detail);
          errorDetails.push(detail);
          errors++;
        } else {
          processed++;
          // If it was a new order, increment created count, otherwise updated
          if (isNewOrder) {
            created++;
            console.log(`Created new order with number: ${orderNumber}`);
          } else {
            updated++;
            console.log(`Updated existing order with number: ${orderNumber}`);
          }
        }
      } catch (error: any) {
        const msg = error?.message ?? String(error);
        console.error("Error processing row:", msg);
        errorDetails.push(msg);
        errors++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${processed} rows: ${created} created, ${updated} updated, ${errors} errors`,
      stats: { processed, created, updated, errors },
      ...(errorDetails.length > 0 && { errorDetails }),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[Google Sheets Sync] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
