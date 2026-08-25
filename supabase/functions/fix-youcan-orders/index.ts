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

type LocalOrder = { order_number: string; youcan_order_id: string };
type YouCanOrder = Record<string, any>;

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

    const { data: workspace, error: workspaceError } = await client
      .from("workspaces")
      .select("youcan_access_token")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError || !workspace?.youcan_access_token) throw new HttpError("YouCan is not connected", 409);

    const { data, error: ordersError } = await client
      .from("orders")
      .select("order_number, youcan_order_id")
      .eq("workspace_id", workspaceId)
      .eq("source", "youcan")
      .is("customer_name", null)
      .not("phone", "is", null)
      .not("youcan_order_id", "is", null)
      .limit(500);
    if (ordersError) throw new HttpError("Could not load workspace orders", 500);

    const orders = (data ?? []) as LocalOrder[];
    if (orders.length === 0) return json(req, { success: true, updated: 0, failed: 0 });
    const remaining = new Set(orders.map((order) => String(order.youcan_order_id)));
    const providerOrders = new Map<string, YouCanOrder>();

    for (let page = 1; page <= 50 && remaining.size > 0; page += 1) {
      const response = await fetch(`https://api.youcan.shop/orders?page=${page}&limit=50`, {
        headers: { Authorization: `Bearer ${workspace.youcan_access_token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new HttpError("YouCan order synchronization failed", 502);
      const payload = await response.json() as Record<string, any>;
      const pageOrders = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.orders) ? payload.orders : [];
      for (const providerOrder of pageOrders) {
        const id = String(providerOrder?.id ?? "");
        if (remaining.has(id)) {
          providerOrders.set(id, providerOrder);
          remaining.delete(id);
        }
      }
      const lastPage = Math.min(Number(payload.meta?.last_page ?? payload.last_page ?? 1) || 1, 50);
      if (page >= lastPage) break;
    }

    let updated = 0;
    let failed = 0;
    for (const order of orders) {
      const providerOrder = providerOrders.get(String(order.youcan_order_id));
      if (!providerOrder) {
        failed += 1;
        continue;
      }
      const customer = providerOrder.customer ?? {};
      const customerName = customer.full_name?.trim?.() ||
        [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || null;
      const addressRow = Array.isArray(customer.address) ? customer.address[0] : customer.address;
      const address = [addressRow?.first_line, addressRow?.second_line]
        .filter((value) => typeof value === "string" && value.trim())
        .map((value: string) => value.trim())
        .join(", ") || null;

      const { error } = await client
        .from("orders")
        .update({ customer_name: customerName, address })
        .eq("workspace_id", workspaceId)
        .eq("order_number", order.order_number)
        .eq("youcan_order_id", order.youcan_order_id);
      if (error) failed += 1;
      else updated += 1;
    }
    return json(req, { success: true, updated, failed });
  } catch (error) {
    return errorResponse(req, error);
  }
});
