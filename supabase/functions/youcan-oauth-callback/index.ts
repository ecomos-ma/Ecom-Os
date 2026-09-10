import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { frontendAppUrl, frontendOrigins } from "../_shared/app-url.ts";
import {
  ensureYouCanWebhooks,
  persistEncryptedTokens,
  requiredYouCanEnv,
  YOUCAN_REQUIRED_SCOPES,
  YOUCAN_TOKEN_ENDPOINT,
  youcanOAuthConfig,
  youcanRequest,
} from "../_shared/youcan.ts";

const allowedOrigins = frontendOrigins();
const safeReasons = new Set([
  "access_denied",
  "invalid_client",
  "invalid_scope",
  "missing_code",
  "missing_state",
  "invalid_state",
  "expired_state",
  "replayed_state",
  "invalid_callback_signature",
  "token_exchange_failed",
  "store_info_failed",
  "store_already_connected",
  "database_save_failed",
  "initial_sync_failed",
]);

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
}

function settingsRedirect(status: "success" | "error", reason?: string): string {
  const target = new URL("/settings", `${frontendAppUrl()}/`);
  target.searchParams.set("tab", "integrations");
  target.searchParams.set("youcan", status);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}

function redirect(req: Request, status: "success" | "error", reason?: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...headers(req), Location: settingsRedirect(status, reason) },
  });
}

function log(stage: string, details: Record<string, string | number | boolean | null> = {}): void {
  console.info("[YouCan OAuth]", JSON.stringify({ stage, ...details }));
}

function safeProviderError(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64);
  return normalized || "provider_error";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function callbackHmacIsValid(params: URLSearchParams, clientSecret: string): Promise<boolean> {
  const signature = params.get("hmac");
  if (!signature) return true;
  const received = hexBytes(signature);
  if (!received) return false;
  const signed = new URLSearchParams(params);
  signed.delete("hmac");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed.toString())));
  return equalBytes(received, expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  const browser = req.method === "GET";
  if (!browser && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(req) });
  }

  try {
    const query = browser ? new URL(req.url).searchParams : null;
    const body = browser ? null : await req.json().catch(() => ({})) as Record<string, unknown>;
    const value = (name: string): string | null => {
      if (query) return query.get(name);
      const candidate = body?.[name];
      return typeof candidate === "string" ? candidate : null;
    };
    const code = value("code");
    const state = value("state");
    const providerError = safeProviderError(value("error"));
    const oauth = youcanOAuthConfig();

    log("youcan.oauth.callback", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      providerError,
      hasDescription: Boolean(value("error_description")),
      hasHint: Boolean(value("hint")),
    });

    if (!state) throw new Error("missing_state");
    if (query && !(await callbackHmacIsValid(query, oauth.clientSecret))) throw new Error("invalid_callback_signature");

    const client = createClient(
      requiredYouCanEnv("SUPABASE_URL"),
      requiredYouCanEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const stateHash = await sha256(state);
    const stateLookup = await client.from("youcan_oauth_states")
      .select("workspace_id,user_id,expires_at,consumed_at")
      .eq("state_hash", stateHash)
      .maybeSingle();
    if (stateLookup.error || !stateLookup.data) throw new Error("invalid_state");
    if (stateLookup.data.consumed_at) throw new Error("replayed_state");
    if (new Date(stateLookup.data.expires_at).getTime() <= Date.now()) throw new Error("expired_state");

    const workspaceId = stateLookup.data.workspace_id;
    const userId = stateLookup.data.user_id;
    const [{ data: membership }, { data: access }, { data: owner }] = await Promise.all([
      client.from("profile_workspaces").select("status").eq("profile_id", userId).eq("workspace_id", workspaceId).maybeSingle(),
      client.rpc("resolve_workspace_access_v1", { p_user_id: userId, p_workspace_id: workspaceId }),
      client.from("workspace_subscription_owners").select("owner_user_id").eq("workspace_id", workspaceId).maybeSingle(),
    ]);
    if (membership?.status !== "active" || !access?.allowed || !owner?.owner_user_id) throw new Error("invalid_state");
    const consumed = await client.from("youcan_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", stateHash)
      .is("consumed_at", null)
      .select("workspace_id")
      .maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("replayed_state");
    log("youcan.oauth.state_validated", { workspaceId });

    if (providerError) {
      log("youcan.oauth.provider_error", { providerError });
      if (["access_denied", "invalid_client", "invalid_scope"].includes(providerError)) throw new Error(providerError);
      throw new Error("token_exchange_failed");
    }
    if (!code) throw new Error("missing_code");

    log("youcan.oauth.token_exchange", { endpoint: YOUCAN_TOKEN_ENDPOINT, workspaceId });
    const tokenResponse = await fetch(YOUCAN_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        redirect_uri: oauth.redirectUri,
        code,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) {
      const providerBody = await tokenResponse.json().catch(() => null) as Record<string, unknown> | null;
      const tokenError = safeProviderError(typeof providerBody?.error === "string" ? providerBody.error : null);
      log("youcan.oauth.token_exchange_failed", { status: tokenResponse.status, providerError: tokenError });
      if (tokenError === "invalid_client") throw new Error("invalid_client");
      throw new Error("token_exchange_failed");
    }
    const token = await tokenResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!token || typeof token.access_token !== "string" || !token.access_token) throw new Error("token_exchange_failed");
    log("youcan.oauth.token_received", {
      hasAccessToken: true,
      hasRefreshToken: typeof token.refresh_token === "string" && Boolean(token.refresh_token),
    });

    let store: Record<string, any>;
    try {
      log("youcan.store.fetch", { workspaceId });
      store = await youcanRequest(token.access_token, "/me");
    } catch {
      throw new Error("store_info_failed");
    }
    const externalStoreId = String(store?.store_id ?? store?.id ?? "").trim();
    if (!externalStoreId) throw new Error("store_info_failed");

    const otherWorkspace = await client.from("integrations")
      .select("workspace_id")
      .eq("provider", "youcan")
      .eq("external_store_id", externalStoreId)
      .neq("workspace_id", workspaceId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (otherWorkspace.error) throw new Error("database_save_failed");
    if (otherWorkspace.data) throw new Error("store_already_connected");

    const expiresAt = typeof token.expires_in === "number" || typeof token.expires_in === "string"
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;
    const domain = String(store?.domain ?? "").trim() || null;
    const slug = String(store?.slug ?? "").trim() || null;
    const publicUrl = domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : (slug ? `https://${slug}.youcan.store` : null);
    const granted = String(token.scope ?? "").split(/[\s,]+/).filter(Boolean);
    const integrationResult = await client.from("integrations").upsert({
      user_id: owner.owner_user_id,
      workspace_id: workspaceId,
      provider: "youcan",
      status: "active",
      external_store_id: externalStoreId,
      store_name: String(store?.name ?? slug ?? "YouCan Store"),
      store_slug: slug,
      store_domain: domain,
      store_public_url: publicUrl,
      store_logo_url: store?.logo ?? null,
      store_currency: store?.currency?.code ?? store?.currency ?? null,
      provider_store_status: store?.status_text ?? store?.status ?? null,
      provider_store_active: store?.is_active ?? null,
      granted_scopes: granted.length ? granted : [...YOUCAN_REQUIRED_SCOPES],
      needs_reconnect: false,
      webhook_health: "pending",
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      meta: { store_slug: slug, store_domain: domain },
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider" }).select("id").single();
    if (integrationResult.error || !integrationResult.data?.id) throw new Error("database_save_failed");
    const integrationId = integrationResult.data.id;
    try {
      await persistEncryptedTokens(
        client,
        integrationId,
        token.access_token,
        typeof token.refresh_token === "string" ? token.refresh_token : null,
        expiresAt,
      );
    } catch {
      throw new Error("database_save_failed");
    }
    log("youcan.integration.save", { workspaceId, storeId: externalStoreId });

    const supportingWrites = await Promise.all([
      client.from("workspaces").update({ youcan_access_token: null, youcan_refresh_token: null, youcan_token_expires_at: null, youcan_webhook_id: null }).eq("id", workspaceId),
      client.from("youcan_tokens").delete().eq("workspace_id", workspaceId),
      client.from("integration_sync_state").upsert({ workspace_id: workspaceId, provider: "youcan", enabled: true, consecutive_failures: 0, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,provider" }),
      client.from("youcan_financial_snapshots").insert({ workspace_id: workspaceId, integration_id: integrationId, currency: store?.currency?.code ?? store?.currency ?? null, balance: Number(store?.balance ?? 0), due_amount: Number(store?.due_amount ?? 0), unpaid_invoices_amount: Number(store?.unpaid_invoices_amount ?? 0), provider_store_status: store?.status_text ?? store?.status ?? null }),
    ]);
    if (supportingWrites.some((result) => result.error)) throw new Error("database_save_failed");

    const webhook = await ensureYouCanWebhooks(client, integrationId, workspaceId, token.access_token);
    log("youcan.webhook.register", { workspaceId, healthy: webhook.healthy, active: webhook.active });
    const bucket = new Date().toISOString().slice(0, 13);
    const initialJobs = await Promise.all(["orders", "products", "finance"].map((jobType) => client.from("youcan_sync_jobs").upsert({
      workspace_id: workspaceId,
      integration_id: integrationId,
      job_type: jobType,
      idempotency_key: `oauth:${bucket}:${jobType}`,
      payload: {},
      status: "pending",
      available_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,integration_id,job_type,idempotency_key" })));
    if (initialJobs.some((result) => result.error)) throw new Error("initial_sync_failed");
    log("youcan.initial_sync", { workspaceId, queued: initialJobs.length });
    log("youcan.oauth.complete", { workspaceId, storeId: externalStoreId, webhookHealthy: webhook.healthy });

    const successReason = webhook.healthy ? undefined : "sync_initializing";
    if (browser) return redirect(req, "success", successReason);
    return new Response(JSON.stringify({ success: true, live_sync: webhook.healthy }), { headers: headers(req) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "connection_failed";
    const safeReason = safeReasons.has(reason) ? reason : "connection_failed";
    log("youcan.oauth.failed", { reason: safeReason });
    if (browser) return redirect(req, "error", safeReason);
    return new Response(JSON.stringify({ error: "YouCan connection failed", reason: safeReason }), {
      status: safeReason === "invalid_client" ? 502 : 400,
      headers: headers(req),
    });
  }
});
