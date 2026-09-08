import {
  META_OAUTH_BASE,
  META_REQUIRED_SCOPES,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  jsonResponse,
  requiredEnv,
  resolveActiveWorkspace,
  serviceClient,
  sha256,
} from "../_shared/meta.ts";
import { frontendAppUrl, isTrustedFrontendUrl } from "../_shared/app-url.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    const body = await req.json().catch(() => ({})) as { return_url?: string };
    const fallback = new URL("/settings/integrations", frontendAppUrl());
    const returnUrl = body.return_url ? new URL(body.return_url, fallback) : fallback;
    if (!isTrustedFrontendUrl(returnUrl.toString())) return jsonResponse(req, { error: "Invalid return URL" }, 400);

    await client.from("meta_connections").update({ status: "disconnected", disconnected_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId).neq("status", "disconnected");
    const { data: connection, error: connectionError } = await client.from("meta_connections").insert({
      workspace_id: workspaceId,
      connected_by: user.id,
      status: "connecting",
    }).select("id").single();
    if (connectionError || !connection) throw connectionError ?? new Error("Meta connection could not be created");

    const random = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(random).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const { error: stateError } = await client.from("meta_oauth_states").insert({
      state_hash: await sha256(state),
      workspace_id: workspaceId,
      user_id: user.id,
      connection_id: connection.id,
      return_url: returnUrl.toString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;

    const authorizeUrl = new URL(META_OAUTH_BASE);
    authorizeUrl.searchParams.set("client_id", requiredEnv("META_APP_ID"));
    authorizeUrl.searchParams.set("redirect_uri", requiredEnv("META_REDIRECT_URI"));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", META_REQUIRED_SCOPES.join(","));
    authorizeUrl.searchParams.set("auth_type", "rerequest");
    return jsonResponse(req, { authorize_url: authorizeUrl.toString() });
  } catch (error) {
    return errorResponse(req, error);
  }
});
