import { supabase, SUPABASE_ANON_KEY } from "../lib/supabase";
import { normalizeStatus } from "../lib/statusEngine";
import type {
  ConfirmationAgent,
  ConfirmationCallback,
  ConfirmationNote,
  ConfirmationOrder,
  ConfirmationOrderDetails,
  ConfirmationOrderFilters,
  ConfirmationProduct,
  ConfirmationRecording,
  ConfirmationSummary,
  ConfirmationTimelineEntry,
  ConfirmationWorkLease,
  CustomerHistoryOrder,
} from "../pages/confirmation/types";

const ORDER_COLUMNS = `
  "Order ID",
  workspace_id,
  order_number,
  display_order_id,
  order_source,
  order_sequence_number,
  customer_id,
  city,
  city_name,
  address,
  total,
  status,
  delivery_status,
  shipping_status,
  phone,
  sku,
  product_variant,
  variant_price,
  quantity,
  created_at,
  updated_at,
  confirmed_at,
  cancelled_at,
  is_upsell,
  upsell_value,
  upsell_at,
  assigned_to,
  confirmation_method,
  customers(id, name, phone, city, address)
`;

const CRM_ACTIVITY_LABELS: Record<string, string> = {
  ORDER_OPENED: "Opened this order",
  NOTE_ADDED: "Added a note",
  CALL_STARTED: "Started a customer call",
  CALL_ENDED: "Ended a customer call",
  CALLBACK_SCHEDULED: "Scheduled a callback",
  CALLBACK_COMPLETED: "Completed a callback",
  RECORDING_SAVED: "Saved a microphone recording",
  UPSELL_MARKED: "Marked this order as an upsell",
  UPSELL_REMOVED: "Removed the upsell flag",
};

function orderIdOf(row: any): string | null {
  return row?.["Order ID"] ?? row?.id ?? null;
}

function toAgent(row: any): ConfirmationAgent {
  return {
    id: row.id,
    fullName: row.full_name || row.email || "Unassigned",
    avatarUrl: row.avatar_url ?? null,
    role: row.role || "agent",
  };
}

function toOrder(row: any, assignedAgent: ConfirmationAgent | null, products: ConfirmationProduct[], lastActivity: ConfirmationTimelineEntry | null): ConfirmationOrder | null {
  const id = orderIdOf(row);
  if (!id) return null;
  const rawCustomer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id,
    workspaceId: row.workspace_id,
    orderNumber: row.display_order_id || row.order_number || "Order",
    customerId: row.customer_id ?? rawCustomer?.id ?? null,
    customerName: rawCustomer?.name || row.customer_name || "Customer unavailable",
    phone: row.phone ?? rawCustomer?.phone ?? null,
    city: row.city || row.city_name || rawCustomer?.city || null,
    address: row.address ?? rawCustomer?.address ?? null,
    total: Number(row.total || 0),
    status: row.status || "pending",
    deliveryStatus: row.delivery_status ?? null,
    shippingStatus: row.shipping_status ?? null,
    sku: row.sku ?? null,
    productVariant: row.product_variant ?? null,
    quantity: Number(row.quantity || 1),
    variantPrice: row.variant_price === null || row.variant_price === undefined ? null : Number(row.variant_price),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    confirmedAt: row.confirmed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    isUpsell: row.is_upsell === true,
    upsellValue: row.upsell_value === null || row.upsell_value === undefined ? null : Number(row.upsell_value),
    upsellAt: row.upsell_at ?? null,
    assignedAgent,
    products,
    lastActivity,
  };
}

function formatActivity(row: any, agents: Map<string, ConfirmationAgent>, source: "crm" | "order"): ConfirmationTimelineEntry {
  const actorId = row.agent_id ?? row.actor_id ?? null;
  const type = row.activity_type ?? row.event_type ?? "ACTIVITY";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const baseLabel = source === "crm"
    ? CRM_ACTIVITY_LABELS[type] || "Updated confirmation work"
    : type === "CONFIRMATION_STATUS_CHANGED"
      ? "Changed confirmation status"
      : type === "ORDER_CREATED"
        ? "Order created"
        : type.replaceAll("_", " ").toLowerCase();
  const duration = Number(metadata.duration_seconds || 0);
  const suffix = duration > 0 ? ` (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")})` : "";
  return {
    id: `${source}-${row.id}`,
    type,
    source,
    createdAt: row.created_at,
    actorId,
    actorName: actorId ? agents.get(actorId)?.fullName ?? null : null,
    previousValue: row.previous_value ?? null,
    nextValue: row.next_value ?? null,
    text: `${baseLabel}${suffix}`,
    metadata,
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function loadAgents(workspaceId: string, ids?: string[]): Promise<Map<string, ConfirmationAgent>> {
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .eq("workspace_id", workspaceId);
  if (ids?.length) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) throw error;
  return new Map((data ?? []).map((row: any) => [row.id, toAgent(row)]));
}

async function loadLatestAssignments(workspaceId: string, orderIds?: string[], onlyAgentId?: string | null) {
  let query = supabase
    .from("order_assignments")
    .select("order_id, assigned_to, assigned_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("assigned_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (orderIds?.length) query = query.in("order_id", orderIds);
  if (onlyAgentId) query = query.eq("assigned_to", onlyAgentId);
  const { data, error } = await query;
  if (error) throw error;
  const latest = new Map<string, string>();
  for (const assignment of data ?? []) {
    if (!latest.has(assignment.order_id)) latest.set(assignment.order_id, assignment.assigned_to);
  }
  return latest;
}

async function loadDirectAssignedOrderIds(workspaceId: string, agentId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select('"Order ID"')
    .eq("workspace_id", workspaceId)
    .eq("assigned_to", agentId)
    .limit(2000);
  if (error) throw error;
  return uniqueStrings((data ?? []).map(orderIdOf));
}

/**
 * During the rollout, assignments may be stored in either the assignment
 * ledger or orders.assigned_to. Read both so an invited agent never loses
 * their queue just because one write path was used earlier.
 */
async function loadEffectiveAssignedOrderIds(workspaceId: string, agentId: string) {
  const [ledgerResult, directResult] = await Promise.all([
    loadLatestAssignments(workspaceId, undefined, agentId).catch(() => new Map<string, string>()),
    loadDirectAssignedOrderIds(workspaceId, agentId),
  ]);
  return uniqueStrings([
    ...Array.from(ledgerResult.entries())
      .filter(([, assignedTo]) => assignedTo === agentId)
      .map(([orderId]) => orderId),
    ...directResult,
  ]);
}

async function loadProductsForOrders(workspaceId: string, rows: any[]): Promise<Map<string, ConfirmationProduct[]>> {
  const orderIds = uniqueStrings(rows.map(orderIdOf));
  const skus = uniqueStrings(rows.map((row) => row.sku));
  const [itemsResult, skuProductsResult] = await Promise.all([
    orderIds.length
      ? supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, unit_price, variant_name, variant_options, agent_name_override, agent_color, agent_note")
        .eq("workspace_id", workspaceId)
        .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    skus.length
      ? supabase
        .from("products")
        .select("id, name, sku, variant, image_url, stock, price")
        .eq("workspace_id", workspaceId)
        .in("sku", skus)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (skuProductsResult.error) throw skuProductsResult.error;

  const itemProductIds = uniqueStrings((itemsResult.data ?? []).map((item: any) => item.product_id));
  const itemProductsResult = itemProductIds.length
    ? await supabase
      .from("products")
      .select("id, name, sku, variant, image_url, stock, price")
      .eq("workspace_id", workspaceId)
      .in("id", itemProductIds)
    : { data: [], error: null };
  if (itemProductsResult.error) throw itemProductsResult.error;

  const productsById = new Map<string, any>();
  const productsBySku = new Map<string, any>();
  [...(skuProductsResult.data ?? []), ...(itemProductsResult.data ?? [])].forEach((product: any) => {
    productsById.set(product.id, product);
    if (product.sku) productsBySku.set(product.sku, product);
  });

  const itemsByOrder = new Map<string, any[]>();
  (itemsResult.data ?? []).forEach((item: any) => {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  });

  const result = new Map<string, ConfirmationProduct[]>();
  rows.forEach((row) => {
    const id = orderIdOf(row);
    if (!id) return;
    const items = itemsByOrder.get(id) ?? [];
    if (items.length) {
      result.set(id, items.map((item: any) => {
        const product = productsById.get(item.product_id) ?? (row.sku ? productsBySku.get(row.sku) : null);
        return {
          itemId: item.id,
          id: product?.id ?? item.product_id ?? null,
          name: item.agent_name_override || product?.name || row.product_variant || row.sku || "Product unavailable",
          sku: product?.sku || row.sku || null,
          variant: item.variant_name || item.variant_options || product?.variant || row.product_variant || null,
          color: item.agent_color || null,
          comment: item.agent_note || null,
          imageUrl: product?.image_url || null,
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unit_price ?? row.variant_price ?? row.total ?? 0),
          stock: product?.stock === undefined ? null : Number(product.stock),
        };
      }));
      return;
    }

    const product = row.sku ? productsBySku.get(row.sku) : null;
    result.set(id, [{
      itemId: null,
      id: product?.id ?? null,
      name: product?.name || row.product_variant || row.sku || "Product unavailable",
      sku: product?.sku || row.sku || null,
      variant: product?.variant || row.product_variant || null,
      color: null,
      comment: null,
      imageUrl: product?.image_url || null,
      quantity: Number(row.quantity || 1),
      unitPrice: Number(row.variant_price ?? row.total ?? 0),
      stock: product?.stock === undefined ? null : Number(product.stock),
    }]);
  });
  return result;
}

async function loadLatestActivities(workspaceId: string, orderIds: string[], agents: Map<string, ConfirmationAgent>) {
  if (!orderIds.length) return new Map<string, ConfirmationTimelineEntry>();
  const { data, error } = await supabase
    .from("confirmation_activities")
    .select("id, order_id, agent_id, activity_type, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(orderIds.length * 3, 500));
  if (error) {
    if (error.code === "42P01") return new Map();
    throw error;
  }
  const result = new Map<string, ConfirmationTimelineEntry>();
  (data ?? []).forEach((row: any) => {
    if (!result.has(row.order_id)) result.set(row.order_id, formatActivity(row, agents, "crm"));
  });
  return result;
}

function toSummary(data: any): ConfirmationSummary {
  return {
    totalOrders: Number(data?.total_orders || 0),
    ordersCreatedToday: Number(data?.orders_created_today || 0),
    confirmedToday: Number(data?.confirmed_today || 0),
    remainingOrders: Number(data?.remaining_orders || 0),
    statusCounts: Object.fromEntries(Object.entries(data?.status_counts || {}).map(([key, value]) => [key, Number(value || 0)])),
    callbacksDue: Number(data?.callbacks_due || 0),
    callbacksOverdue: Number(data?.callbacks_overdue || 0),
    callbacksToday: Number(data?.callbacks_today || 0),
    callsToday: Number(data?.calls_today || 0),
    actionsToday: Number(data?.actions_today || 0),
    handledToday: Number(data?.handled_today || 0),
  };
}

export async function getConfirmationSummary(workspaceId: string, agentId?: string | null): Promise<ConfirmationSummary> {
  const { data, error } = await supabase.rpc("get_confirmation_crm_summary", {
    p_workspace_id: workspaceId,
    p_agent_id: agentId ?? null,
  });
  if (error) {
    const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
    const rpcIsNotDeployed = error.code === "PGRST202" || message.includes("could not find the function") || message.includes("schema cache");
    if (!rpcIsNotDeployed) throw error;
    return getConfirmationSummaryFallback(workspaceId, agentId);
  }
  const summary = toSummary(data);
  // Older RPC versions only inspect the legacy ledger. Recalculate an empty
  // agent response from the two durable assignment sources before showing an
  // empty queue to an agent who has orders assigned on orders.assigned_to.
  if (agentId && summary.totalOrders === 0) return getConfirmationSummaryFallback(workspaceId, agentId);
  return summary;
}

/**
 * Keeps the queue usable while a workspace is waiting for the additive CRM
 * migration / PostgREST cache refresh. The normal RPC remains the performant
 * path; this fallback never invents metrics and is deliberately bounded.
 */
async function getConfirmationSummaryFallback(workspaceId: string, agentId?: string | null): Promise<ConfirmationSummary> {
  let scopedOrderIds: string[] | undefined;
  if (agentId) {
    scopedOrderIds = (await loadEffectiveAssignedOrderIds(workspaceId, agentId)).slice(0, 1000);
    if (!scopedOrderIds.length) {
      return {
        totalOrders: 0, ordersCreatedToday: 0, confirmedToday: 0, remainingOrders: 0,
        statusCounts: {}, callbacksDue: 0, callbacksOverdue: 0, callbacksToday: 0,
        callsToday: 0, actionsToday: 0, handledToday: 0,
      };
    }
  }

  let ordersQuery = supabase
    .from("orders")
    .select('"Order ID", status, created_at, confirmed_at')
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (scopedOrderIds?.length) ordersQuery = ordersQuery.in("Order ID", scopedOrderIds);
  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) throw ordersError;

  const rows = orders ?? [];
  const orderIds = uniqueStrings(rows.map(orderIdOf));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const statusCounts: Record<string, number> = {};
  let confirmedToday = 0;
  let remainingOrders = 0;
  for (const row of rows as any[]) {
    const rawStatus = String(row.status || "pending").trim() || "pending";
    statusCounts[rawStatus] = (statusCounts[rawStatus] || 0) + 1;
    const canonical = normalizeStatus(rawStatus);
    if (!['confirmed', 'cancelled', 'shipped', 'delivered', 'returned'].includes(canonical)) remainingOrders++;
    if (row.confirmed_at && new Date(row.confirmed_at).getTime() >= startOfToday.getTime()) confirmedToday++;
  }

  const [callbacksResult, activitiesResult] = await Promise.all([
    orderIds.length
      ? supabase
        .from("confirmation_callbacks")
        .select("order_id, agent_id, scheduled_at, status")
        .eq("workspace_id", workspaceId)
        .in("order_id", orderIds)
        .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
        .from("confirmation_activities")
        .select("order_id, agent_id, activity_type, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfToday.toISOString())
        .in("order_id", orderIds)
        .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // These tables are new. A missing table means there is honestly no CRM
  // activity data available yet, not a failure of the order queue.
  const callbacks = callbacksResult.error ? [] : callbacksResult.data ?? [];
  const activities = activitiesResult.error ? [] : activitiesResult.data ?? [];
  const now = Date.now();
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const relevantCallbacks = (callbacks as any[]).filter((callback) => !agentId || callback.agent_id === agentId);
  const relevantActivities = (activities as any[]).filter((activity) => !agentId || activity.agent_id === agentId);
  const callbacksDue = relevantCallbacks.filter((callback) => callback.status === "scheduled" && new Date(callback.scheduled_at).getTime() <= now).length;
  const callbacksOverdue = relevantCallbacks.filter((callback) => callback.status === "scheduled" && new Date(callback.scheduled_at).getTime() < startOfToday.getTime()).length;
  const callbacksToday = relevantCallbacks.filter((callback) => {
    const scheduledAt = new Date(callback.scheduled_at).getTime();
    return callback.status === "scheduled" && scheduledAt >= startOfToday.getTime() && scheduledAt < endOfToday.getTime();
  }).length;
  return {
    totalOrders: rows.length,
    ordersCreatedToday: (rows as any[]).filter((row) => new Date(row.created_at).getTime() >= startOfToday.getTime()).length,
    confirmedToday,
    remainingOrders,
    statusCounts,
    callbacksDue,
    callbacksOverdue,
    callbacksToday,
    callsToday: relevantActivities.filter((activity) => activity.activity_type === "CALL_STARTED").length,
    actionsToday: relevantActivities.length,
    handledToday: new Set(relevantActivities.map((activity) => activity.order_id)).size,
  };
}

export async function getConfirmationAgents(workspaceId: string): Promise<ConfirmationAgent[]> {
  const agents = await loadAgents(workspaceId);
  return [...agents.values()]
    .filter((agent) => agent.role !== "viewer")
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function getConfirmationOrders(
  workspaceId: string,
  filters: ConfirmationOrderFilters,
  onBaseOrders?: (result: { orders: ConfirmationOrder[]; total: number }) => void,
) {
  let scopedOrderIds: string[] | undefined;
  if (filters.myAgentId || filters.assignedAgentId || filters.queue === "unassigned" || filters.queue === "callback_due") {
    const targetAgent = filters.assignedAgentId || filters.myAgentId || null;
    const assignedIds = new Set(targetAgent ? await loadEffectiveAssignedOrderIds(workspaceId, targetAgent) : []);
    if (filters.queue === "unassigned") {
      // We filter after the paged request below to avoid treating old assignments as active.
      scopedOrderIds = [];
    } else {
      scopedOrderIds = [...assignedIds];
      if (!scopedOrderIds.length) return { orders: [], total: 0 };
    }
  }

  if (filters.queue === "callback_due") {
    let callbackQuery = supabase
      .from("confirmation_callbacks")
      .select("order_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(1000);
    if (filters.myAgentId) callbackQuery = callbackQuery.eq("agent_id", filters.myAgentId);
    const { data: callbacks, error: callbackError } = await callbackQuery;
    if (callbackError) throw callbackError;
    scopedOrderIds = uniqueStrings((callbacks ?? []).map((callback: any) => callback.order_id));
    if (!scopedOrderIds.length) return { orders: [], total: 0 };
  }

  let query = supabase
    .from("orders")
    .select(ORDER_COLUMNS, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (filters.rawStatuses?.length) query = query.in("status", filters.rawStatuses);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (scopedOrderIds && scopedOrderIds.length) query = query.in("Order ID", scopedOrderIds.slice(0, 1000));
  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/[,()%]/g, " ");
    query = query.or(`order_number.ilike.%${escaped}%,phone.ilike.%${escaped}%,city.ilike.%${escaped}%,sku.ilike.%${escaped}%,product_variant.ilike.%${escaped}%`);
  }

  const from = Math.max(0, filters.page) * filters.pageSize;
  const { data, error, count } = await query.range(from, from + filters.pageSize - 1);
  if (error) throw error;
  let rows = (data ?? []) as any[];

  // Render the authorized, paged order rows immediately. Product, assignment,
  // and activity enrichment continues without holding the whole queue blank.
  if (onBaseOrders && !filters.search?.trim() && filters.queue !== "unassigned") {
    onBaseOrders({
      orders: rows.map((row) => toOrder(row, null, [{
        itemId: null,
        id: null,
        name: row.product_variant || row.sku || "Product unavailable",
        sku: row.sku || null,
        variant: row.product_variant || null,
        color: null,
        comment: null,
        imageUrl: null,
        quantity: Number(row.quantity || 1),
        unitPrice: Number(row.variant_price ?? row.total ?? 0),
        stock: null,
      }], null)).filter((order): order is ConfirmationOrder => Boolean(order)),
      total: count ?? rows.length,
    });
  }

  const orderIds = uniqueStrings(rows.map(orderIdOf));
  const assignments = await loadLatestAssignments(workspaceId, orderIds).catch(() => new Map<string, string>());
  const directAssignments = new Map<string, string>((rows as any[])
    .filter((row) => row.assigned_to)
    .map((row) => [orderIdOf(row) || "", row.assigned_to]));
  for (const [orderId, agentId] of directAssignments) assignments.set(orderId, agentId);
  if (filters.queue === "unassigned") rows = rows.filter((row) => !assignments.has(orderIdOf(row) || "") && !row.assigned_to);

  const agentIds = uniqueStrings([...assignments.values()]);
  const [agents, products] = await Promise.all([
    loadAgents(workspaceId, agentIds),
    loadProductsForOrders(workspaceId, rows),
  ]);
  const activities = await loadLatestActivities(workspaceId, orderIds, agents);

  const orders = rows
    .map((row) => toOrder(row, agents.get(assignments.get(orderIdOf(row) || "") || "") ?? null, products.get(orderIdOf(row) || "") ?? [], activities.get(orderIdOf(row) || "") ?? null))
    .filter((order): order is ConfirmationOrder => Boolean(order));

  const search = filters.search?.trim().toLocaleLowerCase() || "";
  const clientFiltered = search
    ? orders.filter((order) => {
      const supplemental = `${order.customerName} ${order.products.map((product) => product.name).join(" ")}`.toLowerCase();
      const serverFields = `${order.orderNumber} ${order.phone || ""} ${order.city || ""} ${order.sku || ""} ${order.productVariant || ""}`.toLowerCase();
      return serverFields.includes(search) || supplemental.includes(search);
    })
    : orders;
  return { orders: clientFiltered, total: count ?? clientFiltered.length };
}

export async function getConfirmationOrderById(workspaceId: string, orderId: string): Promise<ConfirmationOrder | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("Order ID", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const assignment = await loadLatestAssignments(workspaceId, [orderId]).catch(() => new Map<string, string>());
  const agentId = assignment.get(orderId) ?? (data as any).assigned_to ?? null;
  const [agents, products] = await Promise.all([
    agentId ? loadAgents(workspaceId, [agentId]) : Promise.resolve(new Map<string, ConfirmationAgent>()),
    loadProductsForOrders(workspaceId, [data]),
  ]);
  return toOrder(data, agentId ? agents.get(agentId) ?? null : null, products.get(orderId) ?? [], null);
}

export async function getConfirmationOrderDetails(workspaceId: string, order: ConfirmationOrder): Promise<ConfirmationOrderDetails> {
  let notesQuery = supabase
    .from("confirmation_notes")
    .select("id, body, author_id, created_at")
    .eq("workspace_id", workspaceId);
  notesQuery = order.customerId
    ? notesQuery.or(`customer_id.eq.${order.customerId},order_id.eq.${order.id}`)
    : notesQuery.eq("order_id", order.id);

  const [notesResult, callbacksResult, activitiesResult, eventsResult, recordingsResult, historyResult, currentOrderResult] = await Promise.all([
    notesQuery.order("created_at", { ascending: false }),
    supabase.from("confirmation_callbacks").select("id, agent_id, scheduled_at, status, note, completed_at").eq("workspace_id", workspaceId).eq("order_id", order.id).order("scheduled_at", { ascending: true }),
    supabase.from("confirmation_activities").select("id, agent_id, activity_type, metadata, created_at").eq("workspace_id", workspaceId).eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("order_events").select("id, actor_id, event_type, source, previous_value, next_value, metadata, created_at").eq("workspace_id", workspaceId).eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("confirmation_call_recordings").select("id, order_id, storage_path, duration_seconds, mime_type, file_size, recording_source, started_at, ended_at, created_at, expires_at, expired_at, agent_id").eq("workspace_id", workspaceId).eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.rpc("get_confirmation_customer_history", {
      p_workspace_id: workspaceId,
      p_customer_id: order.customerId,
      p_phone: order.phone,
      p_exclude_order_id: order.id,
    }),
    supabase.from("orders").select(ORDER_COLUMNS).eq("workspace_id", workspaceId).eq("Order ID", order.id).maybeSingle(),
  ]);

  const missingCrmSchema = [notesResult.error, callbacksResult.error, activitiesResult.error, recordingsResult.error]
    .some((error: any) => error?.code === "42P01");
  if (missingCrmSchema) throw new Error("Confirmation CRM database migration is not deployed yet.");
  const firstError = [notesResult.error, callbacksResult.error, activitiesResult.error, recordingsResult.error, historyResult.error, currentOrderResult.error]
    .find(Boolean);
  if (firstError) throw firstError;

  // order_events is an existing optional audit layer. Do not block CRM details if an older workspace has not deployed it.
  const eventRows = eventsResult.error ? [] : eventsResult.data ?? [];
  const agentIds = uniqueStrings([
    ...(notesResult.data ?? []).map((row: any) => row.author_id),
    ...(callbacksResult.data ?? []).map((row: any) => row.agent_id),
    ...(activitiesResult.data ?? []).map((row: any) => row.agent_id),
    ...eventRows.map((row: any) => row.actor_id),
    ...(recordingsResult.data ?? []).map((row: any) => row.agent_id),
  ]);
  const agents = await loadAgents(workspaceId, agentIds);

  const notes: ConfirmationNote[] = (notesResult.data ?? []).map((row: any) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: agents.get(row.author_id)?.fullName ?? null,
  }));
  const callbacks: ConfirmationCallback[] = (callbacksResult.data ?? []).map((row: any) => ({
    id: row.id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    note: row.note ?? null,
    agentId: row.agent_id,
    agentName: agents.get(row.agent_id)?.fullName ?? null,
    completedAt: row.completed_at ?? null,
  }));
  const recordings: ConfirmationRecording[] = (recordingsResult.data ?? []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    storagePath: row.storage_path,
    durationSeconds: Number(row.duration_seconds || 0),
    mimeType: row.mime_type ?? null,
    fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
    recordingSource: row.recording_source,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
    expiredAt: row.expired_at ?? null,
    agentId: row.agent_id,
    agentName: agents.get(row.agent_id)?.fullName ?? null,
  }));
  const timeline = [
    ...(activitiesResult.data ?? []).map((row: any) => formatActivity(row, agents, "crm")),
    ...eventRows.map((row: any) => formatActivity(row, agents, "order")),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const history: CustomerHistoryOrder[] = (historyResult.data ?? []).map((row: any) => ({
    id: row.order_id,
    orderNumber: row.order_number,
    productVariant: row.product_variant ?? null,
    sku: row.sku ?? null,
    total: Number(row.total || 0),
    status: row.status,
    deliveryStatus: row.delivery_status ?? null,
    createdAt: row.created_at,
  }));
  const latestRow = currentOrderResult.data;
  const productMap = latestRow ? await loadProductsForOrders(workspaceId, [latestRow]) : null;
  const currentOrder = latestRow
    ? toOrder(latestRow, order.assignedAgent, productMap?.get(order.id) ?? order.products, order.lastActivity) ?? order
    : order;
  return { order: currentOrder, notes, callbacks, history, timeline, recordings };
}

type ConfirmationOrderChange = {
  status?: string;
  isUpsell?: boolean;
  total?: number;
  items?: ConfirmationUpsellItemChange[];
};

export type ConfirmationUpsellItemChange = {
  item_id: string | null;
  name: string;
  quantity: number;
  color: string;
  note: string;
};

type ConfirmationRpcOptions = {
  lease?: ConfirmationWorkLease | null;
  claimNext?: boolean;
  accessToken?: string | null;
};

export type ConfirmationSaveResult = {
  orderId: string;
  status: string;
  total: number;
  updatedAt: string;
  nextOrderId: string | null;
  nextLease: ConfirmationWorkLease | null;
  reconciled?: boolean;
};

function confirmationChangeRpcUnavailable(error: any) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return error?.code === "PGRST202" || message.includes("could not find the function") || message.includes("schema cache");
}

function toWorkLease(data: any, fallbackOrderId: string): ConfirmationWorkLease {
  return {
    mode: "server",
    leaseId: data?.lease_id ?? null,
    leaseToken: data?.lease_token ?? null,
    orderId: data?.order_id ?? fallbackOrderId,
    agentId: data?.agent_id ?? null,
    workState: data?.work_state === "call_active" || data?.work_state === "callback_reserved" ? data.work_state : "open",
    expiresAt: data?.expires_at ?? null,
    orderUpdatedAt: data?.order_updated_at ?? null,
  };
}

export async function acquireConfirmationWork(
  workspaceId: string,
  orderId: string,
  takeoverReason?: string,
): Promise<ConfirmationWorkLease> {
  const { data, error } = await supabase.rpc("acquire_confirmation_work_v1", {
    p_workspace_id: workspaceId,
    p_order_id: orderId,
    p_work_state: "open",
    p_takeover_reason: takeoverReason?.trim() || null,
  });
  if (!error) return toWorkLease(data, orderId);
  if (!confirmationChangeRpcUnavailable(error)) throw error;
  return {
    mode: "legacy",
    leaseId: null,
    leaseToken: null,
    orderId,
    agentId: null,
    workState: "open",
    expiresAt: null,
    orderUpdatedAt: null,
  };
}

export async function renewConfirmationWork(workspaceId: string, lease: ConfirmationWorkLease) {
  if (lease.mode !== "server" || !lease.leaseToken) return lease;
  const { data, error } = await supabase.rpc("renew_confirmation_work_v1", {
    p_workspace_id: workspaceId,
    p_order_id: lease.orderId,
    p_lease_token: lease.leaseToken,
    p_work_state: lease.workState,
  });
  if (error) throw error;
  return {
    ...lease,
    expiresAt: data?.expires_at ?? lease.expiresAt,
    workState: data?.work_state === "call_active" || data?.work_state === "callback_reserved" ? data.work_state : "open",
  } as ConfirmationWorkLease;
}

export async function releaseConfirmationWork(workspaceId: string, lease: ConfirmationWorkLease, reason = "closed") {
  if (lease.mode !== "server" || !lease.leaseToken) return;
  const { error } = await supabase.rpc("release_confirmation_work_v1", {
    p_workspace_id: workspaceId,
    p_order_id: lease.orderId,
    p_lease_token: lease.leaseToken,
    p_reason: reason,
  });
  if (error && !confirmationChangeRpcUnavailable(error)) throw error;
}

/**
 * The RPC is the permission boundary for confirmation agents. It validates
 * their active workspace membership and assignment before making any change,
 * instead of relying on a direct orders update that may be hidden by RLS.
 */
async function saveConfirmationOrderChange(
  workspaceId: string,
  order: ConfirmationOrder,
  actorId: string | null | undefined,
  change: ConfirmationOrderChange,
  options?: ConfirmationRpcOptions,
) {
  if (options?.lease?.mode === "server" && options.lease.leaseToken) {
    if (change.items?.length && change.isUpsell !== true) throw new Error("Product edits require an upsell.");
    const rpcBody = {
      p_workspace_id: workspaceId,
      p_order_id: order.id,
      p_lease_token: options.lease.leaseToken,
      // Legacy orders may have updated_at = NULL. The acquired lease carries
      // the authoritative database version; created_at is not that version.
      p_expected_updated_at: options.lease.orderUpdatedAt,
      p_status: change.status ?? null,
      p_is_upsell: change.isUpsell ?? null,
      p_total: change.total ?? null,
      p_claim_next: options.claimNext === true,
      ...(change.items?.length ? { p_items: change.items } : {}),
    };
    const rpcName = change.items?.length
      ? "save_confirmation_order_with_items_v1"
      : "save_confirmation_order_with_lease_v1";
    // The agent browser repeatedly completed a cross-origin preflight but
    // never sent the POST. This fixed same-origin endpoint forwards the user's
    // own JWT to the existing lease/assignment-checked RPC.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    let data: any;
    try {
      if (options.accessToken) {
        const response = await fetch(change.items?.length ? "/api/confirmation/save-items" : "/api/confirmation/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${options.accessToken}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(rpcBody),
          signal: controller.signal,
          cache: "no-store",
        });
        data = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status >= 500) throw new ConfirmationSaveTimeoutError();
          throw new Error(data?.message || `Confirmation save failed (${response.status}).`);
        }
      } else {
        const result = await supabase.rpc(rpcName, rpcBody)
          .abortSignal(controller.signal);
        if (result.error) throw result.error;
        data = result.data;
      }
    } catch (requestError) {
      if (controller.signal.aborted || requestError instanceof TypeError) throw new ConfirmationSaveTimeoutError();
      throw requestError;
    } finally {
      window.clearTimeout(timer);
    }
    return data;
  }

  if (change.items?.length) throw new Error("Reopen this order to secure an editing lease before changing products.");
  const { data, error } = await supabase.rpc("save_confirmation_order_v1", {
    p_workspace_id: workspaceId,
    p_order_id: order.id,
    p_status: change.status ?? null,
    p_is_upsell: change.isUpsell ?? null,
    p_total: change.total ?? null,
  });
  if (!error) return data;
  if (!confirmationChangeRpcUnavailable(error)) throw error;

  // Compatibility for workspaces that have not yet applied the additive RPC
  // migration. Owners retain the existing direct-update behavior; agents get
  // a clear deployment error instead of the misleading "unavailable" state.
  const now = new Date().toISOString();
  const payload: Record<string, string | number | boolean | null> = {};
  if (change.status) {
    payload.status = change.status;
    if (change.status === "confirmed") {
      payload.confirmed_at = now;
      payload.confirmation_method = "call";
      payload.confirmation_source = "human";
      payload.confirmed_by_user_id = actorId ?? null;
    }
    if (change.status === "cancelled") payload.cancelled_at = now;
  }
  if (change.isUpsell !== undefined) {
    payload.is_upsell = change.isUpsell;
    payload.upsell_at = change.isUpsell ? now : null;
    payload.upsell_by_user_id = change.isUpsell ? actorId ?? null : null;
    payload.upsell_value = change.isUpsell ? change.total ?? order.total : null;
    if (change.total !== undefined) {
      payload.total = change.total;
      payload.variant_price = Number((change.total / Math.max(1, order.quantity || 1)).toFixed(2));
    }
  }
  const fallback = await supabase
    .from("orders")
    .update(payload)
    .eq("workspace_id", workspaceId)
    .eq("Order ID", order.id)
    .select('"Order ID", status, total, variant_price, is_upsell, upsell_value, upsell_at')
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw new Error("Confirmation updates need the latest workspace migration. Ask the workspace owner to deploy it, then retry.");
  return fallback.data;
}

class ConfirmationSaveTimeoutError extends Error {
  constructor() {
    super("The save response timed out. Checking the order before allowing a retry.");
  }
}

async function readSavedConfirmationOrder(workspaceId: string, orderId: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const { data, error } = await supabase.from("orders")
      .select('status,total,updated_at')
      .eq("workspace_id", workspaceId)
      .eq("Order ID", orderId)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error) throw error;
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function updateConfirmationStatus(
  workspaceId: string,
  order: ConfirmationOrder,
  status: string,
  confirmedByUserId?: string | null,
  options?: {
    lease?: ConfirmationWorkLease | null;
    claimNext?: boolean;
    isUpsell?: boolean;
    total?: number;
    items?: ConfirmationUpsellItemChange[];
    accessToken?: string | null;
  },
): Promise<ConfirmationSaveResult> {
  let data: any;
  try {
    data = await saveConfirmationOrderChange(workspaceId, order, confirmedByUserId, {
      status,
      isUpsell: options?.isUpsell,
      total: options?.total,
      items: options?.items,
    }, options);
  } catch (error) {
    if (!(error instanceof ConfirmationSaveTimeoutError)) throw error;
    let actual: Awaited<ReturnType<typeof readSavedConfirmationOrder>>;
    try {
      actual = await readSavedConfirmationOrder(workspaceId, order.id);
    } catch {
      throw new Error("The save result could not be verified. Refresh the order before retrying; do not submit it twice yet.");
    }
    const changed = actual?.updated_at && actual.updated_at !== order.updatedAt;
    const desiredTotal = options?.total ?? order.total;
    if (changed && actual?.status === status && Math.abs(Number(actual.total) - desiredTotal) < 0.01) {
      return {
        orderId: order.id, status: actual.status, total: Number(actual.total),
        updatedAt: actual.updated_at, nextOrderId: null, nextLease: null,
        reconciled: true,
      };
    }
    throw new Error("The save did not appear on the server. Nothing has been confirmed; check your connection and retry.");
  }
  const nextLease = data?.next_lease ? toWorkLease(data.next_lease, data.next_order_id) : null;
  return {
    orderId: data?.order_id ?? order.id,
    status: data?.status ?? status,
    total: Number(data?.total ?? order.total),
    updatedAt: data?.updated_at ?? new Date().toISOString(),
    nextOrderId: data?.next_order_id ?? null,
    nextLease,
  };
}

export async function markConfirmationOrderUpsell(
  workspaceId: string,
  order: ConfirmationOrder,
  agentId: string,
  enabled: boolean,
  adjustedTotal = order.total,
  lease?: ConfirmationWorkLease | null,
  accessToken?: string | null,
  items?: ConfirmationUpsellItemChange[],
) {
  if (enabled && (!Number.isFinite(adjustedTotal) || adjustedTotal <= 0)) {
    throw new Error("Enter a valid adjusted order total before saving the upsell.");
  }
  const data: any = await saveConfirmationOrderChange(workspaceId, order, agentId, {
    isUpsell: enabled,
    total: enabled ? adjustedTotal : undefined,
    items: enabled ? items : undefined,
  }, { lease, accessToken });
  return {
    updatedAt: data?.updated_at ?? new Date().toISOString(),
    total: Number(data?.total ?? adjustedTotal),
  };
}

export type ConfirmationCustomerUpdate = {
  customerId: string;
  customerName: string;
  phone: string | null;
  city: string | null;
  address: string | null;
};

export async function updateConfirmationCustomerProfile(
  workspaceId: string,
  orderId: string,
  values: { customerName: string; phone: string; city: string; address: string }
): Promise<ConfirmationCustomerUpdate> {
  const customerName = values.customerName.trim();
  if (!customerName) throw new Error("Customer name is required.");

  const { data, error } = await supabase
    .rpc("update_confirmation_customer_profile", {
      p_workspace_id: workspaceId,
      p_order_id: orderId,
      p_name: customerName,
      p_phone: values.phone.trim() || null,
      p_city: values.city.trim() || null,
      p_address: values.address.trim() || null,
    })
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That phone number already belongs to another customer in this workspace.");
    }
    throw error;
  }
  if (!data) throw new Error("Customer details could not be updated.");

  const row = data as any;
  return {
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
  };
}

export async function addConfirmationActivity(workspaceId: string, order: ConfirmationOrder, agentId: string, activityType: string, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("confirmation_activities").insert({
    workspace_id: workspaceId,
    order_id: order.id,
    customer_id: order.customerId,
    agent_id: agentId,
    activity_type: activityType,
    metadata,
  });
  if (error) throw error;
}

export async function addConfirmationNote(workspaceId: string, order: ConfirmationOrder, agentId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Write a note before saving.");
  const { error } = await supabase.from("confirmation_notes").insert({
    workspace_id: workspaceId,
    order_id: order.id,
    customer_id: order.customerId,
    author_id: agentId,
    body: text,
  });
  if (error) throw error;
  await addConfirmationActivity(workspaceId, order, agentId, "NOTE_ADDED");
}

export async function scheduleConfirmationCallback(workspaceId: string, order: ConfirmationOrder, agentId: string, scheduledAt: string, note: string) {
  if (!scheduledAt) throw new Error("Choose a callback date and time.");
  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) throw new Error("The callback date is invalid.");
  const { error } = await supabase.from("confirmation_callbacks").insert({
    workspace_id: workspaceId,
    order_id: order.id,
    customer_id: order.customerId,
    agent_id: agentId,
    scheduled_at: scheduledDate.toISOString(),
    note: note.trim() || null,
  });
  if (error) throw error;
  await addConfirmationActivity(workspaceId, order, agentId, "CALLBACK_SCHEDULED", { scheduled_at: scheduledDate.toISOString() });
}

export async function completeConfirmationCallback(workspaceId: string, order: ConfirmationOrder, agentId: string, callbackId: string) {
  const { error } = await supabase
    .from("confirmation_callbacks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", callbackId);
  if (error) throw error;
  await addConfirmationActivity(workspaceId, order, agentId, "CALLBACK_COMPLETED", { callback_id: callbackId });
}

export async function assignConfirmationOrder(workspaceId: string, order: ConfirmationOrder, assignedTo: string, assignedBy: string) {
  const { error } = await supabase.from("order_assignments").insert({
    workspace_id: workspaceId,
    order_id: order.id,
    assigned_to: assignedTo,
    assigned_by: assignedBy,
    result: "pending",
  });
  if (error) throw error;
}

export async function uploadConfirmationRecording(
  workspaceId: string,
  order: ConfirmationOrder,
  agentId: string,
  blob: Blob,
  startedAt: Date,
  endedAt: Date,
  recordingId: string,
) {
  const type = (blob.type || "audio/webm").split(";", 1)[0] || "audio/webm";
  const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const path = `${workspaceId}/${agentId}/${order.id}/${recordingId}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("call-recordings").upload(path, blob, {
    contentType: type,
    upsert: false,
  });
  const objectAlreadyExists = Boolean(uploadError && /already exists|duplicate/i.test(uploadError.message));
  if (uploadError && !objectAlreadyExists) throw uploadError;

  // A retry of the same completed recording reuses its stable UUID and path.
  // If metadata was already committed, no second audio object or call row is
  // created. If only the upload completed, the insert below finishes safely.
  const { data: existingMetadata, error: existingMetadataError } = await supabase
    .from("confirmation_call_recordings")
    .select("id")
    .eq("id", recordingId)
    .maybeSingle();
  if (existingMetadataError) throw existingMetadataError;
  if (existingMetadata) return;

  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const { error: metadataError } = await supabase.from("confirmation_call_recordings").insert({
    id: recordingId,
    workspace_id: workspaceId,
    order_id: order.id,
    customer_id: order.customerId,
    agent_id: agentId,
    storage_path: path,
    duration_seconds: durationSeconds,
    mime_type: type,
    file_size: blob.size,
    recording_source: "browser_microphone",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
  });
  if (metadataError) {
    // A retry may be completing metadata for an object uploaded earlier. Do
    // not delete that existing recording when the metadata insert fails.
    if (!objectAlreadyExists) {
      await supabase.storage.from("call-recordings").remove([path]);
    }
    throw metadataError;
  }
  await addConfirmationActivity(workspaceId, order, agentId, "RECORDING_SAVED", { duration_seconds: durationSeconds });
}

export async function getConfirmationRecordingUrl(recording: ConfirmationRecording) {
  if (
    recording.expiredAt
    || !recording.storagePath
    || (recording.expiresAt && new Date(recording.expiresAt).getTime() <= Date.now())
  ) {
    throw new Error("Recording expired and was automatically removed after 7 days.");
  }
  const { data, error } = await supabase.storage.from("call-recordings").createSignedUrl(recording.storagePath, 60 * 15);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not create a secure recording link.");
  return data.signedUrl;
}
