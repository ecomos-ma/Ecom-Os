import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { frontendAppUrl, frontendOrigins } from "../_shared/app-url.ts";

const allowedOrigins = frontendOrigins();

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("service_not_configured");
  return value;
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifyState(state: string): Promise<{ workspaceId: string; userId: string }> {
  const parts = state.split(":");
  if (parts.length !== 4) throw new Error("invalid_oauth_state");
  const [timestampValue, workspaceId, userId, signature] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId) || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("invalid_oauth_state");
  }
  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
    throw new Error("expired_oauth_state");
  }
  const received = hexBytes(signature);
  const expected = await hmac(`${timestampValue}:${workspaceId}:${userId}`, required("STATE_SIGNING_SECRET"));
  if (!received || !constantTimeEqual(received, expected)) throw new Error("invalid_oauth_state");
  return { workspaceId, userId };
}

function randomSecret(): string {
  const value = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(value).map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function providerDeleteWebhook(accessToken: string | null, webhookId: string | null): Promise<void> {
  if (!accessToken || !webhookId) return;
  try {
    await fetch(`https://api.youcan.shop/resthooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Local revocation remains authoritative even if provider cleanup is unavailable.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  const isBrowserRedirect = req.method === "GET";
  if (!isBrowserRedirect && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(req) });
  }

  try {
    let code: string | null;
    let state: string | null;
    if (isBrowserRedirect) {
      const url = new URL(req.url);
      code = url.searchParams.get("code");
      state = url.searchParams.get("state");
    } else {
      const body = await req.json().catch(() => ({}));
      code = typeof body.code === "string" ? body.code : null;
      state = typeof body.state === "string" ? body.state : null;
    }
    if (!code || !state) throw new Error("missing_oauth_parameters");
    const { workspaceId, userId } = await verifyState(state);

    const supabaseUrl = required("SUPABASE_URL");
    const client = createClient(supabaseUrl, required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: membership }, { data: access }, { data: owner }, { data: previous }] = await Promise.all([
      client.from("profile_workspaces").select("status").eq("profile_id", userId).eq("workspace_id", workspaceId).maybeSingle(),
      client.rpc("resolve_workspace_access_v1", { p_user_id: userId, p_workspace_id: workspaceId }),
      client.from("workspace_subscription_owners").select("owner_user_id").eq("workspace_id", workspaceId).maybeSingle(),
      client.from("integrations").select("id, access_token, webhook_id").eq("workspace_id", workspaceId).eq("provider", "youcan").maybeSingle(),
    ]);
    if (membership?.status !== "active" || !access?.allowed || !owner?.owner_user_id) {
      throw new Error("workspace_access_denied");
    }

    const tokenResponse = await fetch("https://api.youcan.shop/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: required("YOUCAN_CLIENT_ID"),
        client_secret: required("YOUCAN_CLIENT_SECRET"),
        redirect_uri: required("YOUCAN_REDIRECT_URI"),
        code,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) throw new Error("provider_token_exchange_failed");
    const token = await tokenResponse.json();
    if (!token?.access_token) throw new Error("provider_token_response_invalid");

    const storeResponse = await fetch("https://api.youcan.shop/me", {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!storeResponse.ok) throw new Error("provider_store_identity_failed");
    const store = await storeResponse.json();
    const externalStoreId = String(store?.store_id ?? store?.id ?? "").trim();
    if (!externalStoreId) throw new Error("provider_store_identity_invalid");

    await providerDeleteWebhook(previous?.access_token ?? null, previous?.webhook_id ?? null);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;
    const webhookSecret = randomSecret();

    const { data: integration, error: integrationError } = await client.from("integrations").upsert({
      user_id: owner.owner_user_id,
      workspace_id: workspaceId,
      provider: "youcan",
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: expiresAt,
      status: "active",
      external_store_id: externalStoreId,
      store_name: String(store?.name ?? store?.slug ?? "YouCan Store"),
      webhook_id: null,
      webhook_secret: webhookSecret,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      meta: { store_slug: store?.slug ?? null, store_domain: store?.domain ?? null },
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider" }).select("id").single();
    if (integrationError || !integration?.id) throw new Error("integration_persistence_failed");

    await Promise.all([
      client.from("workspaces").update({
        youcan_access_token: token.access_token,
        youcan_refresh_token: token.refresh_token ?? null,
        youcan_token_expires_at: expiresAt,
        youcan_webhook_id: null,
      }).eq("id", workspaceId),
      client.from("youcan_tokens").upsert({
        workspace_id: workspaceId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        expires_at: expiresAt,
        is_connected: true,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" }),
      client.from("integration_sync_state").upsert({
        workspace_id: workspaceId,
        provider: "youcan",
        enabled: true,
        consecutive_failures: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,provider" }),
    ]);

    const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/youcan-webhook?integration_id=${encodeURIComponent(integration.id)}&token=${encodeURIComponent(webhookSecret)}`;
    const hookResponse = await fetch("https://api.youcan.shop/resthooks/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ target_url: targetUrl, event: "order.created" }),
      signal: AbortSignal.timeout(15_000),
    });
    let webhookId: string | null = null;
    if (hookResponse.ok) {
      const hook = await hookResponse.json().catch(() => ({}));
      webhookId = String(hook?.id ?? hook?.hook_id ?? hook?.webhook_id ?? hook?.data?.id ?? "").trim() || null;
      if (webhookId) {
        await Promise.all([
          client.from("integrations").update({ webhook_id: webhookId }).eq("id", integration.id),
          client.from("workspaces").update({ youcan_webhook_id: webhookId }).eq("id", workspaceId),
        ]);
      }
    } else {
      console.error("[YouCan OAuth] webhook_registration_failed", hookResponse.status);
    }

    if (isBrowserRedirect) {
      const frontend = frontendAppUrl();
      return Response.redirect(`${frontend}/settings?tab=integrations&youcan=success`, 302);
    }
    return new Response(JSON.stringify({ success: true, webhook_registered: Boolean(webhookId) }), { headers: headers(req) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "connection_failed";
    console.error("[YouCan OAuth]", reason);
    if (isBrowserRedirect) {
      const frontend = frontendAppUrl();
      return Response.redirect(`${frontend}/settings?tab=integrations&youcan=error&details=connection_failed`, 302);
    }
    return new Response(JSON.stringify({ error: "YouCan connection failed" }), { status: 400, headers: headers(req) });
  }
});
