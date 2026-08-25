import {
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  decryptSecret,
  errorResponse,
  jsonResponse,
  requiredEnv,
  serviceClient,
  tiktokRequest,
} from "../_shared/tiktok.ts";

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
    let query = client.from("tiktok_connections").select("id, access_token_encrypted").eq("workspace_id", workspaceId).neq("status", "disconnected");
    if (body.connection_id) query = query.eq("id", body.connection_id);
    const { data: connections, error } = await query;
    if (error) throw error;

    const ids = (connections ?? []).map((connection) => String(connection.id));
    if (ids.length > 0) {
      await client.from("tiktok_connections").update({
        status: "disconnected",
        auto_sync_enabled: false,
        disconnected_at: new Date().toISOString(),
        last_sync_error: null,
      }).in("id", ids);
      await client.from("tiktok_ad_accounts").update({ is_enabled: false, reporting_sync_status: "disabled" }).in("connection_id", ids);
    }
    await client.from("tiktok_events_config").update({ enabled: false, last_error: null }).eq("workspace_id", workspaceId);
    await client.from("tiktok_event_logs").update({ attempt_status: "cancelled" }).eq("workspace_id", workspaceId).in("attempt_status", ["pending", "retry", "processing"]);

    for (const connection of connections ?? []) {
      if (!connection.access_token_encrypted) continue;
      try {
        await tiktokRequest<Record<string, never>>("/oauth2/revoke_token/", {
          method: "POST",
          body: {
            app_id: requiredEnv("TIKTOK_APP_ID"),
            secret: requiredEnv("TIKTOK_APP_SECRET"),
            access_token: await decryptSecret(connection.access_token_encrypted),
          },
          retries: 0,
        });
      } catch {
        // Local disconnect is authoritative. Revocation is best-effort because TikTok may already have invalidated the token.
      }
    }
    if (ids.length > 0) {
      await client.from("tiktok_connections").update({
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        refresh_token_expires_at: null,
      }).in("id", ids);
    }
    return jsonResponse({ success: true, historical_data_preserved: true, sync_stopped: true, events_stopped: true });
  } catch (error) {
    return errorResponse(error);
  }
});
