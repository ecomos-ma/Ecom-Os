import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { frontendAppUrl, frontendOrigins } from "../_shared/app-url.ts";
import { ensureYouCanWebhooks, persistEncryptedTokens, requiredYouCanEnv, YOUCAN_REQUIRED_SCOPES, youcanRequest } from "../_shared/youcan.ts";

const allowedOrigins = frontendOrigins();
function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return { ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json", Vary: "Origin" };
}
function settingsRedirect(status: "success" | "error", reason?: string): string {
  const target = new URL("/settings?tab=integrations", `${frontendAppUrl()}/`);
  target.searchParams.set("youcan", status);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  const browser = req.method === "GET";
  if (!browser && req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(req) });
  try {
    const input = browser ? new URL(req.url).searchParams : await req.json().catch(() => ({}));
    const code = browser ? input.get("code") : (typeof input.code === "string" ? input.code : null);
    const state = browser ? input.get("state") : (typeof input.state === "string" ? input.state : null);
    if (!code || !state) throw new Error("missing_oauth_parameters");
    const client = createClient(requiredYouCanEnv("SUPABASE_URL"), requiredYouCanEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const consumed = await client.from("youcan_oauth_states").update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", await sha256(state)).is("consumed_at", null).gt("expires_at", new Date().toISOString())
      .select("workspace_id,user_id").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("invalid_oauth_state");
    const workspaceId = consumed.data.workspace_id;
    const userId = consumed.data.user_id;
    const [{ data: membership }, { data: access }, { data: owner }] = await Promise.all([
      client.from("profile_workspaces").select("status").eq("profile_id", userId).eq("workspace_id", workspaceId).maybeSingle(),
      client.rpc("resolve_workspace_access_v1", { p_user_id: userId, p_workspace_id: workspaceId }),
      client.from("workspace_subscription_owners").select("owner_user_id").eq("workspace_id", workspaceId).maybeSingle(),
    ]);
    if (membership?.status !== "active" || !access?.allowed || !owner?.owner_user_id) throw new Error("workspace_access_denied");

    const tokenResponse = await fetch("https://api.youcan.shop/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: requiredYouCanEnv("YOUCAN_CLIENT_ID"), client_secret: requiredYouCanEnv("YOUCAN_CLIENT_SECRET"), redirect_uri: requiredYouCanEnv("YOUCAN_REDIRECT_URI"), code }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) {
      const providerError = await tokenResponse.json().catch(() => null) as Record<string, unknown> | null;
      const providerCode = typeof providerError?.error === "string" ? providerError.error : "unknown";
      console.error("[YouCan OAuth] token_exchange_failed", tokenResponse.status, providerCode);
      if (providerCode === "invalid_client") throw new Error("client_credentials_rejected");
      if (providerCode === "invalid_grant") throw new Error("authorization_code_rejected");
      throw new Error("provider_token_exchange_failed");
    }
    const token = await tokenResponse.json();
    if (!token?.access_token) throw new Error("provider_token_response_invalid");
    const store = await youcanRequest(String(token.access_token), "/me");
    const externalStoreId = String(store?.store_id ?? store?.id ?? "").trim();
    if (!externalStoreId) throw new Error("provider_store_identity_invalid");
    const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
    const domain = String(store?.domain ?? "").trim() || null;
    const slug = String(store?.slug ?? "").trim() || null;
    const publicUrl = domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : (slug ? `https://${slug}.youcan.store` : null);
    const granted = String(token.scope ?? "").split(/[\s,]+/).filter(Boolean);
    const { data: integration, error: integrationError } = await client.from("integrations").upsert({
      user_id: owner.owner_user_id, workspace_id: workspaceId, provider: "youcan", status: "active",
      external_store_id: externalStoreId, store_name: String(store?.name ?? slug ?? "YouCan Store"), store_slug: slug,
      store_domain: domain, store_public_url: publicUrl, store_logo_url: store?.logo ?? null,
      store_currency: store?.currency?.code ?? store?.currency ?? null, provider_store_status: store?.status_text ?? store?.status ?? null,
      provider_store_active: store?.is_active ?? null, granted_scopes: granted.length ? granted : [...YOUCAN_REQUIRED_SCOPES],
      needs_reconnect: false, webhook_health: "pending", connected_at: new Date().toISOString(), disconnected_at: null,
      meta: { store_slug: slug, store_domain: domain }, updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider" }).select("id").single();
    if (integrationError || !integration?.id) throw new Error("integration_persistence_failed");
    await persistEncryptedTokens(client, integration.id, String(token.access_token), token.refresh_token ? String(token.refresh_token) : null, expiresAt);

    await Promise.all([
      client.from("workspaces").update({ youcan_access_token: null, youcan_refresh_token: null, youcan_token_expires_at: null, youcan_webhook_id: null }).eq("id", workspaceId),
      client.from("youcan_tokens").delete().eq("workspace_id", workspaceId),
      client.from("integration_sync_state").upsert({ workspace_id: workspaceId, provider: "youcan", enabled: true, consecutive_failures: 0, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,provider" }),
      client.from("youcan_financial_snapshots").insert({ workspace_id: workspaceId, integration_id: integration.id, currency: store?.currency?.code ?? store?.currency ?? null, balance: Number(store?.balance ?? 0), due_amount: Number(store?.due_amount ?? 0), unpaid_invoices_amount: Number(store?.unpaid_invoices_amount ?? 0), provider_store_status: store?.status_text ?? store?.status ?? null }),
    ]);
    const webhook = await ensureYouCanWebhooks(client, integration.id, workspaceId, String(token.access_token));
    const bucket = new Date().toISOString().slice(0, 13);
    await Promise.all(["orders", "products", "checkout_fields", "finance"].map((jobType) => client.from("youcan_sync_jobs").upsert({ workspace_id: workspaceId, integration_id: integration.id, job_type: jobType, idempotency_key: `oauth:${bucket}:${jobType}`, payload: {}, status: "pending", available_at: new Date().toISOString() }, { onConflict: "workspace_id,integration_id,job_type,idempotency_key" })));
    if (browser) return Response.redirect(settingsRedirect("success", webhook.healthy ? undefined : "sync_initializing"), 302);
    return new Response(JSON.stringify({ success: true, live_sync: webhook.healthy }), { headers: headers(req) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "connection_failed";
    console.error("[YouCan OAuth]", reason);
    const safeReason = ["client_credentials_rejected", "authorization_code_rejected", "expired_oauth_state", "invalid_oauth_state"].includes(reason) ? reason : "connection_failed";
    if (browser) return Response.redirect(settingsRedirect("error", safeReason), 302);
    return new Response(JSON.stringify({ error: "YouCan connection failed", reason: safeReason }), { status: safeReason === "client_credentials_rejected" ? 502 : 400, headers: headers(req) });
  }
});
