// deno-lint-ignore-file no-explicit-any
/**
 * cron-sync-shipments — Backend shipment status polling cron.
 *
 * Called by pg_cron every 1 minute. Checks configurable interval per workspace
 * and polls each provider's API to update delivery_status only when enough time
 * has passed since the last sync for that specific workspace.
 *
 * Coliaty and SendIt already use webhooks — but this function acts as a
 * safety fallback for any missed webhooks and handles Ozon, Ameex, ForceLog.
 *
 * Active statuses polled:
 *   NEW_PARCEL, WAITING_PICKUP, PICKED_UP, IN_DISTRIBUTION, IN_TRANSIT,
 *   OUT_FOR_DELIVERY, RECEIVED_AT_WAREHOUSE
 *
 * Final statuses that stop polling:
 *   DELIVERED, RETURNED_TO_SENDER, CANCELLED, REFUSED
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ── Active shipping statuses that still need polling ─────────────────────────
const ACTIVE_STATUSES = new Set([
    "NEW_PARCEL", "new_parcel",
    "WAITING_PICKUP", "waiting_pickup", "awaiting_pickup",
    "PICKED_UP", "picked_up",
    "RECEIVED_AT_WAREHOUSE", "received_at_warehouse",
    "IN_DISTRIBUTION", "in_distribution",
    "IN_TRANSIT", "in_transit", "in transit",
    "OUT_FOR_DELIVERY", "out_for_delivery", "out for delivery",
    null, undefined, "", // also poll orders without any status yet
]);

// ── Ozon status normalization ─────────────────────────────────────────────────
function normalizeOzonStatus(s: string): string {
    const map: Record<string, string> = {
        "Nouveau Colis": "NEW_PARCEL",
        "Ramassé": "PICKED_UP",
        "En Transit": "IN_DISTRIBUTION",
        "En Livraison": "OUT_FOR_DELIVERY",
        "Livré": "DELIVERED",
        "Refusé": "REFUSED",
        "Retourné": "RETURNED_TO_SENDER",
        "Annulé": "CANCELLED",
        "new parcel": "NEW_PARCEL",
        "picked up": "PICKED_UP",
        "in distribution": "IN_DISTRIBUTION",
        "out for delivery": "OUT_FOR_DELIVERY",
        "delivered": "DELIVERED",
        "refused": "REFUSED",
        "returned": "RETURNED_TO_SENDER",
        "cancelled": "CANCELLED",
        "canceled": "CANCELLED",
    };
    return map[s] ?? map[s.toLowerCase()] ?? s;
}

// ── Ozon API tracking ─────────────────────────────────────────────────────────
async function trackOzon(
    clientId: string,
    apiKey: string,
    trackingNumber: string
): Promise<{ status: string | null; raw: any }> {
    try {
        const res = await fetch("https://api.ozonexpress.ma/api/track", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "X-Client-Id": clientId,
            },
            body: JSON.stringify({ reference: trackingNumber }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: null, raw: `HTTP ${res.status}` };
        const json = await res.json();
        const raw = json?.TRACKING?.LAST_TRACKING?.STATUT ?? json?.status ?? json?.current_status ?? null;
        if (!raw) return { status: null, raw: json };
        return { status: normalizeOzonStatus(raw), raw: json };
    } catch (e: any) {
        return { status: null, raw: e.message };
    }
}

// ── Coliaty tracking (fallback for missed webhooks) ───────────────────────────
async function trackColiaty(
    apiKey: string,
    trackingNumber: string
): Promise<{ status: string | null; raw: any }> {
    try {
        const res = await fetch(`https://app.coliaty.ma/api/parcels/${trackingNumber}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: null, raw: `HTTP ${res.status}` };
        const json = await res.json();
        const statusMap: Record<string, string> = {
            "pending": "NEW_PARCEL",
            "awaiting_pickup": "WAITING_PICKUP",
            "picked_up": "PICKED_UP",
            "in_transit": "IN_TRANSIT",
            "out_for_delivery": "OUT_FOR_DELIVERY",
            "delivered": "DELIVERED",
            "no_answer": "NO_ANSWER",
            "refused": "REFUSED",
            "returned": "RETURNED_TO_SENDER",
            "cancelled": "CANCELLED",
        };
        const rawStatus = (json?.status || "").toLowerCase();
        return { status: statusMap[rawStatus] ?? rawStatus, raw: json };
    } catch (e: any) {
        return { status: null, raw: e.message };
    }
}

// ── SendIt tracking ───────────────────────────────────────────────────────────
async function trackSendIt(
    apiKey: string,
    trackingNumber: string
): Promise<{ status: string | null; raw: any }> {
    try {
        const res = await fetch(`https://api.sendit.ma/api/v1/parcels/${trackingNumber}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: null, raw: `HTTP ${res.status}` };
        const json = await res.json();
        const rawStatus = (json?.data?.status || json?.status || "").toUpperCase();
        return { status: rawStatus || null, raw: json };
    } catch (e: any) {
        return { status: null, raw: e.message };
    }
}

// ── ForceLog tracking ─────────────────────────────────────────────────────────
async function trackForceLog(
    apiKey: string,
    trackingNumber: string
): Promise<{ status: string | null; raw: any }> {
    try {
        const res = await fetch(`https://api.forcelog.ma/v1/tracking/${trackingNumber}`, {
            headers: { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: null, raw: `HTTP ${res.status}` };
        const json = await res.json();
        const rawStatus = (json?.status || json?.current_status || "").toUpperCase();
        return { status: rawStatus || null, raw: json };
    } catch (e: any) {
        return { status: null, raw: e.message };
    }
}

// ── Ameex tracking ────────────────────────────────────────────────────────────
async function trackAmeex(
    apiKey: string,
    trackingNumber: string
): Promise<{ status: string | null; raw: any }> {
    try {
        const res = await fetch(`https://api.ameex.ma/v2/orders/${trackingNumber}/tracking`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { status: null, raw: `HTTP ${res.status}` };
        const json = await res.json();
        const rawStatus = (json?.data?.status || json?.status || "").toUpperCase();
        return { status: rawStatus || null, raw: json };
    } catch (e: any) {
        return { status: null, raw: e.message };
    }
}

// ── Load platform setting for refresh interval ───────────────────────────────
async function getRefreshIntervalMinutes(supabase: any): Promise<number> {
    const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("setting_key", "shipping_tracking_refresh_interval_minutes")
        .single();
    
    // Value is stored as JSONB, need to extract the number
    const interval = data?.value ? Number(data.value) : 10;
    // Ensure minimum 5 minutes even if DB has lower value
    return Math.max(interval, 5);
}

// ── Check if workspace is due for sync (per-workspace scoping) ─────────────────
async function shouldSyncWorkspace(supabase: any, workspaceId: string, intervalMinutes: number): Promise<boolean> {
    const { data } = await supabase
        .from("workspaces")
        .select("last_tracking_sync_at")
        .eq("id", workspaceId)
        .single();
    
    // If never synced, always sync
    if (!data?.last_tracking_sync_at) return true;
    
    const lastSync = new Date(data.last_tracking_sync_at).getTime();
    const now = Date.now();
    const elapsedMinutes = (now - lastSync) / 60000;
    
    // Sync if enough time has passed for THIS workspace
    return elapsedMinutes >= intervalMinutes;
}

// ── Update workspace last sync timestamp ─────────────────────────────────────
async function updateWorkspaceSyncTime(supabase: any, workspaceId: string): Promise<void> {
    await supabase
        .from("workspaces")
        .update({ last_tracking_sync_at: new Date().toISOString() })
        .eq("id", workspaceId);
}

// ── Load workspace shipping credentials ───────────────────────────────────────
async function loadWorkspaceCredentials(supabase: any, workspaceId: string): Promise<Record<string, any>> {
    const { data } = await supabase
        .from("shipping_provider_credentials")
        .select("provider, credentials")
        .eq("workspace_id", workspaceId);

    const creds: Record<string, any> = {};
    for (const row of data ?? []) {
        creds[row.provider] = row.credentials;
    }

    // Also check workspace_ozon_credentials style tables
    const { data: ozonCred } = await supabase
        .from("workspaces")
        .select("ozon_client_id, ozon_api_key")
        .eq("id", workspaceId)
        .single();
    if (ozonCred?.ozon_client_id) {
        creds["ozon"] = creds["ozon"] ?? { client_id: ozonCred.ozon_client_id, api_key: ozonCred.ozon_api_key };
    }

    return creds;
}

// ── Track a single order ──────────────────────────────────────────────────────
async function trackOrder(
    order: any,
    creds: Record<string, any>
): Promise<{ status: string | null; raw: any }> {
    const provider = (order.shipping_provider ?? "ozon").toLowerCase();
    const tracking = order.tracking_number;
    if (!tracking) return { status: null, raw: "no_tracking_number" };

    switch (provider) {
        case "ozon": {
            const c = creds["ozon"] ?? {};
            if (!c.client_id || !c.api_key) return { status: null, raw: "missing_ozon_credentials" };
            return trackOzon(c.client_id, c.api_key, tracking);
        }
        case "coliaty": {
            const c = creds["coliaty"] ?? {};
            if (!c.api_key) return { status: null, raw: "missing_coliaty_credentials" };
            return trackColiaty(c.api_key, tracking);
        }
        case "sendit": {
            const c = creds["sendit"] ?? {};
            if (!c.api_key) return { status: null, raw: "missing_sendit_credentials" };
            return trackSendIt(c.api_key, tracking);
        }
        case "forcelog": {
            const c = creds["forcelog"] ?? {};
            if (!c.api_key) return { status: null, raw: "missing_forcelog_credentials" };
            return trackForceLog(c.api_key, tracking);
        }
        case "ameex": {
            const c = creds["ameex"] ?? {};
            if (!c.api_key) return { status: null, raw: "missing_ameex_credentials" };
            return trackAmeex(c.api_key, tracking);
        }
        default:
            return { status: null, raw: `unsupported_provider:${provider}` };
    }
}

// ── Main sync for a workspace ─────────────────────────────────────────────────
async function syncWorkspaceShipments(supabase: any, workspaceId: string): Promise<{ updated: number; errors: number }> {
    const creds = await loadWorkspaceCredentials(supabase, workspaceId);

    // Fetch all active orders with tracking numbers
    const { data: allActiveOrders, error: fetchErr } = await supabase
        .from("orders")
        .select("id, order_number, tracking_number, shipping_provider, delivery_status, shipping_status, last_shipping_sync_at")
        .eq("workspace_id", workspaceId)
        .not("tracking_number", "is", null)
        .not("tracking_number", "eq", "")
        .not("delivery_status", "in", '("DELIVERED","RETURNED_TO_SENDER","CANCELLED","REFUSED","delivered","returned","cancelled","refused")');

    if (fetchErr) {
        console.error(`[ShipSync] Workspace ${workspaceId} fetch error:`, fetchErr.message);
        return { updated: 0, errors: 1 };
    }

    // Filter in JS to strictly respect the 1m / 2m / 5m scheduling rules.
    const now = Date.now();
    const orders = (allActiveOrders || []).filter((order: any) => {
        const lastSync = order.last_shipping_sync_at ? new Date(order.last_shipping_sync_at).getTime() : 0;
        const elapsedMinutes = (now - lastSync) / 60000;

        // Always sync if never synced
        if (lastSync === 0) return true;

        const normalizedStatus = (order.shipping_status || "").toUpperCase();

        // NEW_PARCEL -> Sync every 1 minute (initial reconciliation 30-60s)
        if (normalizedStatus === "NEW_PARCEL") return elapsedMinutes >= 1;

        // Final Mile -> Sync every 2 minutes for tight updates
        if (normalizedStatus === "IN_DISTRIBUTION" || normalizedStatus === "OUT_FOR_DELIVERY") return elapsedMinutes >= 2;

        // Standard normal transit -> Sync every 5 minutes
        return elapsedMinutes >= 5;
    });

    console.log(`[ShipSync] Workspace ${workspaceId}: ${allActiveOrders?.length} active orders, ${orders.length} due for sync now based on schedules.`);

    let updated = 0;
    let errors = 0;

    // Process in batches of 10 to avoid rate limit issues
    const BATCH = 10;
    for (let i = 0; i < (orders ?? []).length; i += BATCH) {
        const batch = (orders ?? []).slice(i, i + BATCH);

        await Promise.all(batch.map(async (order: any) => {
            try {
                const { status: newStatus, raw } = await trackOrder(order, creds);
                if (!newStatus || newStatus === order.delivery_status) return;

                const { error: updateErr } = await supabase
                    .from("orders")
                    .update({
                        delivery_status: newStatus,
                        shipping_status: newStatus,
                        shipping_status_raw: raw,
                        last_shipping_sync_at: new Date().toISOString(),
                        shipping_updated_at: new Date().toISOString(),
                    })
                    .eq("id", order.id);

                if (updateErr) {
                    console.error(`[ShipSync] Update error for ${order.order_number}:`, updateErr.message);
                    errors++;
                } else {
                    console.log(`[ShipSync] ${order.order_number}: ${order.delivery_status} → ${newStatus}`);
                    updated++;
                }
            } catch (e: any) {
                console.error(`[ShipSync] Error for ${order.order_number}:`, e.message);
                errors++;
            }
        }));

        // Small delay between batches
        if (i + BATCH < (orders ?? []).length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // Log sync summary
    await supabase.from("shipping_sync_logs").insert({
        workspace_id: workspaceId,
        orders_checked: (orders ?? []).length,
        orders_updated: updated,
        errors,
        synced_at: new Date().toISOString(),
    }).catch(() => { /* ignore log failures */ });

    // Update global integration state
    await supabase.from("integration_sync_state").upsert({
        workspace_id: workspaceId,
        provider: "shipping",
        last_sync_completed_at: new Date().toISOString(),
        last_success_at: errors === 0 ? new Date().toISOString() : null,
        last_error: errors > 0 ? `${errors} failed shipment tracks` : null,
    }, { onConflict: "workspace_id, provider" }).catch(() => { });

    return { updated, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // Authenticate cron calls
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (CRON_SECRET) {
        const authHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization");
        const provided = authHeader?.replace("Bearer ", "");
        if (provided !== CRON_SECRET) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get configurable refresh interval (default 10 minutes, minimum 5)
    const intervalMinutes = await getRefreshIntervalMinutes(supabase);
    console.log(`[ShipSync] Configured refresh interval: ${intervalMinutes} minutes`);

    // Find all distinct workspaces that have active orders with tracking numbers
    const { data: workspaces } = await supabase
        .from("orders")
        .select("workspace_id")
        .not("tracking_number", "is", null)
        .not("tracking_number", "eq", "")
        .not("delivery_status", "in", '("DELIVERED","RETURNED_TO_SENDER","CANCELLED","REFUSED","delivered","returned","cancelled","refused")')
        .limit(500);

    const workspaceIds = [...new Set((workspaces ?? []).map((r: any) => r.workspace_id))];
    console.log(`[ShipSync] Found ${workspaceIds.length} workspace(s) with active shipments`);

    // Filter workspaces that are due for sync (PER-WORKSPACE SCOPING)
    const workspacesToSync: string[] = [];
    for (const wid of workspaceIds) {
        if (await shouldSyncWorkspace(supabase, wid, intervalMinutes)) {
            workspacesToSync.push(wid);
        }
    }
    
    console.log(`[ShipSync] ${workspacesToSync.length} workspace(s) due for sync (interval: ${intervalMinutes}min)`);

    const results: Record<string, any> = {};
    for (const wid of workspacesToSync) {
        try {
            results[wid] = await syncWorkspaceShipments(supabase, wid);
            // Update this workspace's last sync time (PER-WORKSPACE SCOPING)
            await updateWorkspaceSyncTime(supabase, wid);
        } catch (e: any) {
            console.error(`[ShipSync] Workspace ${wid} fatal error:`, e.message);
            results[wid] = { updated: 0, errors: 1, fatal: e.message };
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        total_workspaces: workspaceIds.length,
        synced_workspaces: workspacesToSync.length,
        interval_minutes: intervalMinutes,
        results 
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
