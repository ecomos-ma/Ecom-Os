// deno-lint-ignore-file no-explicit-any
/**
 * sync-google-sheets-fast — Fast delta sync for Google Sheets
 *
 * Called by pg_cron every 1 minute. Detects new rows in Google Sheets
 * and imports only the delta (new rows) rather than the full sheet.
 *
 * Architecture:
 * 1. Check sheet metadata (lastRow) via ?mode=meta
 * 2. Compare with last_processed_row checkpoint
 * 3. If new rows exist, fetch delta via ?afterRow=X
 * 4. Map and upsert only new rows
 * 5. Advance checkpoint only after successful DB write
 *
 * Latency target: ~1-2 seconds from row appearing in Sheet to DB insert
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ---------------------------------------------------------------------------
// Timing helper for latency measurement
// ---------------------------------------------------------------------------
interface SyncTiming {
  workspace_id: string;
  checkStartedAt: number;
  metaFetchCompletedAt: number;
  deltaFetchCompletedAt: number;
  dbUpsertCompletedAt: number;
  totalSyncMs: number;
  rowsImported: number;
  rowsFetched: number;
  hadNewRows: boolean;
  error?: string;
}

function createTiming(workspaceId: string): SyncTiming {
  return {
    workspace_id: workspaceId,
    checkStartedAt: Date.now(),
    metaFetchCompletedAt: 0,
    deltaFetchCompletedAt: 0,
    dbUpsertCompletedAt: 0,
    totalSyncMs: 0,
    rowsImported: 0,
    rowsFetched: 0,
    hadNewRows: false,
  };
}

function logTiming(timing: SyncTiming) {
  timing.totalSyncMs = Date.now() - timing.checkStartedAt;
  console.log(`[GS FAST SYNC] Timing for workspace ${timing.workspace_id}:`, {
    metaFetch: timing.metaFetchCompletedAt - timing.checkStartedAt,
    deltaFetch: timing.deltaFetchCompletedAt - timing.metaFetchCompletedAt,
    dbUpsert: timing.dbUpsertCompletedAt - timing.deltaFetchCompletedAt,
    total: timing.totalSyncMs,
    rowsFetched: timing.rowsFetched,
    rowsImported: timing.rowsImported,
    hadNewRows: timing.hadNewRows,
    error: timing.error,
  });
}

// ---------------------------------------------------------------------------
// Allowed destination fields whitelist (copied from sync-google-sheets-orders)
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
// Validate field mappings (copied from sync-google-sheets-orders)
// ---------------------------------------------------------------------------
function validateFieldMappings(fieldMappings: any[] | null): boolean {
  if (!fieldMappings || !Array.isArray(fieldMappings)) {
    return true;
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
// Normalize status to canonical values (copied from sync-google-sheets-orders)
// ---------------------------------------------------------------------------
function normalizeStatusValue(rawValue: string | null | undefined, customMappings: Record<string, string>, isShipping: boolean = false): string | null {
  if (!rawValue || rawValue.trim() === "" || rawValue.trim() === "-" || rawValue.trim() === "N/A") {
    return null;
  }
  
  const trimmed = rawValue.trim();
  
  if (customMappings[trimmed]) {
    return customMappings[trimmed];
  }
  
  const lower = trimmed.toLowerCase();
  
  if (isShipping) {
    if (lower === "livre" || lower === "livré" || lower === "delivered") return "delivered";
    if (lower === "retour" || lower === "retourné" || lower === "returned") return "returned";
    if (lower === "en transit" || lower === "in transit" || lower === "transit") return "shipped";
    if (lower === "refuse" || lower === "refusé" || lower === "refused") return "refused";
    if (lower === "en distribution" || lower === "mise en distribution" || lower === "distribution") return "shipped";
    if (lower === "en cours" || lower === "in progress" || lower === "processing") return "shipped";
    if (lower === "reporte" || lower === "reporté" || lower === "postponed" || lower === "scheduled") return "scheduled";
    if (lower === "pas de reponse" || lower === "pas de réponse" || lower === "no answer") return "no_answer";
    return null;
  } else {
    if (lower === "confirme" || lower === "confirmé" || lower === "confirmed") return "confirmed";
    if (lower === "canceled" || lower === "cancelled" || lower === "annulé" || lower === "annule") return "cancelled";
    if (lower === "blacklisted" || lower === "blacklisté") return "blacklisted";
    if (lower === "double" || lower === "doublon" || lower === "duplicate") return "duplicate";
    if (lower === "reporte" || lower === "reporté" || lower === "postponed" || lower === "scheduled") return "scheduled";
    if (lower === "refuse" || lower === "refusé" || lower === "refused") return "refused";
    if (lower === "no answer" || lower === "pas de reponse" || lower === "pas de réponse") return "no_answer";
    return null;
  }
}

// ---------------------------------------------------------------------------
// Map Web App JSON row to orders table (copied from sync-google-sheets-orders)
// ---------------------------------------------------------------------------
function mapWebAppRow(row: any, workspaceId: string, fieldMappings: any[] | null, customStatusMappings: Record<string, any> | null): Record<string, any> {
  const result: Record<string, any> = {
    workspace_id: workspaceId,
    source: "sheets",
  };
  
  if (fieldMappings && Array.isArray(fieldMappings) && fieldMappings.length > 0) {
    fieldMappings.forEach((mapping: any) => {
      const sheetHeader = mapping.sheetHeader;
      const destinationField = mapping.destinationField;
      
      if (!destinationField || destinationField === "do_not_import") {
        return;
      }
      
      const value = row[sheetHeader];
      
      if (destinationField === "status") {
        const normalizedStatus = normalizeStatusValue(value, customStatusMappings?.confirmation || {}, false);
        if (normalizedStatus) result.status = normalizedStatus;
      } else if (destinationField === "shipping_status") {
        const normalizedShippingStatus = normalizeStatusValue(value, customStatusMappings?.shipping || {}, true);
        if (normalizedShippingStatus) result.shipping_status = normalizedShippingStatus;
      } else if (destinationField === "total") {
        if (value) {
          const parsed = typeof value === 'string' 
            ? parseFloat(value.replace(/[^\d.-]/g, '')) 
            : Number(value);
          result.total = isNaN(parsed) ? null : parsed;
        }
      } else if (destinationField === "order_date") {
        if (value) {
          try {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
              result.order_date = parsed.toISOString();
            }
          } catch {}
        }
      } else {
        result[destinationField] = value || null;
      }
    });
    
    if (!result.customer_name && result.first_name) {
      result.customer_name = result.first_name;
    }
    
    const phone = result.phone || "";
    const orderDate = result.order_date || "no-date";
    result.sync_key = `${phone}_${orderDate}`;
    
  } else {
    // Fallback hardcoded mapping
    let sku = row["SKU"] || null;
    
    if (sku && typeof sku === "string") {
      const match = sku.match(/^(.+?)\s*x(\d+)$/i);
      if (match) {
        sku = match[1].trim();
      }
    }

    const confirmation = row["confirmation"] || "";
    let status = "pending";
    if (confirmation === "CONFIRME" || confirmation === "confirmé") status = "confirmed";
    else if (confirmation === "CANCELED" || confirmation === "annulé") status = "cancelled";
    else if (confirmation === "BLACKLISTED") status = "blacklisted";
    else if (confirmation === "double") status = "duplicate";
    else if (confirmation === "REPORTE" || confirmation === "reporté") status = "scheduled";

    const delivery = row["delivery"] || "";
    let shippingStatus: string | null = null;
    
    if (delivery && delivery.trim() !== "" && delivery.trim() !== "-" && delivery.trim() !== "N/A") {
      if (delivery === "LIVRE" || delivery === "livré") shippingStatus = "delivered";
      else if (delivery === "Retour" || delivery === "retour" || delivery === "retourné") shippingStatus = "returned";
      else if (delivery === "EN TRANSIT" || delivery === "En transit" || delivery === "en transit") shippingStatus = "shipped";
      else if (delivery === "REFUSE" || delivery === "refusé" || delivery === "refuse") shippingStatus = "refused";
      else if (delivery === "REPORTE" || delivery === "reporté") shippingStatus = "scheduled";
    }

    const orderDateStr = row["Order date"] || "";
    let orderDate: string | null = null;
    if (orderDateStr) {
      try {
        const parsed = new Date(orderDateStr);
        if (!isNaN(parsed.getTime())) {
          orderDate = parsed.toISOString();
        }
      } catch {}
    }

    const variantPriceStr = row["Variant price"] || "";
    let total: number | null = null;
    if (variantPriceStr) {
      const parsed = typeof variantPriceStr === 'string' 
        ? parseFloat(variantPriceStr.replace(/[^\d.-]/g, '')) 
        : Number(variantPriceStr);
      total = isNaN(parsed) ? null : parsed;
    }

    const phone = row["Phone"] || "";
    const syncKey = `${phone}_${orderDate || "no-date"}`;

    result.phone = phone || null;
    result.first_name = row["First name"] || null;
    result.customer_name = row["First name"] || null;
    result.city = row["City"] || null;
    result.product_variant = row["Product variant"] || null;
    result.total = total;
    result.sku = sku;
    result.customer_ip = row["Customer IP"] || null;
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
    result.status = status;
    result.shipping_status = shippingStatus;
    result.order_date = orderDate;
    result.tracking_number = row["Tracking number"] || null;
    result.address = row["Address"] || null;
    result.sync_key = syncKey;
  }
  
  return result;
}

// ---------------------------------------------------------------------------
// Fast sync for a single workspace
// ---------------------------------------------------------------------------
async function fastSyncWorkspace(supabase: any, workspaceId: string, timing: SyncTiming): Promise<{ created: number; updated: number; errors: number; errorDetails: string[] }> {
  console.log(`[GS FAST SYNC] Starting fast sync for workspace ${workspaceId}`);
  
  // Get credentials and current checkpoint
  const { data: credentials, error: credError } = await supabase
    .from("google_sheets_credentials")
    .select("web_app_url, field_mappings, custom_status_mappings, last_processed_row, last_seen_sheet_row")
    .eq("workspace_id", workspaceId)
    .single();

  if (credError || !credentials?.web_app_url) {
    console.error(`[GS FAST SYNC] No web_app_url for workspace ${workspaceId}`);
    timing.error = "No web_app_url configured";
    return { created: 0, updated: 0, errors: 1, errorDetails: ["No web_app_url configured"] };
  }

  const webAppUrl = credentials.web_app_url;
  const fieldMappings = credentials.field_mappings;
  const customStatusMappings = credentials.custom_status_mappings;
  const lastProcessedRow = credentials.last_processed_row || 0;

  // ── Verify Google Sheets integration is still active for this workspace ─────
  const { data: isActive, error: activeError } = await supabase
    .rpc("is_google_sheets_integration_active", { p_workspace_id: workspaceId });

  if (activeError || !isActive) {
    console.error(`[GS FAST SYNC] Integration not active for workspace ${workspaceId}`);
    timing.error = "Integration not active";
    return { created: 0, updated: 0, errors: 1, errorDetails: ["Integration not active"] };
  }
  
  if (!validateFieldMappings(fieldMappings)) {
    timing.error = "Invalid field mappings";
    return { created: 0, updated: 0, errors: 1, errorDetails: ["Invalid field mappings"] };
  }

  // Step 1: Check sheet metadata (cheap operation)
  let metaResponse: any;
  try {
    const metaUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}mode=meta`;
    console.log(`[GS FAST SYNC] Fetching metadata from: ${metaUrl}`);
    const response = await fetch(metaUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    metaResponse = JSON.parse(text);
    timing.metaFetchCompletedAt = Date.now();
    console.log(`[GS FAST SYNC] Metadata:`, metaResponse);
  } catch (error: any) {
    console.error(`[GS FAST SYNC] Meta fetch failed:`, error);
    timing.error = `Meta fetch failed: ${error.message}`;
    await supabase.rpc("increment_google_sheets_sync_error", { p_workspace_id: workspaceId });
    return { created: 0, updated: 0, errors: 1, errorDetails: [`Meta fetch failed: ${error.message}`] };
  }

  const sheetLastRow = metaResponse.lastRow || 0;
  
  // Update last_seen_sheet_row
  await supabase
    .from("google_sheets_credentials")
    .update({ last_seen_sheet_row: sheetLastRow })
    .eq("workspace_id", workspaceId);

  // Step 2: Check if there are new rows
  if (sheetLastRow <= lastProcessedRow) {
    console.log(`[GS FAST SYNC] No new rows (sheetLastRow=${sheetLastRow}, lastProcessedRow=${lastProcessedRow})`);
    return { created: 0, updated: 0, errors: 0, errorDetails: [] };
  }

  timing.hadNewRows = true;
  console.log(`[GS FAST SYNC] New rows detected (sheetLastRow=${sheetLastRow}, lastProcessedRow=${lastProcessedRow})`);

  // Step 3: Fetch delta rows only
  let deltaData: any;
  try {
    const deltaUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}afterRow=${lastProcessedRow}`;
    console.log(`[GS FAST SYNC] Fetching delta from: ${deltaUrl}`);
    const response = await fetch(deltaUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    deltaData = JSON.parse(text);
    timing.deltaFetchCompletedAt = Date.now();
    console.log(`[GS FAST SYNC] Delta rows fetched:`, Array.isArray(deltaData) ? deltaData.length : "not an array");
  } catch (error: any) {
    console.error(`[GS FAST SYNC] Delta fetch failed:`, error);
    timing.error = `Delta fetch failed: ${error.message}`;
    await supabase.rpc("increment_google_sheets_sync_error", { p_workspace_id: workspaceId });
    return { created: 0, updated: 0, errors: 1, errorDetails: [`Delta fetch failed: ${error.message}`] };
  }

  if (!Array.isArray(deltaData) || deltaData.length === 0) {
    console.log(`[GS FAST SYNC] No delta data returned`);
    return { created: 0, updated: 0, errors: 0, errorDetails: [] };
  }

  timing.rowsFetched = deltaData.length;

  // Step 4: Process and upsert delta rows
  let processed = 0;
  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const row of deltaData) {
    try {
      const orderPayload = mapWebAppRow(row, workspaceId, fieldMappings, customStatusMappings);

      const { data: existingOrder, error: checkError } = await supabase
        .from("orders")
        .select("order_number")
        .eq("workspace_id", workspaceId)
        .eq("sync_key", orderPayload.sync_key)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(`Check existing order failed: ${checkError.message}`);
      }

      const isNewOrder = !existingOrder;
      let orderNumber: string;
      
      if (existingOrder?.order_number) {
        orderNumber = existingOrder.order_number;
      } else {
        const { data: nextNumberData, error: numberError } = await supabase
          .rpc("get_next_google_sheets_order_number", {
            p_workspace_id: workspaceId
          });

        if (numberError) {
          throw new Error(`Failed to get sequential order number: ${numberError.message}`);
        }

        orderNumber = nextNumberData as string;
      }

      orderPayload.order_number = orderNumber;

      const { error: upsertError } = await supabase
        .from("orders")
        .upsert(orderPayload, {
          onConflict: "workspace_id,sync_key",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        const detail = `[${orderPayload.sync_key}] ${upsertError.message}`;
        console.error("Upsert error:", detail);
        errorDetails.push(detail);
        errors++;
      } else {
        processed++;
        if (isNewOrder) {
          created++;
        } else {
          updated++;
        }
      }
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("Error processing row:", msg);
      errorDetails.push(msg);
      errors++;
    }
  }

  timing.dbUpsertCompletedAt = Date.now();
  timing.rowsImported = created + updated;

  // Step 5: Advance checkpoint ONLY after successful DB writes
  if (errors === 0 && processed > 0) {
    const newCheckpoint = lastProcessedRow + deltaData.length;
    console.log(`[GS FAST SYNC] Advancing checkpoint from ${lastProcessedRow} to ${newCheckpoint}`);
    
    const { error: updateError } = await supabase
      .from("google_sheets_credentials")
      .update({ 
        last_processed_row: newCheckpoint,
        last_successful_sync_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId);

    if (updateError) {
      console.error(`[GS FAST SYNC] Failed to update checkpoint:`, updateError);
      // Continue anyway - data was imported, just checkpoint update failed
    }
  } else if (errors > 0) {
    console.error(`[GS FAST SYNC] ${errors} errors occurred, not advancing checkpoint`);
    await supabase.rpc("increment_google_sheets_sync_error", { p_workspace_id: workspaceId });
  }

  return { created, updated, errors, errorDetails };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  console.log("[GS FAST SYNC] Function invoked, method:", req.method);
  
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    console.log("[GS FAST SYNC] Request body:", body);

    // If workspace_id is provided, sync only that workspace
    if (body.workspace_id) {
      const timing = createTiming(body.workspace_id);
      const result = await fastSyncWorkspace(supabase, body.workspace_id, timing);
      logTiming(timing);
      
      return new Response(JSON.stringify({
        success: result.errors === 0,
        message: `Processed ${result.created + result.updated} rows: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
        stats: { created: result.created, updated: result.updated, errors: result.errors },
        timing: {
          totalMs: timing.totalSyncMs,
          rowsFetched: timing.rowsFetched,
          rowsImported: timing.rowsImported,
          hadNewRows: timing.hadNewRows,
        },
        ...(result.errorDetails.length > 0 && { errorDetails: result.errorDetails }),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Otherwise, sync all workspaces with configured web_app_url
    const { data: workspaces, error: workspacesError } = await supabase
      .rpc("get_workspaces_needing_google_sheets_sync");

    if (workspacesError) {
      console.error("[GS FAST SYNC] Failed to get workspaces:", workspacesError);
      return new Response(JSON.stringify({ error: "Failed to get workspaces" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!workspaces || workspaces.length === 0) {
      console.log("[GS FAST SYNC] No workspaces need sync");
      return new Response(JSON.stringify({
        success: true,
        message: "No workspaces need sync",
        stats: { totalWorkspaces: 0, totalProcessed: 0, totalCreated: 0, totalUpdated: 0, totalErrors: 0 },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GS FAST SYNC] Syncing ${workspaces.length} workspaces`);

    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const allErrorDetails: string[] = [];
    const allTimings: SyncTiming[] = [];

    for (const workspace of workspaces) {
      const timing = createTiming(workspace.workspace_id);
      const result = await fastSyncWorkspace(supabase, workspace.workspace_id, timing);
      allTimings.push(timing);
      
      totalProcessed += result.created + result.updated;
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalErrors += result.errors;
      allErrorDetails.push(...result.errorDetails);
      
      logTiming(timing);
    }

    return new Response(JSON.stringify({
      success: totalErrors === 0,
      message: `Synced ${workspaces.length} workspaces: ${totalProcessed} rows processed (${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors)`,
      stats: {
        totalWorkspaces: workspaces.length,
        totalProcessed,
        totalCreated,
        totalUpdated,
        totalErrors,
      },
      timings: allTimings.map(t => ({
        workspace_id: t.workspace_id,
        totalMs: t.totalSyncMs,
        rowsFetched: t.rowsFetched,
        rowsImported: t.rowsImported,
        hadNewRows: t.hadNewRows,
      })),
      ...(allErrorDetails.length > 0 && { errorDetails: allErrorDetails }),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[GS FAST SYNC] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
