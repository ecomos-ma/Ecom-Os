import { activeConnection, authenticateRequest, corsHeaders, errorResponse, jsonResponse, resolveActiveWorkspace, serviceClient, writeActionLog } from "../_shared/meta.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    const connection = await activeConnection(client, workspaceId);
    const now = new Date().toISOString();
    const { error } = await client.from("meta_connections").update({
      access_token_encrypted: null, status: "disconnected", automation_enabled: false,
      disconnected_at: now, last_sync_error: null,
    }).eq("id", connection.id);
    if (error) throw error;
    await writeActionLog(client, { workspaceId, actorUserId: user.id, source: "user", action: "disconnect", entityType: "connection", entityId: connection.id, result: "success" });
    return jsonResponse(req, { success: true, historical_data_preserved: true });
  } catch (error) { return errorResponse(req, error); }
});
