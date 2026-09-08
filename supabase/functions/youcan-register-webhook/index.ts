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

    // Step 1: Attempt to delete old webhook if present
    if (integration.webhook_id) {
      try {
        await fetch(`https://api.youcan.shop/resthooks/${encodeURIComponent(integration.webhook_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${integration.access_token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Cleanup failure doesn't block registration
      }
    }

    // Step 2: Generate candidate webhook secret and URL (don't persist yet)
    const webhookSecret = randomSecret();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
    const targetUrl = `${supabaseUrl}/functions/v1/youcan-webhook?integration_id=${encodeURIComponent(integration.id)}&token=${encodeURIComponent(webhookSecret)}`;

    // Step 3: Register with YouCan
    const provider = await fetch("https://api.youcan.shop/resthooks/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ target_url: targetUrl, event: "order.create" }),
      signal: AbortSignal.timeout(15_000),
    });

    // Step 4: Handle provider response
    if (!provider.ok) {
      const rawBody = await provider.text().catch(() => "");
      const sanitizedBody = rawBody.replace(/\s+/g, " ").slice(0, 300);
      console.error("[YouCan webhook register failed]", {
        upstream_status: provider.status,
        status_text: provider.statusText,
        body: sanitizedBody,
      });
      const safeCode = provider.status === 401 || provider.status === 403
        ? "YOUCAN_REAUTH_REQUIRED"
        : provider.status === 429
          ? "YOUCAN_API_RATE_LIMITED"
          : provider.status >= 500
            ? "YOUCAN_API_UNAVAILABLE"
            : "YOUCAN_WEBHOOK_REGISTER_FAILED";
      throw new HttpError(
        JSON.stringify({
          success: false,
          code: safeCode,
          error: "YouCan rejected webhook registration",
          upstream_status: provider.status,
        }),
        provider.status === 401 ? 401 : provider.status >= 500 ? 503 : 502,
      );
    }

    // Step 5: Extract webhook ID from provider response
    const response = await provider.json().catch(() => ({}));
    const webhookId = String(response?.id ?? response?.hook_id ?? response?.webhook_id ?? response?.data?.id ?? "").trim();
    if (!webhookId) {
      console.error("[YouCan webhook register] invalid response structure", response);
      throw new HttpError("YouCan returned an invalid webhook response", 502);
    }

    // Step 6: Only now persist the webhook state to database
    const [integrationUpdate, workspaceUpdate] = await Promise.all([
      client.from("integrations").update({ webhook_secret: webhookSecret, webhook_id: webhookId }).eq("id", integration.id).eq("status", "active"),
      client.from("workspaces").update({ youcan_webhook_id: webhookId }).eq("id", workspaceId),
    ]);
    if (integrationUpdate.error || workspaceUpdate.error) throw new HttpError("Webhook state could not be saved", 503);

    return json(req, { success: true, webhook_id: webhookId, event: "order.create" });
  } catch (error) {
    if (error instanceof HttpError) {
      const parsed = (() => {
        try { return JSON.parse(error.message); } catch { return null; }
      })();
      return json(req, parsed ?? { success: false, code: "YOUCAN_WEBHOOK_REGISTER_FAILED", error: error.message, upstream_status: error.status }, error.status || 500);
    }
    console.error("[YouCan webhook registration]", error instanceof Error ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
