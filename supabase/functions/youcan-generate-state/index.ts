import {
  assertOnlyKeys,
  authenticate,
  authorizeOperationalWorkspace,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";
import {
  YOUCAN_AUTHORIZATION_ENDPOINT,
  YOUCAN_REQUIRED_SCOPES,
  youcanOAuthConfig,
} from "../_shared/youcan.ts";

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((part) => part.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["workspace_id"]);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    await authorizeOperationalWorkspace(client, user.id, workspaceId);

    const { clientId, redirectUri } = youcanOAuthConfig();

    const state = randomState();
    await client.from("youcan_oauth_states").delete().eq("user_id", user.id).lt("expires_at", new Date().toISOString());
    const { error: stateError } = await client.from("youcan_oauth_states").insert({
      state_hash: await sha256(state),
      user_id: user.id,
      workspace_id: workspaceId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw new HttpError("YouCan connection could not be initialized", 503);
    const authorizationUrl = new URL(YOUCAN_AUTHORIZATION_ENDPOINT);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);
    for (const scope of YOUCAN_REQUIRED_SCOPES) {
      authorizationUrl.searchParams.append("scope[]", scope);
    }

    return json(req, { authorization_url: authorizationUrl.toString() });
  } catch (error) {
    console.error("[YouCan state] request rejected", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
