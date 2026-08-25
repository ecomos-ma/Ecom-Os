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
    assertOnlyKeys(body, ["workspace_id", "youcan_order_id"]);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const youcanOrderId = typeof body.youcan_order_id === "string" ? body.youcan_order_id.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(youcanOrderId)) throw new HttpError("youcan_order_id is invalid", 400);
    await authorizeWorkspace(client, user.id, workspaceId);

    const { data: workspace, error } = await client
      .from("workspaces")
      .select("youcan_access_token")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error || !workspace?.youcan_access_token) throw new HttpError("YouCan is not connected", 409);

    const response = await fetch(`https://api.youcan.shop/orders/${encodeURIComponent(youcanOrderId)}`, {
      headers: { Authorization: `Bearer ${workspace.youcan_access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new HttpError("YouCan order lookup failed", response.status === 404 ? 404 : 502);
    const payload = await response.json() as Record<string, any>;
    const customerName = payload.data?.customer?.name ?? payload.data?.billing?.name ?? null;
    return json(req, { success: true, youcan_order_id: youcanOrderId, customer_name: customerName });
  } catch (error) {
    return errorResponse(req, error);
  }
});
