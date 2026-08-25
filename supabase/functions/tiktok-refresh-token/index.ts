import {
  TikTokError,
  asString,
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  decryptSecret,
  encryptSecret,
  errorResponse,
  jsonResponse,
  requiredEnv,
  serviceClient,
  tiktokRequest,
} from "../_shared/tiktok.ts";

interface RefreshData {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const body = await req.json() as { workspace_id?: string; connection_id?: string };
    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId) return jsonResponse({ error: "workspace_id is required" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId, true);
    let query = client.from("tiktok_connections").select("id, refresh_token_encrypted").eq("workspace_id", workspaceId).neq("status", "disconnected");
    if (body.connection_id) query = query.eq("id", body.connection_id);
    const { data: connections, error } = await query;
    if (error || !connections?.length) throw new TikTokError("TikTok Ads is not connected", "configuration", 409);
    const results: Record<string, unknown>[] = [];
    for (const connection of connections) {
      if (!connection.refresh_token_encrypted) {
        results.push({ connection_id: connection.id, refreshed: false, token_type: "marketing_api_long_term", reconnect_required_on_expiry: true });
        continue;
      }
      const refreshed = await tiktokRequest<RefreshData>("/tt_user/oauth2/refresh_token/", {
        method: "POST",
        body: {
          client_id: requiredEnv("TIKTOK_APP_ID"),
          client_secret: requiredEnv("TIKTOK_APP_SECRET"),
          grant_type: "refresh_token",
          refresh_token: await decryptSecret(connection.refresh_token_encrypted),
        },
        retries: 1,
      });
      if (!refreshed.access_token) throw new TikTokError("TikTok did not return a refreshed token", "authentication", 401);
      const now = Date.now();
      const { error: updateError } = await client.from("tiktok_connections").update({
        access_token_encrypted: await encryptSecret(refreshed.access_token),
        refresh_token_encrypted: refreshed.refresh_token ? await encryptSecret(refreshed.refresh_token) : connection.refresh_token_encrypted,
        token_expires_at: refreshed.expires_in ? new Date(now + Number(refreshed.expires_in) * 1000).toISOString() : null,
        refresh_token_expires_at: refreshed.refresh_token_expires_in ? new Date(now + Number(refreshed.refresh_token_expires_in) * 1000).toISOString() : null,
        status: "connected",
        last_sync_error: null,
      }).eq("id", connection.id);
      if (updateError) throw updateError;
      results.push({ connection_id: asString(connection.id), refreshed: true });
    }
    return jsonResponse({ success: true, connections: results });
  } catch (error) {
    return errorResponse(error);
  }
});
