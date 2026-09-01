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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["workspace_id"]);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    await authorizeWorkspace(client, user.id, workspaceId);

    const { data: integration, error } = await client.from("integrations")
      .select("id, access_token, webhook_id, status")
      .eq("workspace_id", workspaceId).eq("provider", "youcan").maybeSingle();
    if (error) throw new HttpError("YouCan connection could not be loaded", 503);

    let providerWebhookRemoved = false;
    if (integration?.access_token && integration?.webhook_id) {
      try {
        const response = await fetch(`https://api.youcan.shop/resthooks/${encodeURIComponent(integration.webhook_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${integration.access_token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        providerWebhookRemoved = response.ok || response.status === 404;
      } catch {
        // The local revocation below is authoritative and makes the old target inert.
      }
    }

    const updates = await Promise.all([
      integration
        ? client.from("integrations").update({ status: "revoked", disconnected_at: new Date().toISOString() }).eq("id", integration.id)
        : Promise.resolve({ error: null }),
      client.from("workspaces").update({
        youcan_access_token: null, youcan_refresh_token: null,
        youcan_token_expires_at: null, youcan_webhook_id: null,
      }).eq("id", workspaceId),
      client.from("youcan_tokens").delete().eq("workspace_id", workspaceId),
      client.from("integration_sync_state").update({
        enabled: false, sync_lock: null, updated_at: new Date().toISOString(),
      }).eq("workspace_id", workspaceId).eq("provider", "youcan"),
    ]);
    if (updates.some((result) => result.error)) throw new HttpError("YouCan could not be disconnected safely", 503);

    return json(req, {
      success: true,
      status: "revoked",
      provider_webhook_removed: providerWebhookRemoved,
      local_imports_stopped: true,
    });
  } catch (error) {
    console.error("[YouCan disconnect]", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
