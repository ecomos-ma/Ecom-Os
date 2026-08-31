import {
  authenticateUser,
  authorizeWorkspace,
  corsHeaders,
  json,
  requiredEnv,
  serviceClient,
} from "../_shared/whatsapp.ts";

const actions = new Set(["connect", "disconnect", "status", "test", "reconnect", "logout", "send"]);

function workerPath(action: string, workspaceId: string) {
  const sessionPrefix = `/sessions/${workspaceId}`;
  switch (action) {
    case "status":
      return `${sessionPrefix}/status`;
    case "connect":
      return `${sessionPrefix}/connect`;
    case "disconnect":
      return `${sessionPrefix}/disconnect`;
    case "reconnect":
      return `${sessionPrefix}/reconnect`;
    case "logout":
      return `${sessionPrefix}/logout`;
    case "send":
    case "test":
      return `${sessionPrefix}/send`;
    default:
      throw new Error(`Unsupported WhatsApp worker action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST" && req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticateUser(req, client);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as {
      action?: string;
      workspace_id?: string;
      phone?: string;
      message?: string;
      revoke_session?: boolean;
    } : {} as {
      action?: string;
      workspace_id?: string;
      phone?: string;
      message?: string;
      revoke_session?: boolean;
    };
    const action = (body.action ?? "status").trim();
    const workspaceId = (body.workspace_id ?? req.url.split("/").slice(-2, -1)[0] || "").trim();
    if (!actions.has(action)) return json(req, { error: "Invalid action" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json(req, { error: "Invalid workspace_id" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId);

    const workerUrl = new URL(requiredEnv("WHATSAPP_WORKER_URL"));
    const workerSecret = requiredEnv("WHATSAPP_WORKER_API_SECRET");
    const workerEndpoint = workerPath(action, workspaceId);
    const response = await fetch(new URL(workerEndpoint, `${workerUrl.toString().replace(/\/$/, "")}/`), {
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
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const normalizedStatus = typeof payload.connection_status === "string"
        ? payload.connection_status
        : typeof payload.status === "string"
          ? payload.status
          : typeof payload.state === "string"
            ? payload.state
            : null;
      payload.connection_status = normalizedStatus ?? payload.connection_status ?? null;
      payload.status = normalizedStatus ?? payload.status ?? payload.connection_status ?? null;
      payload.state = normalizedStatus ?? payload.state ?? payload.connection_status ?? null;
      payload.worker_available = typeof payload.worker_available === "boolean" ? payload.worker_available : true;
    }
    return json(req, payload, response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /authorization|access denied/i.test(message) ? 401 : /not configured|worker unavailable/i.test(message) ? 503 : 500;
    return json(req, { error: message }, status);
  }
});
