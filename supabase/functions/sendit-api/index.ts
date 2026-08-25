// Sendit is intentionally accessed only through this server-side function.
// Its credentials and short-lived access token never leave Supabase.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDIT_BASE_URL = "https://app.sendit.ma/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TERMINAL_SENDIT_STATUSES = new Set(["DELIVERED", "CANCELED", "REJECTED"]);
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

type Access = { userId: string; workspaceId: string; canManage: boolean; carrier: string };
type SenditIntegration = {
  workspace_id: string;
  public_key: string;
  secret_key: string;
  public_key_last4: string;
  secret_key_last4: string;
  enabled: boolean;
  pickup_district_id: number | null;
  allow_open: boolean;
  allow_try: boolean;
  packaging_id: number | null;
  last_tested_at: string | null;
  last_test_status: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const clean = (value: unknown) => String(value ?? "").trim();
const now = () => new Date().toISOString();
const asPositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const normalizeCity = (value: unknown) => clean(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();

function safeProviderData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeProviderData(item, depth + 1));
  if (!value || typeof value !== "object") return clean(value).slice(0, 2_000);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
    if (/secret|public.?key|token|authorization|password|api.?key/i.test(key)) return [key, "[redacted]"];
    return [key, safeProviderData(nested, depth + 1)];
  }));
}

function providerMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return clean(data).slice(0, 500) || fallback;
  const record = data as Record<string, unknown>;
  const candidate = [record.message, record.error, record.detail, record.errors]
    .map(clean).find(Boolean);
  return candidate?.slice(0, 500) || fallback;
}

function senditFailureCode(status: number, data: unknown, fallback: string) {
  const providerCode = clean((data as Record<string, unknown> | null)?.code);
  if (status === 401 || status === 403) return "SENDIT_AUTH_FAILED";
  if (status === 429) return "SENDIT_RATE_LIMITED";
  if (providerCode === "422") return "SENDIT_INVALID_CITY";
  return fallback;
}

function mapSenditStatus(value: unknown): string | null {
  switch (clean(value).toUpperCase()) {
    case "PENDING":
    case "TO_PREPARE": return "NEW_PARCEL";
    case "NEW_DESTINATION":
    case "POSTPONED": return "RESCHEDULE_REQUESTED";
    case "TO_PICKUP": return "WAITING_PICKUP";
    case "PICKEDUP": return "PICKED_UP";
    case "WAREHOUSE": return "RECEIVED_AT_WAREHOUSE";
    case "TRANSIT": return "IN_TRANSIT";
    case "DISTRIBUTED": return "IN_DISTRIBUTION";
    case "UNREACHABLE": return "NO_ANSWER";
    case "DELIVERING": return "OUT_FOR_DELIVERY";
    case "DELIVERED": return "DELIVERED";
    case "CANCELED": return "CANCELED";
    case "REJECTED": return "REFUSED";
    default: return null;
  }
}

async function authenticate(req: Request, service: any, workspaceId: string, needsManage = false): Promise<Access> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication is required.");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) throw new Error("Function authentication is not configured.");
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) throw new Error("Invalid or expired session.");

  const [{ data: workspace }, { data: membership }, { data: profile }] = await Promise.all([
    service.from("workspaces").select("id, created_by, carrier").eq("id", workspaceId).maybeSingle(),
    service.from("profile_workspaces").select("workspace_id").eq("workspace_id", workspaceId).eq("profile_id", user.id).maybeSingle(),
    service.from("profiles").select("role, allowed_sections").eq("id", user.id).maybeSingle(),
  ]);
  if (!workspace || (workspace.created_by !== user.id && !membership)) throw new Error("You do not have access to this workspace.");
  const role = clean(profile?.role).toLowerCase();
  const canManage = workspace.created_by === user.id || ["owner", "admin", "supervisor", "founder", "super_admin"].includes(role);
  const allowed = Array.isArray(profile?.allowed_sections) ? profile.allowed_sections.map((item: unknown) => clean(item).toLowerCase()) : [];
  if (needsManage && !canManage) throw new Error("Only workspace administrators can manage Sendit settings.");
  if (!needsManage && !canManage && allowed.length && !allowed.some((item: string) => ["shipping", "delivering", "orders"].includes(item))) {
    throw new Error("You do not have permission to manage shipments.");
  }
  return { userId: user.id, workspaceId, canManage, carrier: clean(workspace.carrier).toLowerCase() };
}

async function integrationFor(service: any, workspaceId: string): Promise<SenditIntegration> {
  const { data, error } = await service.from("workspace_sendit_integrations")
    .select("workspace_id, public_key, secret_key, public_key_last4, secret_key_last4, enabled, pickup_district_id, allow_open, allow_try, packaging_id, last_tested_at, last_test_status")
    .eq("workspace_id", workspaceId).maybeSingle();
  if (error || !data?.enabled || !data.public_key || !data.secret_key) {
    throw new Error("Sendit is not connected for this workspace. Connect it in Settings > Integrations.");
  }
  return data as SenditIntegration;
}

async function loginSendit(integration: SenditIntegration, workspaceId: string, forceRefresh = false) {
  const cached = tokenCache.get(workspaceId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await fetch(`${SENDIT_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ public_key: integration.public_key, secret_key: integration.secret_key }),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  const token = clean(data?.data?.token);
  if (!response.ok || data?.success !== true || !token) {
    tokenCache.delete(workspaceId);
    const error = new Error(providerMessage(data, "Sendit rejected the supplied credentials."));
    (error as any).code = senditFailureCode(response.status, data, "SENDIT_AUTH_FAILED");
    (error as any).httpStatus = response.status;
    throw error;
  }
  // Sendit does not document token expiry. A conservative cache reduces logins,
  // while 45 minutes and one authenticated retry prevent stale-token loops.
  tokenCache.set(workspaceId, { token, expiresAt: Date.now() + 45 * 60_000 });
  return token;
}

async function senditRequest(integration: SenditIntegration, workspaceId: string, path: string, init: RequestInit = {}, retried = false): Promise<{ response: Response; data: any }> {
  const token = await loginSendit(integration, workspaceId, retried);
  const response = await fetch(`${SENDIT_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!retried && (response.status === 401 || response.status === 403)) {
    tokenCache.delete(workspaceId);
    return senditRequest(integration, workspaceId, path, init, true);
  }
  return { response, data };
}

function requireAccepted(result: { response: Response; data: any }, fallbackCode: string, fallbackMessage: string) {
  if (!result.response.ok || result.data?.success === false) {
    const error = new Error(providerMessage(result.data, fallbackMessage));
    (error as any).code = senditFailureCode(result.response.status, result.data, fallbackCode);
    (error as any).httpStatus = result.response.status;
    throw error;
  }
  return result.data;
}

async function logAction(service: any, workspaceId: string, action: string, options: {
  order?: any; trackingNumber?: string; success?: boolean; httpStatus?: number; message?: string; metadata?: Record<string, unknown>;
} = {}) {
  const order = options.order;
  await service.from("shipping_logs").insert({
    workspace_id: workspaceId,
    provider: "sendit",
    order_id: clean(order?.id) || null,
    order_number: clean(order?.order_number) || null,
    action,
    request_payload: safeProviderData({ tracking_number: options.trackingNumber || clean(order?.tracking_number), ...options.metadata }),
    response_payload: safeProviderData({ success: options.success, http_status: options.httpStatus }),
    http_status: options.httpStatus ?? null,
    error: options.success === false ? options.message || "Sendit request failed" : null,
  });
}

async function getOrder(service: any, workspaceId: string, orderId: string) {
  let result = await service.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", orderId).maybeSingle();
  if (!result.data) result = await service.from("orders").select("*").eq("workspace_id", workspaceId).eq("id", orderId).maybeSingle();
  if (result.error || !result.data) throw new Error("Order was not found in this workspace.");
  return result.data;
}

function orderIdentifier(order: any) { return clean(order?.["Order ID"] || order?.id); }
async function updateOrder(service: any, workspaceId: string, order: any, values: Record<string, unknown>) {
  const key = orderIdentifier(order);
  let result = await service.from("orders").update(values).eq("workspace_id", workspaceId).eq("Order ID", key).select('"Order ID"').maybeSingle();
  if (!result.data && !result.error && clean(order?.id)) result = await service.from("orders").update(values).eq("workspace_id", workspaceId).eq("id", order.id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Could not save the Sendit shipment in Ecom OS.");
}

async function receiverName(service: any, order: any) {
  const direct = clean(order.customer_name || [order.first_name, order.last_name].filter(Boolean).join(" ") || order.Customer);
  if (direct) return direct;
  if (order.customer_id) {
    const { data } = await service.from("customers").select("name").eq("id", order.customer_id).maybeSingle();
    if (clean(data?.name)) return clean(data.name);
  }
  return "";
}

async function resolveSenditDistrict(service: any, workspaceId: string, order: any, workspaceCarrier: string) {
  const direct = clean(order.provider_city_id);
  if (direct && (workspaceCarrier === "sendit" || clean(order.shipping_provider).toLowerCase() === "sendit")) return direct;
  const rawCity = clean(order.raw_city || order.city || order.city_name);
  if (!rawCity) return "";
  const { data } = await service.from("city_mappings")
    .select("provider_city_id").eq("workspace_id", workspaceId).eq("provider_key", "sendit")
    .eq("normalized_raw_city", normalizeCity(rawCity)).maybeSingle();
  return clean(data?.provider_city_id);
}

async function buildSenditDeliveryPayload(service: any, workspaceId: string, order: any, integration: SenditIntegration, workspaceCarrier: string, overrides: Record<string, unknown> = {}) {
  const districtId = asPositiveInt(overrides.district_id ?? await resolveSenditDistrict(service, workspaceId, order, workspaceCarrier));
  const pickupId = asPositiveInt(overrides.pickup_district_id ?? integration.pickup_district_id);
  const name = clean(overrides.name ?? await receiverName(service, order));
  const amount = Number(overrides.amount ?? order.cod_amount ?? order.total ?? 0);
  const phone = clean(overrides.phone ?? order.phone ?? order.customer?.phone);
  const address = clean(overrides.address ?? order.address);
  if (!pickupId) throw Object.assign(new Error("Choose a Sendit default pickup city in Settings before sending parcels."), { code: "SENDIT_INVALID_CITY" });
  if (!districtId) throw Object.assign(new Error("The Sendit destination city could not be resolved. Select a Sendit city for this order."), { code: "SENDIT_INVALID_CITY" });
  if (!name || !phone || !address || !Number.isFinite(amount) || amount < 0) throw Object.assign(new Error("Customer name, phone, address, and COD amount are required for Sendit."), { code: "SENDIT_INVALID_ORDER" });
  return {
    pickup_district_id: pickupId,
    district_id: districtId,
    name,
    amount,
    address,
    phone,
    comment: clean(overrides.comment ?? order.notes ?? ""),
    reference: clean(overrides.reference ?? order.order_number),
    allow_open: Number(overrides.allow_open ?? integration.allow_open ? 1 : 0),
    allow_try: Number(overrides.allow_try ?? integration.allow_try ? 1 : 0),
    products_from_stock: 0,
    products: "",
    ...(asPositiveInt(overrides.packaging_id ?? integration.packaging_id) ? { packaging_id: asPositiveInt(overrides.packaging_id ?? integration.packaging_id) } : {}),
    option_exchange: 0,
    delivery_exchange_id: "",
  };
}

async function acquireCreationLock(service: any, workspaceId: string, orderId: string) {
  await service.from("sendit_parcel_creation_locks").delete().eq("workspace_id", workspaceId)
    .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
  const { error } = await service.from("sendit_parcel_creation_locks").insert({ workspace_id: workspaceId, order_id: orderId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}
async function releaseCreationLock(service: any, workspaceId: string, orderId: string) {
  await service.from("sendit_parcel_creation_locks").delete().eq("workspace_id", workspaceId).eq("order_id", orderId);
}

function alreadyLinked(order: any) {
  const provider = clean(order.shipping_provider || order.shipping_company).toLowerCase();
  return clean(order.tracking_number || order.shipment_id) ? { provider: provider || "another provider", tracking: clean(order.tracking_number || order.shipment_id) } : null;
}

async function persistSenditShipment(service: any, workspaceId: string, order: any, data: any, source: string) {
  const trackingNumber = clean(data?.code);
  if (!trackingNumber) throw Object.assign(new Error("Sendit did not return a delivery code."), { code: "SENDIT_CREATE_FAILED" });
  const rawStatus = clean(data?.status).toUpperCase() || null;
  const mapped = mapSenditStatus(rawStatus);
  const values: Record<string, unknown> = {
    tracking_number: trackingNumber,
    shipment_id: trackingNumber,
    shipping_provider: "sendit",
    shipping_company: "sendit",
    shipment_status: rawStatus,
    shipping_status: mapped || order.shipping_status || null,
    shipping_status_raw: safeProviderData(data),
    parcel_created_at: order.parcel_created_at || now(),
    shipping_cost: Number.isFinite(Number(data?.fee)) ? Number(data.fee) : order.shipping_cost ?? null,
    shipping_updated_at: now(),
    last_tracking_sync: now(),
  };
  await updateOrder(service, workspaceId, order, values);
  await logAction(service, workspaceId, source, { order, trackingNumber, success: true, metadata: { status: rawStatus, fee: values.shipping_cost } });
  return { trackingNumber, rawStatus, shippingStatus: mapped, fee: values.shipping_cost };
}

async function syncSenditOrder(service: any, workspaceId: string, order: any, integration: SenditIntegration, action: string) {
  const trackingNumber = clean(order.tracking_number || order.shipment_id);
  if (!trackingNumber) throw Object.assign(new Error("This Sendit order has no tracking number."), { code: "SENDIT_TRACKING_FAILED" });
  const result = await senditRequest(integration, workspaceId, `/deliveries/${encodeURIComponent(trackingNumber)}`);
  const data = requireAccepted(result, "SENDIT_TRACKING_FAILED", "Sendit could not retrieve this delivery.")?.data;
  const rawStatus = clean(data?.status).toUpperCase() || null;
  const mapped = mapSenditStatus(rawStatus);
  const next = {
    shipment_status: rawStatus,
    shipping_status: mapped || order.shipping_status || null,
    shipping_status_raw: safeProviderData(data),
    shipping_cost: Number.isFinite(Number(data?.fee)) ? Number(data.fee) : order.shipping_cost ?? null,
    shipping_updated_at: now(),
    last_tracking_sync: now(),
  };
  const changed = next.shipment_status !== order.shipment_status || next.shipping_status !== order.shipping_status
    || Number(next.shipping_cost) !== Number(order.shipping_cost);
  if (changed) await updateOrder(service, workspaceId, order, next);
  else await updateOrder(service, workspaceId, order, { last_tracking_sync: next.last_tracking_sync });
  await logAction(service, workspaceId, action, { order, trackingNumber, success: true, httpStatus: result.response.status, metadata: { status: rawStatus, changed } });
  return { tracking_number: trackingNumber, raw_status: rawStatus, shipping_status: mapped, changed, data: safeProviderData(data) };
}

function query(path: string, params: Record<string, unknown>) {
  const url = new URL(`${SENDIT_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => { if (clean(value)) url.searchParams.set(key, clean(value)); });
  return `${url.pathname}${url.search}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = clean(body.action).toLowerCase();
    const workspaceId = clean(body.workspace_id);
    if (!action || !workspaceId) return json({ success: false, provider: "sendit", code: "INVALID_REQUEST", message: "action and workspace_id are required." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const manageActions = new Set(["set-credentials", "disconnect", "update-preferences"]);
    const access = await authenticate(req, service, workspaceId, manageActions.has(action));

    if (action === "status") {
      const { data } = await service.from("workspace_sendit_integrations")
        .select("enabled, public_key_last4, secret_key_last4, pickup_district_id, allow_open, allow_try, packaging_id, last_tested_at, last_test_status")
        .eq("workspace_id", workspaceId).maybeSingle();
      return json({ success: true, connected: Boolean(data?.enabled) && data?.last_test_status !== "invalid_credentials", ...data });
    }

    if (action === "set-credentials") {
      const publicKey = clean(body.public_key);
      const secretKey = clean(body.secret_key);
      if (publicKey.length < 3 || secretKey.length < 8) return json({ success: false, provider: "sendit", code: "INVALID_CREDENTIALS", message: "Enter both Sendit Public Key and Secret Key." }, 400);
      const { error } = await service.from("workspace_sendit_integrations").upsert({
        workspace_id: workspaceId, public_key: publicKey, secret_key: secretKey, public_key_last4: publicKey.slice(-4), secret_key_last4: secretKey.slice(-4), enabled: true, updated_at: now(),
      });
      if (error) throw error;
      tokenCache.delete(workspaceId);
      return json({ success: true, connected: true, public_key_last4: publicKey.slice(-4), secret_key_last4: secretKey.slice(-4) });
    }

    if (action === "disconnect") {
      const { error } = await service.from("workspace_sendit_integrations").update({ enabled: false, updated_at: now() }).eq("workspace_id", workspaceId);
      if (error) throw error;
      tokenCache.delete(workspaceId);
      return json({ success: true, connected: false });
    }

    if (action === "update-preferences") {
      const pickupId = body.pickup_district_id === null || body.pickup_district_id === undefined ? undefined : asPositiveInt(body.pickup_district_id);
      const packagingId = body.packaging_id === null || body.packaging_id === undefined ? null : asPositiveInt(body.packaging_id);
      if (body.pickup_district_id !== undefined && body.pickup_district_id !== null && !pickupId) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_CITY", message: "Select a valid Sendit pickup city." }, 400);
      if (body.packaging_id !== undefined && body.packaging_id !== null && !packagingId) return json({ success: false, provider: "sendit", code: "INVALID_REQUEST", message: "Select a valid Sendit packaging option." }, 400);
      const values: Record<string, unknown> = { updated_at: now() };
      if (pickupId !== undefined) values.pickup_district_id = pickupId;
      if (packagingId !== undefined) values.packaging_id = packagingId;
      if (typeof body.allow_open === "boolean") values.allow_open = body.allow_open;
      if (typeof body.allow_try === "boolean") values.allow_try = body.allow_try;
      const { error } = await service.from("workspace_sendit_integrations").update(values).eq("workspace_id", workspaceId);
      if (error) throw error;
      return json({ success: true });
    }

    const integration = await integrationFor(service, workspaceId);
    if (action === "test-connection") {
      try {
        const token = await loginSendit(integration, workspaceId, true);
        await service.from("workspace_sendit_integrations").update({ last_tested_at: now(), last_test_status: "connected", updated_at: now() }).eq("workspace_id", workspaceId);
        await logAction(service, workspaceId, "sendit.login", { success: true });
        return json({ success: true, connected: true, message: "Connected successfully", account: Boolean(token) ? "verified" : undefined });
      } catch (error: any) {
        await service.from("workspace_sendit_integrations").update({ last_tested_at: now(), last_test_status: "invalid_credentials", updated_at: now() }).eq("workspace_id", workspaceId);
        await logAction(service, workspaceId, "sendit.login", { success: false, message: error?.message });
        throw error;
      }
    }

    if (action === "pickup-cities") {
      const result = await senditRequest(integration, workspaceId, "/districts/pickup-cities");
      const data = requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit pickup cities could not be loaded.");
      await logAction(service, workspaceId, "sendit.city_lookup", { success: true, httpStatus: result.response.status });
      return json({ success: true, data: safeProviderData(data.data ?? []) });
    }
    if (action === "cities") {
      const result = await senditRequest(integration, workspaceId, query("/districts", {
        page: asPositiveInt(body.page) || 1,
        querystring: clean(body.querystring),
        "pickup-district": asPositiveInt(body.pickup_district_id ?? integration.pickup_district_id),
      }));
      const data = requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit delivery cities could not be loaded.");
      await logAction(service, workspaceId, "sendit.city_lookup", { success: true, httpStatus: result.response.status, metadata: { page: body.page || 1, has_query: Boolean(clean(body.querystring)) } });
      return json({ success: true, data: safeProviderData(data.data ?? []), total: data.total, per_page: data.per_page, current_page: data.current_page, last_page: data.last_page });
    }
    if (action === "city-details") {
      const id = asPositiveInt(body.district_id); if (!id) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_CITY", message: "A valid Sendit district is required." }, 400);
      const result = await senditRequest(integration, workspaceId, `/districts/${id}`);
      const data = requireAccepted(result, "SENDIT_INVALID_CITY", "Sendit city details could not be loaded.");
      return json({ success: true, data: safeProviderData(data.data) });
    }
    if (action === "statuses") {
      const result = await senditRequest(integration, workspaceId, "/all-status-deliveries");
      const data = requireAccepted(result, "SENDIT_TRACKING_FAILED", "Sendit status catalog could not be loaded.");
      return json({ success: true, data: safeProviderData(data.data ?? {}) });
    }
    if (action === "packagings" || action === "products" || action === "list-deliveries" || action === "pickups" || action === "returns") {
      const endpoints: Record<string, string> = { packagings: "/packagings", products: "/products", "list-deliveries": "/deliveries", pickups: "/pickups", returns: "/returns" };
      const result = await senditRequest(integration, workspaceId, query(endpoints[action], { page: asPositiveInt(body.page) || 1, querystring: clean(body.querystring) }));
      const data = requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit could not load this list.");
      return json({ success: true, data: safeProviderData(data.data ?? []), total: data.total, per_page: data.per_page, current_page: data.current_page, last_page: data.last_page });
    }

    if (action === "create-delivery") {
      const orderId = clean(body.order_id); if (!orderId) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "order_id is required." }, 400);
      if (access.carrier !== "sendit") return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "Sendit is not this workspace's selected delivery company for new shipments." }, 409);
      let order = await getOrder(service, workspaceId, orderId);
      const existing = alreadyLinked(order);
      if (existing) return json({ success: true, provider: "sendit", status: "already_linked", code: "SENDIT_ALREADY_LINKED", tracking_number: existing.tracking, trackingNumber: existing.tracking, existing_provider: existing.provider, message: `This order already has a ${existing.provider} shipment.` });
      const locked = await acquireCreationLock(service, workspaceId, orderIdentifier(order));
      if (!locked) return json({ success: true, provider: "sendit", status: "already_linked", code: "SENDIT_ALREADY_LINKED", message: "A Sendit create request is already in progress for this order. No duplicate was created." });
      try {
        order = await getOrder(service, workspaceId, orderId);
        const afterLock = alreadyLinked(order);
        if (afterLock) return json({ success: true, provider: "sendit", status: "already_linked", code: "SENDIT_ALREADY_LINKED", tracking_number: afterLock.tracking, trackingNumber: afterLock.tracking, existing_provider: afterLock.provider, message: `This order already has a ${afterLock.provider} shipment.` });
        const payload = await buildSenditDeliveryPayload(service, workspaceId, order, integration, access.carrier);
        const result = await senditRequest(integration, workspaceId, "/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const response = requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit could not create this delivery.");
        const shipment = await persistSenditShipment(service, workspaceId, order, response.data, "sendit.create_delivery");
        return json({ success: true, provider: "sendit", status: "created", tracking_number: shipment.trackingNumber, trackingNumber: shipment.trackingNumber, shipping_status: shipment.shippingStatus, raw_status: shipment.rawStatus, fee: shipment.fee, label_url: clean(response.data?.labelUrl) || null });
      } catch (error: any) {
        await logAction(service, workspaceId, "sendit.create_delivery", { order, success: false, message: error?.message });
        throw error;
      } finally { await releaseCreationLock(service, workspaceId, orderIdentifier(order)); }
    }

    if (action === "get-delivery" || action === "tracking") {
      const orderId = clean(body.order_id); if (!orderId) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "order_id is required." }, 400);
      const order = await getOrder(service, workspaceId, orderId);
      if (clean(order.shipping_provider).toLowerCase() !== "sendit") return json({ success: false, provider: "sendit", code: "SENDIT_TRACKING_FAILED", message: "This order is not a Sendit shipment." }, 409);
      const sync = await syncSenditOrder(service, workspaceId, order, integration, action === "tracking" ? "sendit.tracking_sync" : "sendit.get_delivery");
      return json({ success: true, provider: "sendit", ...sync });
    }

    if (action === "mass-tracking") {
      const requested = Array.isArray(body.order_ids) ? body.order_ids.map(clean).filter(Boolean).slice(0, 25) : [];
      const { data: orders } = await service.from("orders").select("*").eq("workspace_id", workspaceId).eq("shipping_provider", "sendit");
      const candidates = (orders ?? []).filter((order: any) => requested.length ? requested.includes(orderIdentifier(order)) || requested.includes(clean(order.id)) : true)
        .filter((order: any) => clean(order.tracking_number) && !TERMINAL_SENDIT_STATUSES.has(clean(order.shipment_status).toUpperCase()));
      const failures: string[] = []; let updated = 0; const queue = [...candidates];
      const worker = async () => { while (queue.length) { const order = queue.shift(); if (!order) return; try { await syncSenditOrder(service, workspaceId, order, integration, "sendit.tracking_sync"); updated++; } catch (error: any) { failures.push(`${order.order_number}: ${error?.message || "tracking failed"}`); } } };
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      return json({ success: true, provider: "sendit", updated, failures, skipped_terminal: (orders ?? []).filter((order: any) => clean(order.shipping_provider).toLowerCase() === "sendit" && TERMINAL_SENDIT_STATUSES.has(clean(order.shipment_status).toUpperCase())).length });
    }

    if (action === "update-delivery") {
      const orderId = clean(body.order_id); if (!orderId) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "order_id is required." }, 400);
      const order = await getOrder(service, workspaceId, orderId); const code = clean(order.tracking_number || order.shipment_id);
      if (clean(order.shipping_provider).toLowerCase() !== "sendit" || !code) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "This order has no Sendit delivery to update." }, 409);
      const payload = await buildSenditDeliveryPayload(service, workspaceId, order, integration, access.carrier, body.changes && typeof body.changes === "object" ? body.changes : {});
      const result = await senditRequest(integration, workspaceId, `/deliveries/${encodeURIComponent(code)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const response = requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit rejected the delivery update.");
      const shipment = await persistSenditShipment(service, workspaceId, order, response.data || { code }, "sendit.update_delivery");
      return json({ success: true, provider: "sendit", tracking_number: shipment.trackingNumber, shipping_status: shipment.shippingStatus });
    }

    if (action === "delete-delivery") {
      const orderId = clean(body.order_id); if (!orderId) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "order_id is required." }, 400);
      const order = await getOrder(service, workspaceId, orderId); const code = clean(order.tracking_number || order.shipment_id);
      if (clean(order.shipping_provider).toLowerCase() !== "sendit" || !code) return json({ success: false, provider: "sendit", code: "SENDIT_INVALID_ORDER", message: "This order has no Sendit delivery to delete." }, 409);
      const result = await senditRequest(integration, workspaceId, `/deliveries/${encodeURIComponent(code)}`, { method: "DELETE" });
      requireAccepted(result, "SENDIT_CREATE_FAILED", "Sendit rejected deletion of this delivery.");
      await updateOrder(service, workspaceId, order, { tracking_number: null, shipment_id: null, shipping_provider: null, shipping_company: null, shipment_status: null, shipping_status: null, shipping_status_raw: null, shipping_cost: null, shipping_updated_at: now(), last_tracking_sync: now() });
      await logAction(service, workspaceId, "sendit.delete_delivery", { order, trackingNumber: code, success: true, httpStatus: result.response.status });
      return json({ success: true, provider: "sendit", message: "Sendit delivery deleted. The Ecom order was kept." });
    }

    if (action === "labels") {
      const codes = Array.isArray(body.order_ids) ? await Promise.all(body.order_ids.map(async (id: unknown) => { const order = await getOrder(service, workspaceId, clean(id)); return clean(order.shipping_provider).toLowerCase() === "sendit" ? clean(order.tracking_number || order.shipment_id) : ""; })) : clean(body.codes_to_print).split(",");
      const selected = Array.from(new Set(codes.map(clean).filter(Boolean)));
      if (!selected.length) return json({ success: false, provider: "sendit", code: "SENDIT_LABEL_FAILED", message: "Select at least one sent Sendit parcel." }, 400);
      const format = asPositiveInt(body.print_format) || 1;
      const result = await senditRequest(integration, workspaceId, "/deliveries/getlabels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codesToPrint: selected.join(","), printFormat: format }) });
      const data = requireAccepted(result, "SENDIT_LABEL_FAILED", "Sendit could not prepare the label file.");
      await logAction(service, workspaceId, "sendit.labels", { success: true, httpStatus: result.response.status, metadata: { count: selected.length, print_format: format } });
      return json({ success: true, provider: "sendit", data: safeProviderData(data.data) });
    }

    if (action === "get-pickup" || action === "get-return") {
      const code = clean(body.code); if (!code) return json({ success: false, provider: "sendit", code: "INVALID_REQUEST", message: "code is required." }, 400);
      const path = action === "get-pickup" ? "/pickups/" : "/returns/";
      const result = await senditRequest(integration, workspaceId, `${path}${encodeURIComponent(code)}`);
      const data = requireAccepted(result, action === "get-pickup" ? "SENDIT_PICKUP_FAILED" : "SENDIT_RETURN_FAILED", "Sendit could not retrieve this request.");
      return json({ success: true, provider: "sendit", data: safeProviderData(data.data) });
    }
    if (action === "create-pickup" || action === "create-return") {
      const payload = body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {};
      const path = action === "create-pickup" ? "/pickups" : "/returns";
      const code = action === "create-pickup" ? "SENDIT_PICKUP_FAILED" : "SENDIT_RETURN_FAILED";
      const result = await senditRequest(integration, workspaceId, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = requireAccepted(result, code, `Sendit could not create this ${action === "create-pickup" ? "pickup" : "return"}.`);
      await logAction(service, workspaceId, action === "create-pickup" ? "sendit.pickup" : "sendit.return", { success: true, httpStatus: result.response.status });
      return json({ success: true, provider: "sendit", data: safeProviderData(data.data) });
    }

    return json({ success: false, provider: "sendit", code: "INVALID_ACTION", message: "Unsupported Sendit action." }, 400);
  } catch (error: any) {
    const code = clean(error?.code) || "SENDIT_CREATE_FAILED";
    const status = Number(error?.httpStatus) || (code === "SENDIT_AUTH_FAILED" ? 401 : code === "SENDIT_RATE_LIMITED" ? 429 : 400);
    return json({ success: false, provider: "sendit", code, message: clean(error?.message) || "Sendit request failed." }, status);
  }
});
