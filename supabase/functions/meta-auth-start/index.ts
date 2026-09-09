import {
  META_OAUTH_BASE,
  META_REQUIRED_SCOPES,
  MetaError,
  authenticateRequest,
  corsHeaders,
  jsonResponse,
  requiredEnv,
  resolveActiveWorkspace,
  serviceClient,
  sha256,
} from "../_shared/meta.ts";
import { frontendAppUrl, isTrustedFrontendUrl } from "../_shared/app-url.ts";

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  let stage = "request";
  let workspaceId: string | undefined;
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    stage = "service_client";
    const client = serviceClient();
    stage = "authenticate_request";
    const user = await authenticateRequest(req, client);
    stage = "resolve_workspace";
    ({ workspaceId } = await resolveActiveWorkspace(client, user.id, true));
    stage = "parse_return_url";
    const body = (await req.json().catch(() => ({}))) as {
      return_url?: string;
    };
    const fallback = new URL("/settings?tab=integrations", frontendAppUrl());
    const returnUrl = body.return_url
      ? new URL(body.return_url, fallback)
      : fallback;
    if (!isTrustedFrontendUrl(returnUrl.toString()))
      return jsonResponse(req, { error: "Invalid return URL" }, 400);

    stage = "lookup_active_connection";
    const { data: activeConnection, error: activeConnectionError } = await client
      .from("meta_connections")
      .select("id,status")
      .eq("workspace_id", workspaceId)
      .neq("status", "disconnected")
      .maybeSingle();
    if (activeConnectionError) throw activeConnectionError;
    const now = new Date().toISOString();
    if (activeConnection) {
      stage = "invalidate_expired_oauth_states";
      const { error: expiredStateError } = await client
        .from("meta_oauth_states")
        .update({ consumed_at: now })
        .eq("connection_id", activeConnection.id)
        .is("consumed_at", null)
        .lte("expires_at", now);
      if (expiredStateError) throw expiredStateError;
    }

    stage = "reuse_or_create_connection";
    const { data: connection, error: connectionError } = activeConnection
      ? await client
          .from("meta_connections")
          .update({
            connected_by: user.id,
            ...(activeConnection.status === "connecting"
              ? { status: "connecting", disconnected_at: null }
              : {}),
          })
          .eq("id", activeConnection.id)
          .select("id")
          .single()
      : await client
          .from("meta_connections")
          .insert({
            workspace_id: workspaceId,
            connected_by: user.id,
            status: "connecting",
          })
          .select("id")
          .single();
    if (connectionError || !connection)
      throw (
        connectionError ?? new Error("Meta connection could not be created")
      );

    stage = "generate_oauth_state";
    const random = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(random)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    stage = "store_oauth_state";
    const { error: stateError } = await client
      .from("meta_oauth_states")
      .insert({
        state_hash: await sha256(state),
        workspace_id: workspaceId,
        user_id: user.id,
        connection_id: connection.id,
        return_url: returnUrl.toString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    if (stateError) throw stateError;

    stage = "build_authorization_url";
    const authorizeUrl = new URL(META_OAUTH_BASE);
    authorizeUrl.searchParams.set("client_id", requiredEnv("META_APP_ID"));
    authorizeUrl.searchParams.set(
      "config_id",
      requiredEnv("META_LOGIN_CONFIG_ID"),
    );
    authorizeUrl.searchParams.set(
      "redirect_uri",
      requiredEnv("META_REDIRECT_URI"),
    );
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", META_REQUIRED_SCOPES.join(","));
    authorizeUrl.searchParams.set("auth_type", "rerequest");
    return jsonResponse(req, {
      authorization_url: authorizeUrl.toString(),
      authorize_url: authorizeUrl.toString(),
    });
  } catch (error) {
    const category =
      error instanceof MetaError
        ? error.category
        : stage.includes("auth")
          ? "authentication"
          : stage.includes("workspace")
            ? "permission"
            : stage.includes("url") || stage.includes("state")
              ? "validation"
              : stage === "service_client" || stage === "build_authorization_url"
                ? "configuration"
                : "database";
    console.error(
      JSON.stringify({
        function: "meta-auth-start",
        request_id: requestId,
        stage,
        category,
        workspace_id: workspaceId ?? null,
        error_code:
          error instanceof MetaError
            ? error.category
            : typeof error === "object" && error && "code" in error
              ? String((error as { code?: unknown }).code ?? "unknown")
              : "unknown",
      }),
    );
    return jsonResponse(
      req,
      {
        error:
          error instanceof MetaError
            ? error.message
            : "Meta authorization could not be started",
        category,
        stage,
        request_id: requestId,
      },
      error instanceof MetaError ? error.status : 500,
    );
  }
});
