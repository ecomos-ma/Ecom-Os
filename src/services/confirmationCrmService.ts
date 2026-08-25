import { supabase } from "../lib/supabase";
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
  CustomerHistoryOrder,
} from "../pages/confirmation/types";

const ORDER_COLUMNS = `
  "Order ID",
  workspace_id,
  order_number,
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
  confirmed_at,
  cancelled_at,
  confirmation_method,
  customers(id, name, phone, city)
`;

const CRM_ACTIVITY_LABELS: Record<string, string> = {
  ORDER_OPENED: "Opened this order",
  NOTE_ADDED: "Added a note",
  CALL_STARTED: "Started a customer call",
  CALL_ENDED: "Ended a customer call",
  CALLBACK_SCHEDULED: "Scheduled a callback",
  CALLBACK_COMPLETED: "Completed a callback",
  RECORDING_SAVED: "Saved a microphone recording",
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
    orderNumber: row.order_number || id,
    customerId: row.customer_id ?? rawCustomer?.id ?? null,
    customerName: rawCustomer?.name || row.customer_name || "Customer unavailable",
    phone: row.phone ?? rawCustomer?.phone ?? null,
    city: row.city || row.city_name || rawCustomer?.city || null,
    address: row.address ?? null,
    total: Number(row.total || 0),
    status: row.status || "pending",
    deliveryStatus: row.delivery_status ?? null,
    shippingStatus: row.shipping_status ?? null,
    sku: row.sku ?? null,
    productVariant: row.product_variant ?? null,
    quantity: Number(row.quantity || 1),
    variantPrice: row.variant_price === null || row.variant_price === undefined ? null : Number(row.variant_price),
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
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

async function loadProductsForOrders(workspaceId: string, rows: any[]): Promise<Map<string, ConfirmationProduct[]>> {
  const orderIds = uniqueStrings(rows.map(orderIdOf));
  const skus = uniqueStrings(rows.map((row) => row.sku));
  const [itemsResult, skuProductsResult] = await Promise.all([
    orderIds.length
      ? supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, unit_price")
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
        const product = productsById.get(item.product_id);
        return {
          id: product?.id ?? item.product_id ?? null,
          name: product?.name || row.product_variant || row.sku || "Product unavailable",
          sku: product?.sku || row.sku || null,
          variant: product?.variant || row.product_variant || null,
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
      id: product?.id ?? null,
      name: product?.name || row.product_variant || row.sku || "Product unavailable",
      sku: product?.sku || row.sku || null,
      variant: product?.variant || row.product_variant || null,
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
  return toSummary(data);
}

/**
 * Keeps the queue usable while a workspace is waiting for the additive CRM
 * migration / PostgREST cache refresh. The normal RPC remains the performant
 * path; this fallback never invents metrics and is deliberately bounded.
 */
async function getConfirmationSummaryFallback(workspaceId: string, agentId?: string | null): Promise<ConfirmationSummary> {
  let scopedOrderIds: string[] | undefined;
  if (agentId) {
    const assignments = await loadLatestAssignments(workspaceId);
    scopedOrderIds = [...assignments.entries()]
      .filter(([, assignedTo]) => assignedTo === agentId)
      .map(([orderId]) => orderId)
      .slice(0, 1000);
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

export async function getConfirmationOrders(workspaceId: string, filters: ConfirmationOrderFilters) {
  let scopedOrderIds: string[] | undefined;
  if (filters.myAgentId || filters.assignedAgentId || filters.queue === "unassigned" || filters.queue === "callback_due") {
    const allAssignments = await loadLatestAssignments(workspaceId);
    const targetAgent = filters.assignedAgentId || filters.myAgentId || null;
    const assignedIds = new Set(
      [...allAssignments.entries()]
        .filter(([, assignedTo]) => targetAgent ? assignedTo === targetAgent : false)
        .map(([orderId]) => orderId)
    );
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

  const orderIds = uniqueStrings(rows.map(orderIdOf));
  const assignments = await loadLatestAssignments(workspaceId, orderIds);
  if (filters.queue === "unassigned") rows = rows.filter((row) => !assignments.has(orderIdOf(row) || ""));

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
  const assignment = await loadLatestAssignments(workspaceId, [orderId]);
  const agentId = assignment.get(orderId);
  const [agents, products] = await Promise.all([
    agentId ? loadAgents(workspaceId, [agentId]) : Promise.resolve(new Map<string, ConfirmationAgent>()),
    loadProductsForOrders(workspaceId, [data]),
  ]);
  return toOrder(data, agentId ? agents.get(agentId) ?? null : null, products.get(orderId) ?? [], null);
}

export async function getConfirmationOrderDetails(workspaceId: string, order: ConfirmationOrder): Promise<ConfirmationOrderDetails> {
  const [notesResult, callbacksResult, activitiesResult, eventsResult, recordingsResult, historyResult] = await Promise.all([
    supabase.from("confirmation_notes").select("id, body, author_id, created_at").eq("workspace_id", workspaceId).eq("order_id", order.id).order("created_at", { ascending: false }),
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
  ]);

  const missingCrmSchema = [notesResult.error, callbacksResult.error, activitiesResult.error, recordingsResult.error]
    .some((error: any) => error?.code === "42P01");
  if (missingCrmSchema) throw new Error("Confirmation CRM database migration is not deployed yet.");
  const firstError = [notesResult.error, callbacksResult.error, activitiesResult.error, recordingsResult.error, historyResult.error]
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
  return { order, notes, callbacks, history, timeline, recordings };
}

export async function updateConfirmationStatus(workspaceId: string, order: ConfirmationOrder, status: string) {
  const now = new Date().toISOString();
  const payload: Record<string, string | null> = { status };
  if (status === "confirmed") {
    payload.confirmed_at = now;
    payload.confirmation_method = 'call';
  }
  if (status === "cancelled") payload.cancelled_at = now;
  console.log(`[DEBUG Confirmation] UPDATE PAYLOAD for order ${order.id}:`, JSON.stringify(payload, null, 2));
  const { data, error } = await supabase
    .from("orders")
    .update(payload)
    .eq("workspace_id", workspaceId)
    .eq("Order ID", order.id)
    .select('"Order ID", status, confirmed_at, cancelled_at, confirmation_method')
    .maybeSingle();
  console.log(`[DEBUG Confirmation] UPDATE RESULT:`, error ? `Error: ${error.message}` : `Success - confirmation_method: ${data?.confirmation_method}`);
  if (error) throw error;
  if (!data) throw new Error("This order is no longer available in the current workspace.");
  return data;
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
    await supabase.storage.from("call-recordings").remove([path]);
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
