import { assertOnlyKeys, authenticate, authorizeOperationalWorkspace, corsHeaders, errorResponse, HttpError, json, requireUuid, serviceClient } from "../_shared/security.ts";
import { ensureYouCanWebhooks, integrationAccessToken } from "../_shared/youcan.ts";

// Compatibility endpoint. V2 provisions and repairs webhooks automatically;
// the seller UI never asks users to activate them.
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
    const { data: integration, error } = await client.from("integrations").select("id,status").eq("workspace_id", workspaceId).eq("provider", "youcan").maybeSingle();
    if (error) throw new HttpError("YouCan connection could not be verified", 503);
    if (!integration || integration.status !== "active") throw new HttpError("YouCan is disconnected", 409);
    const { token } = await integrationAccessToken(client, integration.id);
    const result = await ensureYouCanWebhooks(client, integration.id, workspaceId, token);
    return json(req, { success: result.healthy, live_sync: result.healthy, subscriptions_active: result.active });
  } catch (error) {
    console.error("[YouCan webhooks] request rejected", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
