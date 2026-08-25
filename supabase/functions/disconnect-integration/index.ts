import {
  assertOnlyKeys,
  authenticate,
  authorizeWorkspace,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";

const providers = new Set([
  "google-sheets",
  "youcan",
  "coliaty",
  "meta-ads",
  "ozon",
  "forcelog",
  "ameex",
  "sendit",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["provider", "workspace_id"]);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const provider = String(body.provider ?? "").trim().toLowerCase();
    const normalizedProvider = provider === "google" ? "google-sheets" : provider === "meta" ? "meta-ads" : provider;
    if (!providers.has(normalizedProvider)) throw new HttpError("Unsupported integration provider", 400);
    await authorizeWorkspace(client, user.id, workspaceId, ["owner", "admin"]);

    let rpcName: string;
    let rpcArguments: Record<string, unknown> = { p_workspace_id: workspaceId };
    switch (normalizedProvider) {
      case "google-sheets":
        rpcName = "deactivate_google_sheets_integration";
        break;
      case "youcan":
        rpcName = "deactivate_youcan_integration";
        break;
      case "coliaty":
        rpcName = "deactivate_coliaty_integration";
        break;
      case "meta-ads":
        rpcName = "deactivate_meta_integration";
        break;
      default:
        rpcName = "deactivate_shipping_integration";
        rpcArguments = { ...rpcArguments, p_provider: normalizedProvider };
        break;
    }

    const { error: disconnectError } = await client.rpc(rpcName, rpcArguments);
    if (disconnectError) throw new HttpError("Integration could not be disconnected", 500);

    const { error: auditError } = await client.from("webhook_logs").insert({
      provider: normalizedProvider,
      event_type: "disconnect",
      payload: { workspace_id: workspaceId, actor_id: user.id },
      status: "success",
      created_at: new Date().toISOString(),
    });
    if (auditError) console.error("[disconnect-integration] audit_write_failed");

    const notificationTimestamp = Date.now();
    const { error: notificationError } = await client.rpc("emit_notification_event_service", {
      p_workspace_id: workspaceId,
      p_event_key: "integration.disconnected",
      p_related_entity_type: "integration",
      p_related_entity_id: null,
      p_payload: {
        title: "Integration disconnected",
        message: `${normalizedProvider.replaceAll("-", " ")} was disconnected from this workspace.`,
        action_url: "/settings?tab=integrations",
        provider: normalizedProvider,
      },
      p_dedupe_key: `integration.disconnected:${normalizedProvider}:${notificationTimestamp}`,
      p_recipient_user_id: null,
      p_source_event_id: `disconnect:${normalizedProvider}:${notificationTimestamp}`,
    });
    if (notificationError) console.error("[disconnect-integration] notification_emit_failed");

    return json(req, { success: true, provider: normalizedProvider });
  } catch (error) {
    return errorResponse(req, error);
  }
});
