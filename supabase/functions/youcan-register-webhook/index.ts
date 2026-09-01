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

function randomSecret(): string {
  const value = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(value).map((part) => part.toString(16).padStart(2, "0")).join("");
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

    const { data: integration, error } = await client.from("integrations")
      .select("id, access_token, webhook_id, status")
      .eq("workspace_id", workspaceId).eq("provider", "youcan").maybeSingle();
    if (error) throw new HttpError("YouCan connection could not be verified", 503);
    if (!integration || integration.status !== "active" || !integration.access_token) {
      throw new HttpError("YouCan is disconnected", 409);
    }

    if (integration.webhook_id) {
      try {
        await fetch(`https://api.youcan.shop/resthooks/${encodeURIComponent(integration.webhook_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${integration.access_token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Rotating the target secret below still revokes the old webhook locally.
      }
    }

    const webhookSecret = randomSecret();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
    const targetUrl = `${supabaseUrl}/functions/v1/youcan-webhook?integration_id=${encodeURIComponent(integration.id)}&token=${encodeURIComponent(webhookSecret)}`;
    const rotate = await client.from("integrations").update({ webhook_secret: webhookSecret, webhook_id: null })
      .eq("id", integration.id).eq("status", "active");
    if (rotate.error) throw new HttpError("Webhook could not be secured", 503);

    const provider = await fetch("https://api.youcan.shop/resthooks/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ target_url: targetUrl, event: "order.created" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!provider.ok) throw new HttpError("YouCan webhook registration failed", 502);
    const response = await provider.json().catch(() => ({}));
    const webhookId = String(response?.id ?? response?.hook_id ?? response?.webhook_id ?? response?.data?.id ?? "").trim();
    if (!webhookId) throw new HttpError("YouCan returned an invalid webhook response", 502);

    const [integrationUpdate, workspaceUpdate] = await Promise.all([
      client.from("integrations").update({ webhook_id: webhookId }).eq("id", integration.id).eq("status", "active"),
      client.from("workspaces").update({ youcan_webhook_id: webhookId }).eq("id", workspaceId),
    ]);
    if (integrationUpdate.error || workspaceUpdate.error) throw new HttpError("Webhook state could not be saved", 503);
    return json(req, { success: true, webhook_id: webhookId, event: "order.created" });
  } catch (error) {
    console.error("[YouCan webhook registration]", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
