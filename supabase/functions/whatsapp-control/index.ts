import {
  authenticateUser,
  authorizeWorkspace,
  corsHeaders,
  json,
  requiredEnv,
  serviceClient,
} from "../_shared/whatsapp.ts";

const actions = new Set(["connect", "disconnect", "status", "test"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticateUser(req, client);
    const body = await req.json() as {
      action?: string;
      workspace_id?: string;
      phone?: string;
      message?: string;
      revoke_session?: boolean;
    };
    const action = body.action?.trim() || "";
    const workspaceId = body.workspace_id?.trim() || "";
    if (!actions.has(action)) return json(req, { error: "Invalid action" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json(req, { error: "Invalid workspace_id" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId);

    const workerUrl = new URL(requiredEnv("WHATSAPP_WORKER_URL"));
    const workerSecret = requiredEnv("WHATSAPP_WORKER_API_SECRET");
    const path = action === "status" ? `status/${workspaceId}` : action;
    const response = await fetch(new URL(path, `${workerUrl.toString().replace(/\/$/, "")}/`), {
      method: action === "status" ? "GET" : "POST",
      headers: { "Authorization": `Bearer ${workerSecret}`, "Content-Type": "application/json" },
      body: action === "status" ? undefined : JSON.stringify({
        workspace_id: workspaceId,
        phone: body.phone,
        message: body.message,
        revoke_session: body.revoke_session,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({ error: "Invalid worker response" }));
    return json(req, payload, response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /authorization|access denied/i.test(message) ? 401 : /not configured/i.test(message) ? 503 : 500;
    return json(req, { error: message }, status);
  }
});
