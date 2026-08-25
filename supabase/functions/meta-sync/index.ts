// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v20.0";

// ─── Fetch all pages from a Meta API endpoint ────────────────────────────────
async function fetchAllPages(url: string, token: string, log?: (stage: string, message: string, details?: any) => void): Promise<any[]> {
    const results: any[] = [];
    let nextUrl: string | null = url;
    let pageCount = 0;

    while (nextUrl) {
        pageCount++;
        log?.("META", `Fetching page ${pageCount}`, { url: nextUrl.substring(0, 100) + "..." });

        const res = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const errText = await res.text();
            log?.("META", `Meta API request failed`, { status: res.status, error: errText });

            if (res.status === 401 || errText.includes("OAuthException")) {
                throw new Error(`META_TOKEN_EXPIRED: ${errText}`);
            }
            if (res.status === 403) {
                throw new Error(`META_PERMISSION_DENIED: ${errText}`);
            }
            if (res.status === 429) {
                throw new Error(`META_RATE_LIMIT: ${errText}`);
            }
            throw new Error(`Meta API error ${res.status}: ${errText}`);
        }

        const json = await res.json();
        if (json.error) {
            log?.("META", "Meta API returned error", { error: json.error });
            throw new Error(`Meta API error: ${json.error.message} (code ${json.error.code})`);
        }

        if (Array.isArray(json.data)) {
            results.push(...json.data);
            log?.("META", `Fetched ${json.data.length} items`, { totalSoFar: results.length });
        }

        nextUrl = json.paging?.next ?? null;

        // Safety limit to prevent infinite loops
        if (pageCount > 100) {
            log?.("META", "Reached page limit, stopping pagination", { pageCount, totalItems: results.length });
            break;
        }
    }

    log?.("META", "Pagination complete", { totalPages: pageCount, totalItems: results.length });
    return results;
}

serve(async (req) => {
    // ── CORS preflight ─────────────────────────────────────────────────────────────
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // ── Structured logging helper ────────────────────────────────────────────────────
    const log = (stage: string, message: string, details?: any) => {
        console.log(`[META-SYNC] [${stage}] ${message}`, details ? JSON.stringify(details) : "");
    };

    let notificationClient: any = null;
    let notificationWorkspaceId: string | null = null;
    try {
        log("REQUEST", "Incoming request", { method: req.method, contentType: req.headers.get("content-type") });

        let datePreset = "maximum"; // Default to lifetime
        let timeRange: { since: string; until: string } | null = null;
        let bodyWorkspaceId: string | null = null;

        if (req.method === "POST" && req.headers.get("content-type")?.includes("json")) {
            const body = await req.clone().json().catch(() => ({}));
            if (body.date_preset) datePreset = body.date_preset;
            if (body.time_range) timeRange = body.time_range;
            if (body.workspace_id) bodyWorkspaceId = body.workspace_id;
            log("REQUEST", "Parsed request body", { datePreset, hasTimeRange: !!timeRange, bodyWorkspaceId });
        }

        // ── Environment validation ───────────────────────────────────────────────────
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            log("ERROR", "Missing environment variables", { hasUrl: !!SUPABASE_URL, hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "environment",
                    reason: "Missing required environment variables",
                    details: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured"
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── Authentication: Extract and validate JWT ─────────────────────────────────
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            log("AUTH", "Missing Authorization header");
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "authentication",
                    reason: "Missing Authorization header",
                    details: "The request must include an Authorization header with a valid JWT token"
                }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const jwt = authHeader.replace("Bearer ", "").trim();
        if (!jwt) {
            log("AUTH", "Empty JWT token");
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "authentication",
                    reason: "Empty JWT token",
                    details: "The Authorization header contains an empty token"
                }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        log("AUTH", "JWT extracted", { tokenLength: jwt.length });

        // ── Create Supabase client with Service Role (for admin operations) ───────────
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        notificationClient = supabase;

        // ── Validate JWT and get user ─────────────────────────────────────────────────
        // CRITICAL FIX: Pass the JWT to getUser() to validate the token from the Authorization header
        const { data: authData, error: authError } = await supabase.auth.getUser(jwt);

        if (authError) {
            log("AUTH", "JWT validation failed", { error: authError.message, code: authError.status });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "authentication",
                    reason: "Invalid JWT token",
                    details: authError.message
                }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!authData.user) {
            log("AUTH", "No user found in JWT");
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "authentication",
                    reason: "No user in JWT",
                    details: "The JWT token is valid but does not contain user information"
                }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        log("AUTH", "User authenticated", { userId: authData.user.id, email: authData.user.email });

        // ── Resolve workspace_id ───────────────────────────────────────────────────────
        let workspaceId: string | null = bodyWorkspaceId;

        if (!workspaceId) {
            // Use the Service Role client to bypass RLS entirely so we securely fetch workspace
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("workspace_id")
                .eq("id", authData.user.id)
                .single();

            if (profileError) {
                log("DATABASE", "Failed to fetch user profile", { error: profileError.message, code: profileError.code });
                return new Response(
                    JSON.stringify({
                        success: false,
                        stage: "database",
                        reason: "Failed to fetch user profile",
                        details: profileError.message
                    }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            workspaceId = profile?.workspace_id ?? null;
            log("DATABASE", "Workspace resolved from profile", { workspaceId });
        } else {
            log("DATABASE", "Workspace ID from request body", { workspaceId });
        }
        notificationWorkspaceId = workspaceId;

        if (!workspaceId) {
            log("AUTH", "No workspace ID found");
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "authorization",
                    reason: "No workspace assigned",
                    details: "User does not have a workspace assigned. Please contact your administrator."
                }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── Fetch Meta configuration for this specific workspace ──────────────────
        const { data: workspaceData, error: wsError } = await supabase
            .from("workspaces")
            .select("meta_access_token, meta_ad_account_id")
            .eq("id", workspaceId)
            .single();

        if (wsError) {
            log("DATABASE", "Failed to fetch workspace configuration", { error: wsError.message, code: wsError.code });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "database",
                    reason: "Failed to fetch workspace configuration",
                    details: wsError.message
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!workspaceData) {
            log("DATABASE", "Workspace not found", { workspaceId });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "database",
                    reason: "Workspace not found",
                    details: `Workspace with ID ${workspaceId} does not exist`
                }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const META_ACCESS_TOKEN = workspaceData.meta_access_token;
        const META_AD_ACCOUNT_ID = workspaceData.meta_ad_account_id;

        if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
            log("META", "Meta Ads not configured", { hasToken: !!META_ACCESS_TOKEN, hasAccountId: !!META_AD_ACCOUNT_ID });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "configuration",
                    reason: "Meta Ads not configured",
                    details: "Meta Ads is not configured for this Workspace. Go to Settings > Workspace to add your System User Token and Ad Account ID."
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        log("META", "Configuration loaded", { accountId: META_AD_ACCOUNT_ID });

        // ── 1. Fetch campaign list ────────────────────────────────────────────────
        const campaignsUrl =
            `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}/campaigns` +
            `?fields=id,name,status,daily_budget,lifetime_budget&limit=200`;

        let campaigns;
        try {
            campaigns = await fetchAllPages(campaignsUrl, META_ACCESS_TOKEN, log);
        } catch (metaError) {
            log("META", "Failed to fetch campaigns", { error: String(metaError) });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "meta_api",
                    reason: "Failed to fetch campaigns from Meta",
                    details: String(metaError)
                }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (campaigns.length === 0) {
            log("META", "No campaigns found", { accountId: META_AD_ACCOUNT_ID });
            return new Response(
                JSON.stringify({ ok: true, synced: 0, message: "No campaigns found in this ad account." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        log("META", "Campaigns fetched", { count: campaigns.length });

        // ── 2. Fetch insights for all campaigns ───────────────────────────────────
        let insightsUrl =
            `https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}/insights` +
            `?level=campaign` +
            `&fields=campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type` +
            `&limit=200`;

        if (datePreset === "custom" && timeRange) {
            insightsUrl += `&time_range=${encodeURIComponent(JSON.stringify(timeRange))}`;
        } else {
            insightsUrl += `&date_preset=${datePreset}`;
        }

        log("META", "Fetching insights", { datePreset, hasCustomRange: !!timeRange });

        let insights;
        try {
            insights = await fetchAllPages(insightsUrl, META_ACCESS_TOKEN, log);
        } catch (metaError) {
            log("META", "Failed to fetch insights", { error: String(metaError) });
            return new Response(
                JSON.stringify({
                    success: false,
                    stage: "meta_api",
                    reason: "Failed to fetch insights from Meta",
                    details: String(metaError)
                }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        log("META", "Insights fetched", { count: insights.length });

        // Attempt to fetch the ad account currency for formatting consistency
        let accountCurrency: string | null = null;
        try {
            const accRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${META_AD_ACCOUNT_ID}?fields=account_currency`, {
                headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
            });
            if (accRes.ok) {
                const accJson = await accRes.json();
                if (accJson && accJson.account_currency) accountCurrency = String(accJson.account_currency).toUpperCase();
            }
        } catch (e) {
            // Non-fatal — currency is best-effort
            log("META", "Failed to fetch ad account currency (non-fatal)", { error: String(e) });
        }

        const insightsMap = new Map<string, any>();
        for (const ins of insights) {
            insightsMap.set(ins.campaign_id, ins);
        }

        // ── 3. Upsert into Supabase (scoped to workspace) ─────────────────────────
        log("DATABASE", "Starting upsert operations", { campaignCount: campaigns.length });
        let synced = 0;
        let upsertErrors = 0;

        for (const campaign of campaigns) {
            const ins = insightsMap.get(campaign.id);

            let results = 0;
            let costPerResult = 0;

            if (ins?.actions) {
                for (const action of ins.actions) {
                    if (
                        action.action_type === "lead" ||
                        action.action_type === "purchase" ||
                        action.action_type === "omni_purchase" ||
                        action.action_type === "complete_registration"
                    ) {
                        results += Number(action.value ?? 0);
                    }
                }
            }

            if (ins?.cost_per_action_type) {
                for (const cpa of ins.cost_per_action_type) {
                    if (
                        cpa.action_type === "lead" ||
                        cpa.action_type === "purchase" ||
                        cpa.action_type === "omni_purchase"
                    ) {
                        costPerResult = Number(cpa.value ?? 0);
                        break;
                    }
                }
            }

            const budget = campaign.daily_budget
                ? Number(campaign.daily_budget) / 100
                : campaign.lifetime_budget
                    ? Number(campaign.lifetime_budget) / 100
                    : null;

            const payload = {
                meta_campaign_id: campaign.id,
                workspace_id: workspaceId,
                campaign_name: campaign.name,
                status: campaign.status ?? "UNKNOWN",
                budget,
                spend: ins ? Number(ins.spend ?? 0) : 0,
                reach: ins ? Number(ins.reach ?? 0) : 0,
                impressions: ins ? Number(ins.impressions ?? 0) : 0,
                clicks: ins ? Number(ins.clicks ?? 0) : 0,
                ctr: ins ? Number(ins.ctr ?? 0) : 0,
                cpc: ins ? Number(ins.cpc ?? 0) : 0,
                cpm: ins ? Number(ins.cpm ?? 0) : 0,
                frequency: ins ? Number(ins.frequency ?? 0) : 0,
                results,
                cost_per_result: costPerResult,
                updated_at: new Date().toISOString(),
            };

            log("DATABASE", "Attempting upsert", {
                campaignId: campaign.id,
                payloadKeys: Object.keys(payload),
                hasWorkspaceId: !!payload.workspace_id,
                hasMetaCampaignId: !!payload.meta_campaign_id,
                onConflict: "meta_campaign_id"
            });

            const { error } = await supabase
                .from("meta_campaigns")
                .upsert(payload, { onConflict: "meta_campaign_id" });

            if (error) {
                log("DATABASE", "Failed to upsert campaign - COMPLETE ERROR", {
                    campaignId: campaign.id,
                    completeError: error,
                    errorMessage: error.message,
                    errorCode: error.code,
                    errorDetails: error.details,
                    errorHint: error.hint,
                    payload: payload
                });
                upsertErrors++;
            } else {
                log("DATABASE", "Successfully upserted campaign", { campaignId: campaign.id });
                synced++;
            }
        }

        log("SYNC", "Upsert complete", { synced, errors: upsertErrors, total: campaigns.length });

        return new Response(
            JSON.stringify({
                success: true,
                synced,
                errors: upsertErrors,
                workspace_id: workspaceId,
                total_campaigns: campaigns.length,
                total_with_insights: insights.length,
                currency: accountCurrency,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        log("ERROR", "Unhandled exception in meta-sync", { error: String(err), stack: err.stack });

        const isTokenError = err.message?.startsWith("META_TOKEN_EXPIRED");
        const isPermissionError = err.message?.startsWith("META_PERMISSION_DENIED");
        const isRateLimitError = err.message?.startsWith("META_RATE_LIMIT");

        let stage = "unknown";
        let reason = "Unknown error";
        let details = err.message;
        let status = 500;

        if (isTokenError) {
            stage = "meta_api";
            reason = "Meta access token expired";
            details = "Your Meta access token has expired. Please regenerate it in Meta Business Suite.";
            status = 401;
        } else if (isPermissionError) {
            stage = "meta_api";
            reason = "Meta permission denied";
            details = "Your Meta token does not have sufficient permissions. Check your Business Manager settings.";
            status = 403;
        } else if (isRateLimitError) {
            stage = "meta_api";
            reason = "Meta rate limit exceeded";
            details = "You have exceeded Meta's API rate limit. Please try again later.";
            status = 429;
        }

        if (notificationClient && notificationWorkspaceId) {
            const eventKey = isTokenError ? "ads.token_expired" : "ads.meta_sync_failed";
            try {
                await notificationClient.rpc("emit_notification_event_service", {
                    p_workspace_id: notificationWorkspaceId,
                    p_event_key: eventKey,
                    p_related_entity_type: "meta_integration",
                    p_related_entity_id: null,
                    p_payload: {
                        title: isTokenError ? "Meta authorization expired" : "Meta Ads sync failed",
                        message: isTokenError ? "Reconnect Meta Ads to resume synchronization." : "Meta Ads could not be synchronized. Review the integration status.",
                        action_url: "/settings?tab=integrations",
                        provider: "meta",
                    },
                    p_dedupe_key: `${eventKey}:${notificationWorkspaceId}:meta`,
                    p_recipient_user_id: null,
                    p_source_event_id: `meta-sync:${Date.now()}`,
                });
            } catch {
                // Notification failure must not replace the original sync response.
            }
        }

        return new Response(
            JSON.stringify({
                success: false,
                stage,
                reason,
                details,
                token_expired: isTokenError,
            }),
            {
                status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
