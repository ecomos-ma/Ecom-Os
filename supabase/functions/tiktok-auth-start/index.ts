import {
  TIKTOK_AUTHORIZE_URL,
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  errorResponse,
  jsonResponse,
  requiredEnv,
  serviceClient,
  sha256,
} from "../_shared/tiktok.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const body = await req.json() as { workspace_id?: string; return_url?: string };
    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId) return jsonResponse({ error: "workspace_id is required" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId, true);

    const redirectUri = requiredEnv("TIKTOK_REDIRECT_URI");
    const frontendUrl = new URL(requiredEnv("FRONTEND_URL"));
    const requestedReturn = body.return_url ? new URL(body.return_url, frontendUrl) : new URL("/settings?tab=integrations", frontendUrl);
    if (requestedReturn.origin !== frontendUrl.origin) return jsonResponse({ error: "Invalid return URL" }, 400);

    const { data: connection, error: connectionError } = await client
      .from("tiktok_connections")
      .insert({ workspace_id: workspaceId, connected_by: user.id, status: "connecting", auto_sync_enabled: true })
      .select("id")
      .single();
    if (connectionError || !connection) throw connectionError ?? new Error("Connection could not be created");

    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(stateBytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const { error: stateError } = await client.from("tiktok_oauth_states").insert({
      state_hash: await sha256(state),
      workspace_id: workspaceId,
      user_id: user.id,
      connection_id: connection.id,
      return_url: requestedReturn.toString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;

    const authorizeUrl = new URL(TIKTOK_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("app_id", requiredEnv("TIKTOK_APP_ID"));
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    const scopes = Deno.env.get("TIKTOK_SCOPES")?.trim();
    if (scopes) authorizeUrl.searchParams.set("scope", scopes);
    return jsonResponse({ authorize_url: authorizeUrl.toString() });
  } catch (error) {
    return errorResponse(error);
  }
});
