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

async function sign(payload: string, secret: string): Promise<string> {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    bytes.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, bytes.encode(payload));
  return Array.from(new Uint8Array(signature)).map((part) => part.toString(16).padStart(2, "0")).join("");
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

    const signingSecret = Deno.env.get("STATE_SIGNING_SECRET")?.trim();
    const clientId = Deno.env.get("YOUCAN_CLIENT_ID")?.trim();
    if (!signingSecret || !clientId) throw new HttpError("YouCan connection is not configured", 503);

    const payload = `${Date.now()}:${workspaceId}:${user.id}`;
    const state = `${payload}:${await sign(payload, signingSecret)}`;
    return json(req, { state, client_id: clientId });
  } catch (error) {
    console.error("[YouCan state] request rejected", error instanceof HttpError ? error.message : "internal_error");
    return errorResponse(req, error);
  }
});
