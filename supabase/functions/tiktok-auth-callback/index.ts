import {
  asArray,
  asObject,
  asString,
  encryptSecret,
  errorResponse,
  requiredEnv,
  serviceClient,
  sha256,
  tiktokRequest,
} from "../_shared/tiktok.ts";
import { frontendAppUrl, isTrustedFrontendUrl } from "../_shared/app-url.ts";

interface TokenData {
  access_token?: string;
  refresh_token?: string;
  advertiser_ids?: string[];
  scope?: string | string[];
  open_id?: string;
  core_user_id?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

function redirectWithResult(returnUrl: string, result: string, message?: string): Response {
  const target = new URL(isTrustedFrontendUrl(returnUrl) ? returnUrl : frontendAppUrl());
  target.searchParams.set("tab", "integrations");
  target.searchParams.set("tiktok", result);
  if (message) target.searchParams.set("tiktok_message", message.slice(0, 160));
  return Response.redirect(target.toString(), 302);
}

Deno.serve(async (req) => {
  let fallback = `${frontendAppUrl()}/settings?tab=integrations`;
  try {
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(req.url);
    const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denied = url.searchParams.get("error") ?? url.searchParams.get("error_description");
    if (!state) return redirectWithResult(fallback, "error", "The authorization state was missing.");

    const client = serviceClient();
    const stateHash = await sha256(state);
    const { data: stateRow } = await client
      .from("tiktok_oauth_states")
      .select("id, workspace_id, user_id, connection_id, return_url, expires_at, consumed_at")
      .eq("state_hash", stateHash)
      .maybeSingle();
    if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      return redirectWithResult(fallback, "error", "The authorization request expired. Please reconnect.");
    }
    fallback = stateRow.return_url;
    const { data: consumed, error: consumeError } = await client
      .from("tiktok_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", stateRow.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) return redirectWithResult(fallback, "error", "This authorization request was already used.");
    if (denied || !authCode) {
      await client.from("tiktok_connections").update({ status: "disconnected", last_sync_error: "Authorization was not completed" }).eq("id", stateRow.connection_id);
      return redirectWithResult(fallback, "error", "TikTok authorization was cancelled.");
    }

    const token = await tiktokRequest<TokenData>("/oauth2/access_token/", {
      method: "POST",
      body: {
        app_id: requiredEnv("TIKTOK_APP_ID"),
        secret: requiredEnv("TIKTOK_APP_SECRET"),
        auth_code: authCode,
      },
      retries: 1,
    });
    if (!token.access_token) throw new Error("TikTok did not return an access token");
    const scopes = Array.isArray(token.scope) ? token.scope.map(String) : asString(token.scope).split(",").map((scope) => scope.trim()).filter(Boolean);
    const advertiserIds = asArray(token.advertiser_ids).map(String).filter(Boolean);

    const encryptedAccessToken = await encryptSecret(token.access_token);
    const encryptedRefreshToken = token.refresh_token ? await encryptSecret(token.refresh_token) : null;
    const now = Date.now();
    const { error: updateError } = await client.from("tiktok_connections").update({
      tiktok_account_id: asString(token.open_id || token.core_user_id) || null,
      account_name: "TikTok for Business",
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      token_expires_at: token.expires_in ? new Date(now + Number(token.expires_in) * 1000).toISOString() : null,
      refresh_token_expires_at: token.refresh_token_expires_in ? new Date(now + Number(token.refresh_token_expires_in) * 1000).toISOString() : null,
      granted_scopes: scopes,
      status: "pending_account_selection",
      last_sync_error: null,
    }).eq("id", stateRow.connection_id);
    if (updateError) throw updateError;

    let advertiserInfo: Record<string, unknown>[] = [];
    if (advertiserIds.length > 0) {
      const info = await tiktokRequest<Record<string, unknown>>("/advertiser/info/", {
        token: token.access_token,
        query: { advertiser_ids: advertiserIds, fields: ["advertiser_id", "name", "currency", "timezone"] },
      });
      advertiserInfo = asArray(asObject(info).list).map(asObject);
    }
    const infoById = new Map(advertiserInfo.map((item) => [asString(item.advertiser_id), item]));
    const rows = advertiserIds.map((advertiserId) => {
      const info = infoById.get(advertiserId) ?? {};
      return {
        workspace_id: stateRow.workspace_id,
        connection_id: stateRow.connection_id,
        advertiser_id: advertiserId,
        advertiser_name: asString(info.name || info.advertiser_name) || `Advertiser ${advertiserId}`,
        currency: asString(info.currency).toUpperCase() || null,
        timezone: asString(info.timezone) || null,
        is_enabled: false,
        reporting_sync_status: "pending",
      };
    });
    if (rows.length > 0) {
      const { error } = await client.from("tiktok_ad_accounts").upsert(rows, { onConflict: "workspace_id,advertiser_id" });
      if (error) throw error;
    }
    return redirectWithResult(fallback, "select_accounts");
  } catch (error) {
    const response = errorResponse(error);
    const payload = await response.json() as { error?: string };
    return redirectWithResult(fallback, "error", payload.error ?? "TikTok connection failed.");
  }
});
