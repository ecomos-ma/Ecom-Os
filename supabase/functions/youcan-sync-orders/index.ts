import { assertOnlyKeys, authenticate, authorizeOperationalWorkspace, corsHeaders, errorResponse, HttpError, json, requireUuid, serviceClient } from "../_shared/security.ts";

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
    const bucket = new Date().toISOString().slice(0, 16);
    const { error: queueError } = await client.from("youcan_sync_jobs").upsert({
      workspace_id: workspaceId, integration_id: integration.id, job_type: "orders",
      idempotency_key: `manual:${bucket}`, payload: { requested_by: user.id }, status: "pending", available_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,integration_id,job_type,idempotency_key" });
    if (queueError) throw new HttpError("YouCan sync could not be queued", 503);
    return json(req, { success: true, queued: true, total_fetched: 0, synced_count: 0, skipped_count: 0 });
  } catch (error) {
    console.error("[YouCan sync] request rejected", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
