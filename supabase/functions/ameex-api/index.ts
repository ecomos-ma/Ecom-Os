// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AMEEX_BASE_URL = "https://api.ameex.app";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Access = { userId: string; workspaceId: string; canManage: boolean };
type AmeexIntegration = {
  client_api_id: string;
  client_api_key: string;
  client_id_last4: string;
  client_key_last4: string;
  enabled: boolean;
  open_on_delivery: boolean;
  try_on_delivery: boolean;
  fragile: boolean;
};
type AmeexResponse = {
  response: Response;
  data: unknown;
  text: string;
  contentType: string;
  duration: number;
};

type PrintableAmeexResponse = {
  response: Response;
  html: string;
  contentType: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const clean = (value: unknown) => String(value ?? "").trim();
const firstClean = (...values: unknown[]) => values.map(clean).find(Boolean) || "";
const now = () => new Date().toISOString();
const normalize = (value: unknown) => clean(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[’'`-]/g, " ").replace(/\s+/g, " ").trim();
const normalizeAmeexCity = (value: unknown) => clean(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[إأآٱ]/g, "ا")
  .replace(/[ىئ]/g, "ي")
  .replace(/ؤ/g, "و")
  .replace(/ة/g, "ه")
  .toLowerCase().replace(/[’'`_\-./\\|,;:()[\]{}]+/g, " ").replace(/\s+/g, " ").trim();
const compactAmeexCity = (value: unknown) => normalizeAmeexCity(value).replace(/\s+/g, "");
const defaultAmeexCityMappings = [
  { display_name: "Agadir", ameex_city_id: 63, aliases: ["اكادير", "أكادير"] },
  { display_name: "Meknes", ameex_city_id: 2, aliases: ["مكناس", "meknas"] },
  { display_name: "Chefchaouen", ameex_city_id: 127, aliases: ["aazayeb-chefchaouen", "aazayeb chefchaouen"] },
  { display_name: "Nador", ameex_city_id: 17, aliases: ["AFRA-nador", "afra nador"] },
  { display_name: "Tan Tan", ameex_city_id: 41, aliases: ["Abteh-tantan", "Abteh Tan Tan", "abteh tantan", "tantan"] },
  { display_name: "Berkane", ameex_city_id: 109, aliases: ["Aïn Erreggada", "Ain Erreggada", "Aïn Regada", "Ain Regada", "Erreggada"] },
].map((mapping) => ({
  ...mapping,
  normalized_city: normalizeAmeexCity(mapping.display_name),
  aliases: Array.from(new Set([mapping.display_name, ...mapping.aliases])),
  default_mapping: true,
}));
const isUuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
const supportedCanonicalStatuses = new Set([
  "NEW_PARCEL", "WAITING_PICKUP", "PICKED_UP", "RECEIVED_AT_WAREHOUSE",
  "IN_DISTRIBUTION", "OUT_FOR_DELIVERY", "DELIVERED", "CUSTOMER_UNREACHABLE",
  "NO_ANSWER", "PHONE_OFF", "WRONG_ADDRESS", "RESCHEDULE_REQUESTED",
  "REFUSED", "DELIVERY_FAILED", "RETURNED_TO_AGENCY", "RETURN_IN_PROGRESS",
  "RETURNED_TO_SENDER", "CANCELED",
]);

function normalizeApiCredential(value: unknown) {
  return clean(value).replace(/^c-api-(?:id|key)\s*:\s*/i, "").replace(/^['"]|['"]$/g, "");
}

function safeNumber(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function safeProviderData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeProviderData(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "").slice(0, 1000);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
    if (/api.?key|authorization|secret|token|password/i.test(key)) return [key, "[redacted]"];
    return [key, safeProviderData(nested, depth + 1)];
  }));
}

function providerMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return clean(data).slice(0, 500) || fallback;
  const source = data as Record<string, any>;
  const direct = ["message", "Message", "MESSAGE", "error", "Error", "ERROR", "detail", "details"].map((key) => clean(source[key])).find(Boolean);
  if (direct) return direct.slice(0, 500);
  for (const value of Object.values(source)) {
    if (value && typeof value === "object") {
      const nested = providerMessage(value, "");
      if (nested) return nested;
    }
  }
  return fallback;
}

function providerRejected(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const source = data as Record<string, any>;
  if (source.success === false || source.Success === false || source.ok === false || source.OK === false) return true;
  const result = clean(source.result ?? source.Result ?? source.status ?? source.Status).toLowerCase();
  if (["error", "failed", "failure", "invalid", "denied"].includes(result)) return true;
  return Object.values(source).some((value) => value && typeof value === "object" && providerRejected(value));
}

type NamedProviderValue = { value: string; path: string };

const responseKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const embeddedResponseContainers = new Set(["data", "result", "response", "parcel", "newparcel", "addparcel"]);

function parseEmbeddedProviderJson(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findNamedProviderValue(input: unknown, names: string[], path: string[] = [], depth = 0): NamedProviderValue | null {
  if (!input || typeof input !== "object" || depth > 8) return null;
  if (Array.isArray(input)) {
    for (let index = 0; index < input.length; index++) {
      const result = findNamedProviderValue(input[index], names, [...path, `[${index}]`], depth + 1);
      if (result) return result;
    }
    return null;
  }

  const record = input as Record<string, unknown>;
  const entries = Object.entries(record);
  const expectedNames = names.map(responseKey);
  for (const name of expectedNames) {
    for (const [key, value] of entries) {
      if (responseKey(key) !== name) continue;
      const result = clean(value);
      if (result) return { value: result, path: [...path, key].join(".") };
    }
  }

  for (const [key, value] of entries) {
    const keyName = responseKey(key);
    const embedded = embeddedResponseContainers.has(keyName) ? parseEmbeddedProviderJson(value) : null;
    const result = findNamedProviderValue(embedded ?? value, names, [...path, key], depth + 1);
    if (result) return result;
  }
  return null;
}

function findNamedValue(input: unknown, names: string[], depth = 0): string | null {
  return findNamedProviderValue(input, names, [], depth)?.value ?? null;
}

function isAmeexParcelCode(value: string) {
  // Ameex tracking codes are provider-issued opaque uppercase identifiers.
  // Based on actual observed pattern: AGA0826B28534PS6821349 (24 chars)
  // We only accept one from an explicit tracking/parcel field, never a generic ID.
  return /^[A-Z0-9][A-Z0-9_-]{10,29}$/.test(value.toUpperCase());
}

function extractAmeexParcelReference(data: unknown): NamedProviderValue | null {
  // Only explicit parcel/tracking field names are accepted. A generic `id` or
  // `code` is never treated as a parcel code because it can identify a status.
  const result = findNamedProviderValue(data, ["parcelcode", "parcel_code", "trackingnumber", "tracking_number", "tbl_code"]);
  if (!result || !isAmeexParcelCode(result.value)) return null;
  return { ...result, value: result.value.toUpperCase() };
}

function extractAmeexParcelCode(data: unknown) {
  return extractAmeexParcelReference(data)?.value ?? null;
}

function extractAmeexOrderNumber(data: unknown) {
  return findNamedValue(data, ["ordernum", "order_num", "order_number", "ordernumber", "merchant_order_reference", "merchantorderreference"]);
}

function extractAmeexDeliveryNoteRef(data: unknown) {
  return findNamedValue(data, ["deliverynoteref", "delivery_note_ref", "ref", "reference"]);
}

function extractRawStatus(data: unknown) {
  return findNamedValue(data, ["status_code", "statuscode", "shipping_status", "shippingstatus", "statut", "situation", "status", "status_name", "statusname"]);
}

function mapAmeexStatus(rawTracking: unknown, rawInfo: unknown, statusCatalog: unknown): string | null {
  const candidate = extractRawStatus(rawTracking) || extractRawStatus(rawInfo);
  if (!candidate) return null;
  const canonical = candidate.toUpperCase().replace(/[\s-]+/g, "_");
  if (supportedCanonicalStatuses.has(canonical)) return canonical;

  // The API collection does not define Ameex status IDs or labels. We preserve
  // unknown provider states instead of guessing a business-critical outcome.
  // Once a live /Statuts response is observed, its exact mappings can be added
  // here without changing historical data.
  void statusCatalog;
  return null;
}

function providerSummary(data: unknown) {
  if (!data || typeof data !== "object") return clean(data).slice(0, 200) || "empty response";
  return Object.entries(data as Record<string, unknown>).slice(0, 8).map(([key, value]) => {
    const fields = value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>).slice(0, 6).join(", ")
      : typeof value;
    return `${key}${fields ? ` (${fields})` : ""}`;
  }).join("; ");
}

function safeAmeexDiagnosticData(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeAmeexDiagnosticData(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "").slice(0, 2_000);

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
    // The response can echo shipment recipient data. Keep the complete shape
    // for debugging without retaining customer PII or any credential material.
    if (/api.?key|api.?id|authorization|secret|token|password|phone|receiver|address|email|customer/i.test(key)) {
      return [key, "[redacted]"];
    }
    return [key, safeAmeexDiagnosticData(nested, depth + 1)];
  }));
}

function ameexResponseDiagnostic(result: AmeexResponse) {
  const parsed = result.data && typeof result.data === "object" ? safeAmeexDiagnosticData(result.data) : null;
  const rows = ameexParcelCollectionRows(result.data);
  const firstRow = rows?.[0];
  const topLevelType = Array.isArray(result.data) ? "array" : result.data === null ? "null" : typeof result.data;
  const topLevelKeys = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? Object.keys(result.data as Record<string, unknown>).slice(0, 40)
    : [];
  const rowShape = Array.isArray(firstRow)
    ? { kind: "array", length: firstRow.length }
    : firstRow && typeof firstRow === "object"
      ? { kind: "object", keys: Object.keys(firstRow as Record<string, unknown>).slice(0, 40) }
      : firstRow === undefined
        ? null
        : { kind: typeof firstRow };
  return {
    response_content_type: result.contentType || null,
    response_http_status: result.response.status,
    top_level_type: topLevelType,
    top_level_keys: topLevelKeys,
    response_is_json: Boolean(parsed),
    records_count: rows?.length ?? null,
    row_shape: rowShape,
    response: parsed,
    non_json_preview: parsed ? null : clean(result.text)
      .replace(/(?:c-api-(?:id|key)|authorization)\s*[:=]\s*[^\s,;]+/ig, "[redacted]")
      .replace(/\b(?:\+?212|0)\d{8,10}\b/g, "[redacted-phone]")
      .slice(0, 2_000),
  };
}

async function authenticate(req: Request, service: any, workspaceId: string, needsManage = false): Promise<Access> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication is required.");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) throw new Error("Function authentication is not configured.");
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) throw new Error("Invalid or expired session.");

  const [{ data: workspace }, { data: membership }, { data: profile }] = await Promise.all([
    service.from("workspaces").select("id, created_by").eq("id", workspaceId).maybeSingle(),
    service.from("profile_workspaces").select("workspace_id").eq("workspace_id", workspaceId).eq("profile_id", user.id).maybeSingle(),
    service.from("profiles").select("role, allowed_sections").eq("id", user.id).maybeSingle(),
  ]);
  if (!workspace || (workspace.created_by !== user.id && !membership)) throw new Error("You do not have access to this workspace.");
  const role = clean(profile?.role).toLowerCase();
  const canManage = workspace.created_by === user.id || ["owner", "admin", "supervisor", "founder", "super_admin"].includes(role);
  const sections = Array.isArray(profile?.allowed_sections) ? profile.allowed_sections.map((item: unknown) => clean(item).toLowerCase()) : [];
  if (needsManage && !canManage) throw new Error("Only workspace administrators can manage Ameex settings.");
  if (!needsManage && !canManage && sections.length > 0 && !sections.some((section: string) => ["shipping", "delivering", "orders"].includes(section))) {
    throw new Error("You do not have permission to manage shipments.");
  }
  return { userId: user.id, workspaceId, canManage };
}

async function integrationFor(service: any, workspaceId: string): Promise<AmeexIntegration> {
  const { data, error } = await service.from("workspace_ameex_integrations")
    .select("client_api_id, client_api_key, client_id_last4, client_key_last4, enabled, open_on_delivery, try_on_delivery, fragile")
    .eq("workspace_id", workspaceId).maybeSingle();
  if (error || !data?.enabled || !data.client_api_id || !data.client_api_key) {
    throw new Error("Ameex is not connected for this workspace. Connect it in Settings > Integrations.");
  }
  return data as AmeexIntegration;
}

async function ameexFetch(integration: AmeexIntegration, path: string, init: RequestInit = {}): Promise<AmeexResponse> {
  const startedAt = Date.now();
  const response = await fetch(`${AMEEX_BASE_URL}${path}`, {
    ...init,
    headers: {
      "C-Api-Id": integration.client_api_id,
      "C-Api-Key": integration.client_api_key,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* Ameex also returns printable HTML. */ }
  return { response, data, text, contentType: response.headers.get("content-type") || "", duration: Date.now() - startedAt };
}

function formPayload(fields: Record<string, unknown>, repeated: Record<string, string[]> = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  Object.entries(repeated).forEach(([key, values]) => values.forEach((value) => form.append(key, value)));
  return form;
}

async function logAction(service: any, workspaceId: string, action: string, options: {
  order?: any;
  trackingNumber?: string;
  success?: boolean;
  duration?: number;
  httpStatus?: number;
  message?: string;
  metadata?: Record<string, unknown>;
} = {}) {
  const order = options.order;
  const orderId = isUuid(order?.id) ? order.id : null;
  const trackingNumber = options.trackingNumber || clean(order?.tracking_number);
  const metadata = { tracking_number: trackingNumber, ...options.metadata };
  
  const { error } = await service.from("shipping_logs").insert({
    workspace_id: workspaceId,
    provider: "ameex",
    order_id: orderId,
    order_number: clean(order?.order_number) || null,
    action: action,
    request_payload: safeProviderData(metadata),
    response_payload: safeProviderData({ duration_ms: options.duration, http_status: options.httpStatus, success: options.success }),
    http_status: options.httpStatus,
    error: options.success === false ? options.message : null,
  });
  if (error) console.error("[Ameex] shipping log insert failed", { message: error.message, action, order_number: clean(order?.order_number) });
}

async function getOrder(service: any, workspaceId: string, orderId: string) {
  let result = await service.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", orderId).maybeSingle();
  if (!result.data) result = await service.from("orders").select("*").eq("workspace_id", workspaceId).eq("id", orderId).maybeSingle();
  if (result.error || !result.data) throw new Error("Order was not found in this workspace.");
  return result.data;
}

function orderIdentifier(order: any) {
  return clean(order?.["Order ID"] || order?.id);
}

async function updateOrder(service: any, workspaceId: string, order: any, values: Record<string, unknown>) {
  const identifier = orderIdentifier(order);
  let result = await service.from("orders").update(values).eq("workspace_id", workspaceId).eq("Order ID", identifier).select('"Order ID"').maybeSingle();
  if (!result.data && !result.error && clean(order?.id)) {
    result = await service.from("orders").update(values).eq("workspace_id", workspaceId).eq("id", order.id).select('id').maybeSingle();
  }
  if (result.error || !result.data) throw new Error("Could not update the shipment in Ecom OS.");
}

async function resolveReceiver(service: any, order: any) {
  const fromOrder = clean(order.customer_name || [order.first_name, order.last_name].filter(Boolean).join(" ") || order["Customer"]);
  if (fromOrder) return fromOrder;
  if (order.customer_id) {
    const { data } = await service.from("customers").select("name").eq("id", order.customer_id).maybeSingle();
    if (clean(data?.name)) return clean(data.name);
  }
  return "";
}

function cityLookupCandidates(cityValue: string) {
  const raw = clean(cityValue);
  const candidates = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeAmeexCity(value);
    if (normalized) candidates.add(normalized);
  };
  add(raw);
  raw.split(/[-_/|,;]+/g).map(clean).filter(Boolean).forEach(add);
  return Array.from(candidates);
}

function mappingKeys(mapping: any) {
  const values = [mapping.normalized_city, mapping.display_name, ...(Array.isArray(mapping.aliases) ? mapping.aliases : [])];
  return values.map((value) => ({
    normalized: normalizeAmeexCity(value),
    compact: compactAmeexCity(value),
  })).filter((item) => item.normalized);
}

function findAmeexCityMapping(cityValue: string, mappings: any[]) {
  const candidates = cityLookupCandidates(cityValue);
  const compactCandidates = new Set(candidates.map((candidate) => candidate.replace(/\s+/g, "")));
  const scored = mappings.flatMap((mapping) => mappingKeys(mapping).map((key) => {
    const exact = candidates.includes(key.normalized);
    const compact = compactCandidates.has(key.compact);
    return exact || compact ? { mapping, score: exact ? 2 : 1 } : null;
  }).filter(Boolean) as Array<{ mapping: any; score: number }>);
  scored.sort((a, b) => (b.score - a.score) || (a.mapping.default_mapping ? 1 : -1));
  const best = scored[0]?.mapping ?? null;
  if (!best) return null;
  const sameCity = scored.filter((item) => Number(item.mapping.ameex_city_id) === Number(best.ameex_city_id));
  return sameCity.length === scored.length ? best : null;
}

async function resolveAmeexCity(service: any, workspaceId: string, cityValue: string) {
  const normalized = normalizeAmeexCity(cityValue);
  if (!normalized) throw new Error("City is required before sending to Ameex.");
  if (normalized === "test") throw new Error("Ameex city mapping required: \"Test\" is not a real Ameex city. Edit the order city or map it manually before sending.");
  const { data: mappings, error } = await service.from("ameex_city_mappings")
    .select("normalized_city, display_name, ameex_city_id, aliases");
  if (error) throw new Error(`Could not load Ameex city mappings: ${error.message || JSON.stringify(error)}`);
  const workspaceMatch = findAmeexCityMapping(cityValue, mappings ?? []);
  if (workspaceMatch) return workspaceMatch;
  const defaultMatch = findAmeexCityMapping(cityValue, defaultAmeexCityMappings);
  if (defaultMatch) return defaultMatch;
  throw new Error(`Ameex city is not recognized for "${cityValue}". Please select a valid city from the list.`);
}

async function buildAmeexParcelPayload(service: any, workspaceId: string, order: any, integration: AmeexIntegration, overrides: Record<string, unknown> = {}) {
  const receiver = clean(overrides.receiver ?? await resolveReceiver(service, order));
  const phone = clean(overrides.phone ?? order.phone ?? order.customer?.phone).replace(/\s+/g, "");
  const cityInput = firstClean(overrides.city, order.raw_city, order.provider_city_name, order.city, order.city_name);
  const city = await resolveAmeexCity(service, workspaceId, cityInput);
  const address = clean(overrides.address ?? order.address);
  const cod = safeNumber(overrides.cod ?? order.cod_amount ?? order.total_price ?? order.total ?? order.variant_price);
  const product = clean(overrides.product ?? order.product_name ?? order.product ?? order.product_variant ?? order.sku ?? "Order");
  if (!receiver) throw new Error("Customer name is required.");
  if (!phone) throw new Error("Phone is required.");
  if (!address) throw new Error("Address is required.");
  if (cod === null || cod < 0) throw new Error("A valid COD amount is required.");
  return {
    type: "SIMPLE",
    business: integration.client_api_id,
    order_num: clean(overrides.order_num ?? order.order_number),
    replace: clean(overrides.replace) === "true" ? "true" : "false",
    exchange_code: clean(overrides.exchange_code),
    open: overrides.open === "YES" || overrides.open === "NO" ? overrides.open : integration.open_on_delivery ? "YES" : "NO",
    try: overrides.try === "YES" || overrides.try === "NO" ? overrides.try : integration.try_on_delivery ? "YES" : "NO",
    fragile: overrides.fragile === "1" || overrides.fragile === 1 || overrides.fragile === true ? "1" : integration.fragile ? "1" : "0",
    receiver,
    phone,
    city: city.ameex_city_id,
    address,
    comment: clean(overrides.comment ?? order.notes),
    product,
    cod,
  };
}

async function acquireCreationLock(service: any, workspaceId: string, orderId: string) {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await service.from("ameex_parcel_creation_locks").delete().eq("workspace_id", workspaceId).lt("created_at", staleBefore);
  const { error } = await service.from("ameex_parcel_creation_locks").insert({ workspace_id: workspaceId, order_id: orderId });
  if (!error) return { acquired: true as const };
  if (error.code === "23505") return { acquired: false as const };
  throw new Error("Could not reserve this order for a safe Ameex shipment operation.");
}

async function releaseCreationLock(service: any, workspaceId: string, orderId: string) {
  await service.from("ameex_parcel_creation_locks").delete().eq("workspace_id", workspaceId).eq("order_id", orderId);
}

function requireAccepted(result: AmeexResponse, fallback: string) {
  if (!result.response.ok || providerRejected(result.data)) {
    throw new Error(providerMessage(result.data, `${fallback} (${result.response.status}).`));
  }
}

function directNamedProviderValue(record: Record<string, unknown>, names: string[]): NamedProviderValue | null {
  const entries = Object.entries(record);
  for (const name of names.map(responseKey)) {
    for (const [key, value] of entries) {
      if (responseKey(key) !== name) continue;
      const found = clean(value);
      if (found) return { value: found, path: key };
    }
  }
  return null;
}

type AmeexParcelCandidate = { trackingNumber: string | null; orderNumber: string; record: Record<string, unknown> };
type AmeexParcelListParseResult =
  | { status: "valid"; parcels: AmeexParcelCandidate[]; total: number }
  | { status: "provider_error"; message: string }
  | { status: "unrecognized"; reason: string; raw: unknown };
type AmeexReconciliationResult =
  | { status: "found"; parcelCode: string; parcel: unknown }
  | { status: "not_found" }
  | { status: "multiple"; parcelCodes: string[] }
  | { status: "inconclusive"; reason: string; raw?: unknown }
  | { status: "error"; message: string };

function normalizeAmeexOrderReference(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toUpperCase();
}

function collectAmeexParcelCandidates(input: unknown, depth = 0): AmeexParcelCandidate[] {
  if (!input || typeof input !== "object" || depth > 8) return [];
  if (Array.isArray(input)) return input.flatMap((item) => collectAmeexParcelCandidates(item, depth + 1));

  const record = input as Record<string, unknown>;
  const tracking = directNamedProviderValue(record, ["parcelcode", "parcel_code", "trackingnumber", "tracking_number", "tbl_code"]);
  const orderNumber = directNamedProviderValue(record, ["ordernum", "order_num", "order_number", "ordernumber", "merchant_order_reference", "merchantorderreference", "tbl_order_num"]);
  const ownCandidate = orderNumber
    ? [{ trackingNumber: tracking && isAmeexParcelCode(tracking.value) ? tracking.value.toUpperCase() : null, orderNumber: orderNumber.value, record }]
    : [];
  return [...ownCandidate, ...Object.values(record).flatMap((value) => collectAmeexParcelCandidates(value, depth + 1))];
}

function ameexParcelCollectionRows(data: unknown, depth = 0): unknown[] | null {
  if (depth > 5) return null;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = responseKey(key);
    if (!["data", "aadata", "result", "response", "aadatadata"].includes(normalizedKey)) continue;
    if (Array.isArray(value)) return value;
    const embedded = parseEmbeddedProviderJson(value);
    if (Array.isArray(embedded)) return embedded;
    const nested = ameexParcelCollectionRows(embedded ?? value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function hasExplicitZeroAmeexParcelCount(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  const zeroCountKeys = new Set(["recordstotal", "recordsfiltered", "itotalrecords", "itotaldisplayrecords", "totalrecords"]);
  const counts = Object.entries(record).filter(([key]) => zeroCountKeys.has(responseKey(key)));
  if (!counts.length) return false;
  return counts.every(([, value]) => {
    const numeric = safeNumber(value);
    return numeric !== null && numeric === 0;
  });
}

function ameexParcelListTotal(data: unknown, fallback: number) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const counts = Object.entries(data as Record<string, unknown>)
    .filter(([key]) => ["recordstotal", "recordsfiltered", "itotalrecords", "itotaldisplayrecords", "totalrecords"].includes(responseKey(key)))
    .map(([, value]) => safeNumber(value))
    .filter((value): value is number => value !== null);
  return counts.length ? Math.max(...counts) : fallback;
}

function parseAmeexParcelListResponse(response: unknown): AmeexParcelListParseResult {
  if (providerRejected(response)) return { status: "provider_error", message: providerMessage(response, "Ameex rejected the parcel lookup.") };

  const rows = ameexParcelCollectionRows(response);
  if (rows) {
    if (rows.length === 0) return { status: "valid", parcels: [], total: 0 };
    const parcels = collectAmeexParcelCandidates(rows);
    return parcels.length > 0
      ? { status: "valid", parcels, total: ameexParcelListTotal(response, rows.length) }
      : { status: "unrecognized", reason: "Ameex returned non-empty rows without explicit order-number fields.", raw: response };
  }

  if (hasExplicitZeroAmeexParcelCount(response)) return { status: "valid", parcels: [], total: 0 };

  return { status: "unrecognized", reason: "Ameex did not return a recognized parcel-list envelope.", raw: response };
}

async function reconcileAmeexOrder(service: any, workspaceId: string, integration: AmeexIntegration, order: any, requestId: string, source: string): Promise<AmeexReconciliationResult> {
  const orderNumber = normalizeAmeexOrderReference(order?.order_number);
  if (!orderNumber) return { status: "error", message: "An Ecom order number is required before Ameex can safely check for an existing parcel." };

  let result: AmeexResponse;
  try {
    result = await ameexFetch(integration, "/customer/Delivery/Parcels/Json", {
      method: "POST",
      body: formPayload({
        start: 0,
        length: 25,
        "search[value]": orderNumber,
        "search[regex]": "false",
        business: integration.client_api_id,
        all_data: 1,
      }),
    });
  } catch (error: any) {
    const message = error?.message || "Could not contact Ameex for parcel reconciliation.";
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      message,
      metadata: { request_id: requestId, source, reconciliation_status: "error", workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: orderNumber },
    });
    return { status: "error", message };
  }

  if (!result.response.ok || providerRejected(result.data)) {
    const message = providerMessage(result.data, `Could not verify existing Ameex parcels (${result.response.status}).`);
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      duration: result.duration,
      httpStatus: result.response.status,
      message,
      metadata: {
        request_id: requestId,
        source,
        reconciliation_status: "error",
        workspace_id: workspaceId,
        order_id: orderIdentifier(order),
        order_number: orderNumber,
        diagnostic: ameexResponseDiagnostic(result),
      },
    });
    return { status: "error", message };
  }

  const parsed = parseAmeexParcelListResponse(result.data);
  if (parsed.status === "provider_error") {
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      duration: result.duration,
      httpStatus: result.response.status,
      message: parsed.message,
      metadata: { request_id: requestId, source, reconciliation_status: "error", workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: orderNumber },
    });
    return { status: "error", message: parsed.message };
  }
  if (parsed.status === "unrecognized") {
    const diagnostic = ameexResponseDiagnostic(result);
    console.warn("[Ameex] Parcel list response cannot be safely reconciled", diagnostic);
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      duration: result.duration,
      httpStatus: result.response.status,
      message: parsed.reason,
      metadata: { request_id: requestId, source, reconciliation_status: "inconclusive", workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: orderNumber, parser_reason: parsed.reason, diagnostic },
    });
    return { status: "inconclusive", reason: parsed.reason, raw: safeAmeexDiagnosticData(parsed.raw) };
  }

  const matching = parsed.parcels.filter((candidate) => normalizeAmeexOrderReference(candidate.orderNumber) === orderNumber);
  const uniqueCodes = [...new Set(matching.map((candidate) => candidate.trackingNumber).filter((code): code is string => Boolean(code)))];

  if (matching.length > 0 && uniqueCodes.length === 0) {
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      duration: result.duration,
      httpStatus: result.response.status,
      message: `Ameex returned an existing parcel for order ${orderNumber}, but its tracking code could not be safely identified.`,
      metadata: { request_id: requestId, source, reconciliation_status: "inconclusive", workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: orderNumber, response_summary: providerSummary(result.data), diagnostic: ameexResponseDiagnostic(result) },
    });
    return { status: "inconclusive", reason: "Ameex returned an existing parcel but Ecom OS could not safely identify its parcel code.", raw: safeAmeexDiagnosticData(result.data) };
  }
  if (uniqueCodes.length > 1) {
    await logAction(service, workspaceId, "ameex.order_reconciliation", {
      order,
      success: false,
      duration: result.duration,
      httpStatus: result.response.status,
      message: `Multiple Ameex parcels already exist for order ${orderNumber}.`,
      metadata: { request_id: requestId, source, reconciliation_status: "multiple", workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: orderNumber, parcel_codes: uniqueCodes },
    });
    return { status: "multiple", parcelCodes: uniqueCodes };
  }

  const status = uniqueCodes.length === 1 ? "found" : "not_found";
  await logAction(service, workspaceId, "ameex.parcel_lookup", {
    order,
    trackingNumber: uniqueCodes[0],
    success: true,
    duration: result.duration,
    httpStatus: result.response.status,
    metadata: {
      request_id: requestId,
      source,
      workspace_id: workspaceId,
      order_id: orderIdentifier(order),
      order_number: orderNumber,
      lookup_status: parsed.status,
      reconciliation_status: status,
      matched_parcel_count: uniqueCodes.length,
      parsed_parcel_count: parsed.parcels.length,
      provider_total: parsed.total,
      response_summary: providerSummary(result.data),
      diagnostic: ameexResponseDiagnostic(result),
    },
  });
  if (uniqueCodes[0]) {
    const parcel = matching.find((candidate) => candidate.trackingNumber === uniqueCodes[0])?.record ?? result.data;
    return { status: "found", parcelCode: uniqueCodes[0], parcel };
  }
  return { status: "not_found" };
}

function ameexCreationTimestamp(data: unknown) {
  const value = findNamedValue(data, ["creationtime", "creation_time", "createdat", "created_at"]);
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function linkAmeexShipment(service: any, workspaceId: string, order: any, parcelCode: string, creationTimestamp?: string | null) {
  const timestamp = now();
  await updateOrder(service, workspaceId, order, {
    tracking_number: parcelCode,
    shipment_id: parcelCode,
    shipping_provider: "ameex",
    shipping_company: "ameex",
    parcel_created_at: creationTimestamp || order.parcel_created_at || timestamp,
    shipping_updated_at: timestamp,
  });
}

async function readAmeexParcelState(integration: AmeexIntegration, parcelCode: string) {
  const requests = [
    { name: "info", path: `/customer/Delivery/Parcels/Info?ParcelCode=${encodeURIComponent(parcelCode)}` },
    { name: "tracking", path: `/customer/Delivery/Parcels/Tracking?ParcelCode=${encodeURIComponent(parcelCode)}` },
  ];
  const responses = await Promise.all(requests.map(async ({ name, path }) => {
    try {
      const result = await ameexFetch(integration, path);
      return { name, result, accepted: result.response.ok && !providerRejected(result.data), error: null as string | null };
    } catch (error: any) {
      return { name, result: null as AmeexResponse | null, accepted: false, error: error?.message || "Network request failed" };
    }
  }));
  const accepted = responses.filter((item) => item.accepted);
  if (!accepted.length) {
    const details = responses.map(({ name, result, error }) => `${name}: ${error || providerMessage(result?.data, `HTTP ${result?.response.status ?? "request failed"}`)}`).join("; ");
    throw new Error(`Ameex parcel was linked, but its current state could not be read (${details}).`);
  }
  return {
    info: responses.find((item) => item.name === "info" && item.accepted)?.result ?? null,
    tracking: responses.find((item) => item.name === "tracking" && item.accepted)?.result ?? null,
    failures: responses.filter((item) => !item.accepted).map(({ name, result, error }) => ({ name, message: error || providerMessage(result?.data, `HTTP ${result?.response.status ?? "request failed"}`) })),
  };
}

async function reconcileAmeexShipment(service: any, workspaceId: string, order: any, integration: AmeexIntegration, parcelCode: string, source: string, creationResponse?: unknown, requestId?: string) {
  await linkAmeexShipment(service, workspaceId, order, parcelCode, ameexCreationTimestamp(creationResponse));

  try {
    const state = await readAmeexParcelState(integration, parcelCode);
    const rawStatus = extractRawStatus(state.tracking?.data) || extractRawStatus(state.info?.data);
    const mappedStatus = mapAmeexStatus(state.tracking?.data, state.info?.data, null);
    const providerState = { info: state.info?.data ?? null, tracking: state.tracking?.data ?? null };
    const update: Record<string, unknown> = {
      tracking_number: parcelCode,
      shipment_id: parcelCode,
      shipping_provider: "ameex",
      shipping_company: "ameex",
      shipment_status: rawStatus || order.shipment_status,
      shipping_status_raw: safeProviderData(providerState),
      parcel_created_at: ameexCreationTimestamp(state.info?.data) || ameexCreationTimestamp(creationResponse) || order.parcel_created_at || now(),
      shipping_updated_at: now(),
      last_tracking_sync: now(),
    };
    if (mappedStatus) update.shipping_status = mappedStatus;
    await updateOrder(service, workspaceId, order, update);
    await logAction(service, workspaceId, "ameex.parcel_reconciled", {
      order,
      trackingNumber: parcelCode,
      success: true,
      metadata: {
        request_id: requestId,
        source,
        raw_status: rawStatus || null,
        mapped_status: mappedStatus,
        provider_read_failures: state.failures,
        response: safeProviderData(providerState),
      },
    });
    if (!mappedStatus && rawStatus) {
      await logAction(service, workspaceId, "ameex.unmapped_status", {
        order,
        trackingNumber: parcelCode,
        success: false,
        message: `AMEEX_UNMAPPED_STATUS: ${rawStatus}`,
        metadata: { request_id: requestId, source, raw_status: rawStatus },
      });
    }
    return { trackingNumber: parcelCode, rawStatus, mappedStatus, stateReadWarning: state.failures.length ? state.failures : null };
  } catch (error: any) {
    // The provider parcel is already safely linked above. Never make a caller
    // retry Add Parcel merely because Info/Tracking is temporarily unavailable.
    const message = error?.message || "Ameex parcel state could not be read.";
    await logAction(service, workspaceId, "ameex.parcel_reconcile_state", {
      order,
      trackingNumber: parcelCode,
      success: false,
      message,
      metadata: { request_id: requestId, source },
    });
    return { trackingNumber: parcelCode, rawStatus: null, mappedStatus: null, stateReadWarning: [message] };
  }
}

async function saveAmeexShipmentSafely(service: any, workspaceId: string, order: any, integration: AmeexIntegration, parcelCode: string, source: string, creationResponse: unknown, requestId: string) {
  try {
    const shipment = await reconcileAmeexShipment(service, workspaceId, order, integration, parcelCode, source, creationResponse, requestId);
    return { ok: true as const, shipment };
  } catch (error: any) {
    const message = error?.message || "Could not save the Ameex shipment in Ecom OS.";
    await logAction(service, workspaceId, "ameex.local_save_failed", {
      order,
      trackingNumber: parcelCode,
      success: false,
      message,
      metadata: { request_id: requestId, source, workspace_id: workspaceId, order_id: orderIdentifier(order), order_number: clean(order?.order_number), parcel_code: parcelCode },
    });
    return {
      ok: false as const,
      response: json({
        success: false,
        status: "failed",
        code: "AMEEX_LOCAL_SAVE_FAILED",
        provider: "ameex",
        message: "Ameex created or already has this parcel, but Ecom OS could not save the tracking number locally. Retry Send to recover it by reconciliation; do not create another parcel manually.",
        tracking_number: parcelCode,
        trackingNumber: parcelCode,
        request_id: requestId,
      }, 500),
    };
  }
}

type AmeexShipmentOutcome = "created" | "reconciled" | "already_linked";

function savedShipmentProvider(order: any) {
  return clean(order?.shipping_provider || order?.shipping_company).toLowerCase();
}

function alreadyLinkedShipmentResponse(order: any, trackingNumber: string, requestId: string, provider = savedShipmentProvider(order) || "unknown") {
  const isAmeex = provider === "ameex";
  const providerLabel = isAmeex ? "Ameex" : provider === "unknown" ? "an existing shipment" : provider;
  return json({
    success: true,
    status: "already_linked",
    code: isAmeex ? "AMEEX_ALREADY_LINKED" : "SHIPMENT_ALREADY_LINKED",
    provider,
    message: isAmeex
      ? "This order already has an Ameex shipment and was skipped."
      : `This order already has a ${providerLabel} shipment and was skipped. No Ameex parcel was created.`,
    tracking_number: trackingNumber,
    trackingNumber,
    shipping_status: clean(order?.shipping_status) || null,
    raw_status: extractRawStatus(order?.shipping_status_raw) || null,
    request_id: requestId,
  });
}

async function verifyAndRepairLegacyAmeexShipment(service: any, workspaceId: string, order: any, integration: AmeexIntegration, trackingNumber: string, requestId: string) {
  try {
    const probe = await ameexFetch(integration, `/customer/Delivery/Parcels/Info?ParcelCode=${encodeURIComponent(trackingNumber)}`);
    if (!probe.response.ok || providerRejected(probe.data)) return null;
    const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, trackingNumber, "legacy_tracking_verification", probe.data, requestId);
    if (!saved.ok) return saved.response;
    return alreadyLinkedShipmentResponse({ ...order, shipping_provider: "ameex", shipping_company: "ameex", shipping_status: saved.shipment.mappedStatus || order.shipping_status }, trackingNumber, requestId, "ameex");
  } catch (error: any) {
    await logAction(service, workspaceId, "ameex.legacy_tracking_verification", {
      order,
      trackingNumber,
      success: false,
      message: error?.message || "Could not verify the provider for an existing tracking number.",
      metadata: { request_id: requestId },
    });
    return null;
  }
}

function ameexShipmentSuccess(
  shipment: { trackingNumber: string; rawStatus: string | null; mappedStatus: string | null; stateReadWarning: unknown },
  status: AmeexShipmentOutcome,
  extra: Record<string, unknown> = {},
) {
  const code = status === "created"
    ? "AMEEX_CREATED"
    : status === "reconciled"
      ? "AMEEX_RECONCILED"
      : "AMEEX_ALREADY_LINKED";
  return json({
    success: true,
    status,
    code,
    provider: "ameex",
    tracking_number: shipment.trackingNumber,
    trackingNumber: shipment.trackingNumber,
    shipping_status: shipment.mappedStatus,
    raw_status: shipment.rawStatus || null,
    state_read_warning: shipment.stateReadWarning,
    ...extra,
  });
}

function ameexMultipleParcelsResponse(result: Extract<AmeexReconciliationResult, { status: "multiple" }>, requestId: string) {
  return json({
    success: false,
    status: "conflict",
    code: "AMEEX_MULTIPLE_MATCHES",
    provider: "ameex",
    message: "Multiple Ameex parcels already exist for this order. Manual review is required.",
    parcel_codes: result.parcelCodes,
    request_id: requestId,
  }, 409);
}

function ameexPreCreateReconciliationStop(result: AmeexReconciliationResult, requestId: string) {
  if (result.status === "multiple") return ameexMultipleParcelsResponse(result, requestId);
  if (result.status === "inconclusive") {
    return json({
      success: false,
      status: "conflict",
      code: "AMEEX_LOOKUP_UNRECOGNIZED",
      provider: "ameex",
      message: "Ameex lookup could not be confirmed safely. No duplicate shipment was created.",
      request_id: requestId,
    }, 409);
  }
  return json({
    success: false,
    status: "failed",
    code: "AMEEX_LOOKUP_FAILED",
    provider: "ameex",
    message: result.status === "error" ? result.message : "Ameex lookup failed before parcel creation.",
    request_id: requestId,
  }, 502);
}

function ameexPostCreateUncertainResponse(result: AmeexReconciliationResult, requestId: string) {
  return json({
    success: false,
    status: "uncertain",
    code: "AMEEX_CREATE_UNCERTAIN",
    provider: "ameex",
    message: "Ameex may have created this parcel, but Ecom OS could not confirm or link it safely. No automatic retry was performed to prevent a duplicate.",
    reconciliation_status: result.status,
    request_id: requestId,
  }, 502);
}

async function ameexPostCreateReconciliationResponse(service: any, workspaceId: string, order: any, integration: AmeexIntegration, result: AmeexReconciliationResult, creationResponse: unknown, requestId: string, source: string) {
  if (result.status === "found") {
    const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, result.parcelCode, source, creationResponse, requestId);
    if (!saved.ok) return saved.response;
    return ameexShipmentSuccess(saved.shipment, "reconciled", {
      reconciled: true,
      reconciled_after_create: true,
      message: "Ameex parcel created and linked successfully.",
      request_id: requestId,
    });
  }
  if (result.status === "multiple") return ameexMultipleParcelsResponse(result, requestId);
  return ameexPostCreateUncertainResponse(result, requestId);
}

async function getAmeexOrders(service: any, workspaceId: string, requestedIds?: unknown) {
  const { data, error } = await service.from("orders").select("*")
    .eq("workspace_id", workspaceId).eq("shipping_provider", "ameex").not("tracking_number", "is", null).limit(500);
  if (error) throw new Error("Could not load Ameex orders.");
  const ids = Array.isArray(requestedIds) ? new Set(requestedIds.map(clean).filter(Boolean)) : null;
  return (data ?? []).filter((order: any) => !ids || ids.has(orderIdentifier(order)) || ids.has(clean(order.id)));
}

function findTrackingRecords(input: unknown, depth = 0): any[] {
  if (!input || typeof input !== "object" || depth > 8) return [];
  if (Array.isArray(input)) return input.flatMap((item) => findTrackingRecords(item, depth + 1));
  const record = input as Record<string, unknown>;
  const code = extractAmeexParcelCode(record);
  const status = extractRawStatus(record);
  if (code && status) return [record];
  return Object.values(record).flatMap((item) => findTrackingRecords(item, depth + 1));
}

async function persistTracking(service: any, workspaceId: string, order: any, providerData: unknown, action: string) {
  const rawStatus = extractRawStatus(providerData);
  const mappedStatus = mapAmeexStatus(providerData, null, null);
  const update: Record<string, unknown> = {
    shipping_status_raw: safeProviderData(providerData),
    shipment_status: rawStatus || order.shipment_status,
    shipping_updated_at: now(),
    last_tracking_sync: now(),
  };
  if (mappedStatus) update.shipping_status = mappedStatus;
  await updateOrder(service, workspaceId, order, update);
  await logAction(service, workspaceId, action, {
    order,
    trackingNumber: clean(order.tracking_number),
    success: true,
    metadata: { raw_status: rawStatus || null, mapped_status: mappedStatus, response: safeProviderData(providerData) },
  });
  if (!mappedStatus && rawStatus) {
    await logAction(service, workspaceId, "ameex.unmapped_status", {
      order,
      trackingNumber: clean(order.tracking_number),
      success: false,
      message: `AMEEX_UNMAPPED_STATUS: ${rawStatus}`,
      metadata: { raw_status: rawStatus },
    });
  }
  return { rawStatus, mappedStatus };
}

async function createDeliveryNote(service: any, workspaceId: string, integration: AmeexIntegration) {
  console.log("[Ameex] Creating delivery note", JSON.stringify({ business_id: integration.client_api_id.slice(-4) }));
  
  const result = await ameexFetch(integration, "/customer/Delivery/DeliveryNotes/Action/Type/Add", {
    method: "POST",
    body: formPayload({ business: integration.client_api_id }),
  });
  
  // Log detailed response for debugging
  const responseInfo = {
    http_status: result.response.status,
    content_type: result.contentType,
    response_summary: providerSummary(result.data),
    diagnostic: ameexResponseDiagnostic(result)
  };
  
  if (!result.response.ok || providerRejected(result.data)) {
    console.error("[Ameex] Create delivery note failed", JSON.stringify(responseInfo));
    await logAction(service, workspaceId, "ameex.delivery_note_create_failed", { 
      success: false, 
      duration: result.duration, 
      httpStatus: result.response.status, 
      message: providerMessage(result.data, `Could not create Ameex delivery note (${result.response.status})`),
      metadata: responseInfo 
    });
    throw new Error(providerMessage(result.data, `Could not create Ameex delivery note (${result.response.status})`));
  }
  
  const ref = extractAmeexDeliveryNoteRef(result.data);
  if (!ref) {
    console.error("[Ameex] Delivery note created but no Ref found in response", JSON.stringify(responseInfo));
    await logAction(service, workspaceId, "ameex.delivery_note_create_no_ref", { success: false, duration: result.duration, httpStatus: result.response.status, message: "Ameex accepted the note request but returned no recognized Ref.", metadata: responseInfo });
    throw new Error("Ameex accepted the delivery note request but returned no recognized Ref. No labels were created.");
  }
  
  console.log("[Ameex] Delivery note created successfully", JSON.stringify({ ref }));
  await logAction(service, workspaceId, "ameex.delivery_note_create", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { ref } });
  return ref;
}

async function addParcelsToDeliveryNote(service: any, workspaceId: string, integration: AmeexIntegration, reference: string, trackingNumbers: string[]) {
  if (!trackingNumbers.length) throw new Error("Select at least one Ameex parcel.");
  
  // Log detailed request information
  const payloadInfo = {
    ref: reference,
    parcel_count: trackingNumbers.length,
    tracking_numbers: trackingNumbers.slice(0, 3), // Log first 3 for debugging
    has_more: trackingNumbers.length > 3
  };
  
  console.log("[Ameex] Adding parcels to delivery note", JSON.stringify(payloadInfo));
  
  const result = await ameexFetch(integration, `/customer/Delivery/DeliveryNotes/Action/Type/AddParcels?Ref=${encodeURIComponent(reference)}`, {
    method: "POST",
    body: formPayload({}, { "parcels[]": trackingNumbers }),
  });
  
  // Log detailed response information for debugging
  const responseInfo = {
    http_status: result.response.status,
    content_type: result.contentType,
    response_summary: providerSummary(result.data),
    diagnostic: ameexResponseDiagnostic(result),
    request_payload: payloadInfo
  };
  
  if (!result.response.ok || providerRejected(result.data)) {
    console.error("[Ameex] Add parcels to delivery note failed", JSON.stringify(responseInfo));
    await logAction(service, workspaceId, "ameex.delivery_note_add_parcels_failed", { 
      success: false, 
      duration: result.duration, 
      httpStatus: result.response.status, 
      message: providerMessage(result.data, `Could not add Ameex parcels to the delivery note (${result.response.status})`),
      metadata: responseInfo 
    });
    throw new Error(providerMessage(result.data, `Could not add Ameex parcels to the delivery note (${result.response.status})`));
  }
  
  console.log("[Ameex] Successfully added parcels to delivery note", JSON.stringify({ ref: reference, parcel_count: trackingNumbers.length }));
  await logAction(service, workspaceId, "ameex.delivery_note_add_parcels", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { ref: reference, parcel_count: trackingNumbers.length } });
}

async function saveDeliveryNote(service: any, workspaceId: string, integration: AmeexIntegration, reference: string) {
  const result = await ameexFetch(integration, `/customer/Delivery/DeliveryNotes/Action/Type/Save?Ref=${encodeURIComponent(reference)}`, { method: "PUT" });
  requireAccepted(result, "Could not save Ameex delivery note");
  await logAction(service, workspaceId, "ameex.delivery_note_save", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { ref: reference } });
}

async function printableAmeexResponse(integration: AmeexIntegration, path: string) {
  console.log("[Ameex] Fetching printable document", JSON.stringify({ path }));
  
  const response = await fetch(`${AMEEX_BASE_URL}${path}`, {
    headers: { "C-Api-Id": integration.client_api_id, "C-Api-Key": integration.client_api_key },
  });
  const html = await response.text();
  
  console.log("[Ameex] Printable document response", JSON.stringify({
    status: response.status,
    content_type: response.headers.get("content-type"),
    html_length: html.length,
    html_preview: html.substring(0, 200)
  }));
  
  if (!response.ok) {
    let data: unknown = html;
    try { data = JSON.parse(html); } catch { /* text error */ }
    throw new Error(providerMessage(data, `Ameex could not prepare the printable document (${response.status}).`));
  }
  return { response, html, contentType: response.headers.get("content-type") || "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action).toLowerCase();
    const workspaceId = clean(body.workspace_id);
    if (!action || !workspaceId) return json({ success: false, code: "INVALID_REQUEST", message: "action and workspace_id are required." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const manageActions = new Set(["set-credentials", "disconnect", "update-preferences", "save-city-mapping", "delete-city-mapping"]);
    await authenticate(req, service, workspaceId, manageActions.has(action));

    if (action === "status") {
      const { data } = await service.from("workspace_ameex_integrations")
        .select("enabled, client_id_last4, client_key_last4, open_on_delivery, try_on_delivery, fragile, last_tested_at, last_test_status")
        .eq("workspace_id", workspaceId).maybeSingle();
      return json({ success: true, connected: Boolean(data?.enabled) && data?.last_test_status !== "invalid_credentials", ...data });
    }

    if (action === "set-credentials") {
      const clientApiId = normalizeApiCredential(body.client_api_id);
      const clientApiKey = normalizeApiCredential(body.client_api_key);
      if (clientApiId.length < 3 || clientApiKey.length < 8) return json({ success: false, code: "INVALID_CREDENTIALS", message: "Enter both Ameex Client API ID and Client API Key." }, 400);
      const { error } = await service.from("workspace_ameex_integrations").upsert({
        workspace_id: workspaceId,
        client_api_id: clientApiId,
        client_api_key: clientApiKey,
        client_id_last4: clientApiId.slice(-4),
        client_key_last4: clientApiKey.slice(-4),
        enabled: true,
        last_test_status: null,
        updated_at: now(),
      }, { onConflict: "workspace_id" });
      if (error) throw new Error("Could not save Ameex credentials securely.");
      return json({ success: true, connected: true, client_id_last4: clientApiId.slice(-4), client_key_last4: clientApiKey.slice(-4) });
    }

    if (action === "disconnect") {
      const { error } = await service.from("workspace_ameex_integrations")
        .update({ enabled: false, client_api_id: "", client_api_key: "", client_id_last4: "", client_key_last4: "", last_test_status: "disconnected", updated_at: now() }).eq("workspace_id", workspaceId);
      if (error) throw new Error("Could not disconnect Ameex.");
      return json({ success: true, connected: false });
    }

    if (action === "update-preferences") {
      const { error } = await service.from("workspace_ameex_integrations").update({
        open_on_delivery: Boolean(body.open_on_delivery),
        try_on_delivery: Boolean(body.try_on_delivery),
        fragile: Boolean(body.fragile),
        updated_at: now(),
      }).eq("workspace_id", workspaceId);
      if (error) throw new Error("Could not save Ameex shipping preferences.");
      return json({ success: true });
    }

    // City mappings are now managed globally in ameex_city_mappings as a reference table

    const integration = await integrationFor(service, workspaceId);

    if (action === "test-connection" || action === "statuses") {
      const result = await ameexFetch(integration, "/customer/Delivery/Parcels/Statuts");
      const accepted = result.response.ok && !providerRejected(result.data);
      await service.from("workspace_ameex_integrations").update({
        last_tested_at: now(),
        last_test_status: accepted ? "connected" : result.response.status === 401 || result.response.status === 403 ? "invalid_credentials" : `http_${result.response.status}`,
        updated_at: now(),
      }).eq("workspace_id", workspaceId);
      if (!accepted) return json({ success: false, code: result.response.status === 401 || result.response.status === 403 ? "INVALID_CREDENTIALS" : "CONNECTION_FAILED", message: providerMessage(result.data, `Ameex connection failed (${result.response.status}).`) }, 400);
      await logAction(service, workspaceId, "ameex.statuses", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { response_summary: providerSummary(result.data) } });
      return json({ success: true, message: "Ameex accepted the status catalog request.", catalog_summary: providerSummary(result.data), status_catalog: safeProviderData(result.data) });
    }

    if (action === "create-parcel") {
      const requestId = crypto.randomUUID();
      let order = await getOrder(service, workspaceId, clean(body.order_id));
      const trackingNumber = clean(order.tracking_number || order.shipment_id);
      if (trackingNumber) {
        const provider = savedShipmentProvider(order);
        if (provider) return alreadyLinkedShipmentResponse(order, trackingNumber, requestId, provider);

        // A legacy row may have tracking but no saved provider. Verify it as
        // Ameex before repairing it; if verification fails, keep the order
        // protected rather than guessing and creating a second shipment.
        const repaired = await verifyAndRepairLegacyAmeexShipment(service, workspaceId, order, integration, trackingNumber, requestId);
        if (repaired) return repaired;
        return alreadyLinkedShipmentResponse(order, trackingNumber, requestId, "unknown");
      }
      const id = orderIdentifier(order);
      const lock = await acquireCreationLock(service, workspaceId, id);
      if (!lock.acquired) {
        const latest = await getOrder(service, workspaceId, id);
        const latestTracking = clean(latest.tracking_number || latest.shipment_id);
        if (latestTracking) return alreadyLinkedShipmentResponse(latest, latestTracking, requestId, savedShipmentProvider(latest) || "unknown");
        return json({
          success: false,
          status: "conflict",
          code: "AMEEX_OPERATION_IN_PROGRESS",
          provider: "ameex",
          message: "An Ameex shipment operation for this order is already in progress. Please wait before trying again.",
          request_id: requestId,
        }, 409);
      }
      try {
        // A competing request may have saved the provider shipment after this
        // request first read the order but before it acquired the lock.
        order = await getOrder(service, workspaceId, id);
        const latestTracking = clean(order.tracking_number || order.shipment_id);
        if (latestTracking) return alreadyLinkedShipmentResponse(order, latestTracking, requestId, savedShipmentProvider(order) || "unknown");

        const preCreate = await reconcileAmeexOrder(service, workspaceId, integration, order, requestId, "pre_create");
        if (preCreate.status === "found") {
          const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, preCreate.parcelCode, "pre_create_reconciliation", preCreate.parcel, requestId);
          if (!saved.ok) return saved.response;
          return ameexShipmentSuccess(saved.shipment, "reconciled", {
            reconciled: true,
            message: "Existing Ameex parcel found and linked successfully.",
            request_id: requestId,
          });
        }
        if (preCreate.status !== "not_found") return ameexPreCreateReconciliationStop(preCreate, requestId);

        const payload = await buildAmeexParcelPayload(service, workspaceId, order, integration);
        let result: AmeexResponse;
        try {
          result = await ameexFetch(integration, "/customer/Delivery/Parcels/Action/Type/Add", { method: "POST", body: formPayload(payload) });
        } catch (error: any) {
          const message = error?.message || "Ameex Add Parcel request did not return a usable response.";
          await logAction(service, workspaceId, "ameex.create_parcel.request_uncertain", {
            order,
            success: false,
            message,
            metadata: { request_id: requestId, workspace_id: workspaceId, order_id: id, order_number: clean(order.order_number) },
          });
          const reconciliation = await reconcileAmeexOrder(service, workspaceId, integration, order, requestId, "post_create_network_error");
          return await ameexPostCreateReconciliationResponse(service, workspaceId, order, integration, reconciliation, null, requestId, "post_create_network_error");
        }

        const accepted = result.response.ok && !providerRejected(result.data);
        if (!accepted) {
          const message = providerMessage(result.data, `Ameex rejected this parcel (${result.response.status}).`);
          const definitiveRejection = providerRejected(result.data) || result.response.status === 401 || result.response.status === 403 || result.response.status === 422;
          await logAction(service, workspaceId, definitiveRejection ? "ameex.create_parcel.rejected" : "ameex.create_parcel.http_uncertain", {
            order,
            success: false,
            duration: result.duration,
            httpStatus: result.response.status,
            message,
            metadata: { request_id: requestId, workspace_id: workspaceId, order_id: id, order_number: clean(order.order_number), diagnostic: ameexResponseDiagnostic(result) },
          });
          if (definitiveRejection) {
            const authenticationFailure = result.response.status === 401 || result.response.status === 403;
            return json({
              success: false,
              status: "failed",
              code: authenticationFailure ? "AMEEX_AUTH_FAILED" : "AMEEX_PROVIDER_REJECTED",
              provider: "ameex",
              message,
              request_id: requestId,
            }, authenticationFailure ? result.response.status : 400);
          }
          const reconciliation = await reconcileAmeexOrder(service, workspaceId, integration, order, requestId, "post_create_http_uncertain");
          return await ameexPostCreateReconciliationResponse(service, workspaceId, order, integration, reconciliation, result.data, requestId, "post_create_http_uncertain");
        }

        const parcelReference = extractAmeexParcelReference(result.data);
        if (!parcelReference) {
          const diagnostic = ameexResponseDiagnostic(result);
          console.warn("[Ameex] Add Parcel response needs parser confirmation", diagnostic);
          await logAction(service, workspaceId, "ameex.create_parcel.unrecognized_response", {
            order,
            success: false,
            duration: result.duration,
            httpStatus: result.response.status,
            message: "Ameex accepted Add Parcel but no recognized tracking field was parsed.",
            metadata: { request_id: requestId, workspace_id: workspaceId, order_id: id, order_number: clean(order.order_number), diagnostic },
          });

          const reconciliation = await reconcileAmeexOrder(service, workspaceId, integration, order, requestId, "post_create_unrecognized_add_response");
          return await ameexPostCreateReconciliationResponse(service, workspaceId, order, integration, reconciliation, result.data, requestId, "post_create_unrecognized_add_response");
        }

        const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, parcelReference.value, `add_response:${parcelReference.path}`, result.data, requestId);
        if (!saved.ok) return saved.response;
        await logAction(service, workspaceId, "ameex.create_parcel", {
          order,
          trackingNumber: saved.shipment.trackingNumber,
          success: true,
          duration: result.duration,
          httpStatus: result.response.status,
          metadata: {
            request_id: requestId,
            parser_path: parcelReference.path,
            raw_status: saved.shipment.rawStatus || null,
            mapped_status: saved.shipment.mappedStatus,
            state_read_warning: saved.shipment.stateReadWarning,
          },
        });
        return ameexShipmentSuccess(saved.shipment, "created", {
          message: "Ameex parcel created and linked successfully.",
          request_id: requestId,
        });
      } finally {
        await releaseCreationLock(service, workspaceId, id);
      }
    }

    if (action === "reconcile-parcel") {
      const requestId = crypto.randomUUID();
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const id = orderIdentifier(order);
      const lock = await acquireCreationLock(service, workspaceId, id);
      if (!lock.acquired) {
        return json({
          success: false,
          status: "conflict",
          code: "AMEEX_OPERATION_IN_PROGRESS",
          provider: "ameex",
          message: "An Ameex shipment operation for this order is already in progress. Please wait before trying again.",
          request_id: requestId,
        }, 409);
      }
      try {
        const locallySaved = clean(order.tracking_number || order.shipment_id);
        if (locallySaved) {
          const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, locallySaved, "manual_reconciliation_saved_code", null, requestId);
          if (!saved.ok) return saved.response;
          return ameexShipmentSuccess(saved.shipment, "already_linked", { request_id: requestId });
        }

        const reconciliation = await reconcileAmeexOrder(service, workspaceId, integration, order, requestId, "manual_reconciliation");
        if (reconciliation.status === "not_found") {
          return json({
            success: false,
            status: "not_found",
            code: "AMEEX_NOT_FOUND",
            provider: "ameex",
            message: `No Ameex parcel was found for exact order number ${clean(order.order_number)}. Nothing was changed in Ecom OS.`,
            request_id: requestId,
          }, 404);
        }
        if (reconciliation.status === "multiple") return ameexMultipleParcelsResponse(reconciliation, requestId);
        if (reconciliation.status === "inconclusive") {
          return json({ success: false, status: "uncertain", code: "AMEEX_LOOKUP_UNRECOGNIZED", provider: "ameex", message: "Ameex lookup could not be confirmed safely. No duplicate shipment was created.", request_id: requestId }, 502);
        }
        if (reconciliation.status === "error") {
          return json({ success: false, status: "failed", code: "AMEEX_LOOKUP_FAILED", provider: "ameex", message: reconciliation.message, request_id: requestId }, 502);
        }

        const saved = await saveAmeexShipmentSafely(service, workspaceId, order, integration, reconciliation.parcelCode, "manual_reconciliation", reconciliation.parcel, requestId);
        if (!saved.ok) return saved.response;
        return ameexShipmentSuccess(saved.shipment, "reconciled", {
          reconciled: true,
          message: "Existing Ameex parcel found and linked successfully.",
          request_id: requestId,
        });
      } finally {
        await releaseCreationLock(service, workspaceId, id);
      }
    }

    if (action === "get-parcel-info" || action === "tracking") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const parcelCode = clean(order.tracking_number || order.shipment_id);
      if (order.shipping_provider !== "ameex" || !parcelCode) return json({ success: false, code: "NO_AMEEX_PARCEL", message: "This order has no Ameex parcel." }, 400);
      const endpoint = action === "tracking"
        ? `/customer/Delivery/Parcels/Tracking?ParcelCode=${encodeURIComponent(parcelCode)}`
        : `/customer/Delivery/Parcels/Info?ParcelCode=${encodeURIComponent(parcelCode)}`;
      const result = await ameexFetch(integration, endpoint);
      requireAccepted(result, action === "tracking" ? "Could not retrieve Ameex tracking" : "Could not retrieve Ameex parcel info");
      const tracking = await persistTracking(service, workspaceId, order, result.data, action === "tracking" ? "ameex.tracking" : "ameex.parcel_info");
      return json({ success: true, tracking_number: parcelCode, shipping_status: tracking.mappedStatus, raw_status: tracking.rawStatus || null, data: safeProviderData(result.data) });
    }

    if (action === "mass-tracking" || action === "mass-info") {
      const orders = await getAmeexOrders(service, workspaceId, body.order_ids);
      if (!orders.length) return json({ success: true, updated: 0, failures: [], unmatched_codes: [] });
      const chunks = Array.from({ length: Math.ceil(orders.length / 25) }, (_, index) => orders.slice(index * 25, index * 25 + 25));
      const failures: string[] = [];
      const unmatchedCodes: string[] = [];
      let updated = 0;
      const responses: unknown[] = [];
      for (const chunk of chunks) {
        const codes = chunk.map((order: any) => clean(order.tracking_number)).filter(Boolean);
        // Ameex MassTracking/MassInfo endpoints expect JSON array format: { "codes": ["TRACKING1", "TRACKING2"] }
        const jsonBody = JSON.stringify({ codes });
        const result = await ameexFetch(integration, `/customer/Delivery/Parcels/${action === "mass-tracking" ? "MassTracking" : "MassInfo"}`, { 
          method: "POST", 
          body: jsonBody,
          headers: { "Content-Type": "application/json" }
        });
        if (!result.response.ok || providerRejected(result.data)) {
          failures.push(providerMessage(result.data, `Ameex ${action} failed (${result.response.status}).`));
          await logAction(service, workspaceId, `ameex.${action.replace("-", "_")}`, { success: false, duration: result.duration, httpStatus: result.response.status, message: failures[failures.length - 1], metadata: { parcel_count: codes.length } });
          continue;
        }
        responses.push(safeProviderData(result.data));
        if (action === "mass-info") {
          await logAction(service, workspaceId, "ameex.mass_info", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { parcel_count: codes.length } });
          updated += chunk.length;
          continue;
        }
        const records = findTrackingRecords(result.data);
        for (const order of chunk) {
          const code = clean(order.tracking_number);
          const matching = records.find((record) => clean(extractAmeexParcelCode(record)) === code) ?? (chunk.length === 1 ? result.data : null);
          if (!matching) { unmatchedCodes.push(code); continue; }
          await persistTracking(service, workspaceId, order, matching, "ameex.mass_tracking");
          updated++;
        }
        await logAction(service, workspaceId, "ameex.mass_tracking", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { parcel_count: codes.length, matched_count: records.length } });
      }
      return json({ success: failures.length === 0, updated, failures, unmatched_codes: unmatchedCodes, responses });
    }

    if (action === "edit-parcel") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const parcelCode = clean(order.tracking_number || order.shipment_id);
      if (order.shipping_provider !== "ameex" || !parcelCode) return json({ success: false, code: "NO_AMEEX_PARCEL", message: "This order has no Ameex parcel to edit." }, 400);
      const payload = await buildAmeexParcelPayload(service, workspaceId, order, integration, body.changes && typeof body.changes === "object" ? body.changes : {});
      const result = await ameexFetch(integration, `/customer/Delivery/Parcels/Action/Type/Edit?ParcelCode=${encodeURIComponent(parcelCode)}`, { method: "POST", body: formPayload(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "type" && key !== "business"))) });
      requireAccepted(result, "Ameex rejected this parcel update");
      // Keep only fields guaranteed by the normalized order model in sync after
      // Ameex accepts the edit. Provider-specific comment/product values remain
      // in Ameex unless Ecom has a corresponding canonical order field.
      await updateOrder(service, workspaceId, order, { phone: payload.phone, address: payload.address, updated_at: now() });
      await logAction(service, workspaceId, "ameex.edit_parcel", { order, trackingNumber: parcelCode, success: true, duration: result.duration, httpStatus: result.response.status });
      return json({ success: true });
    }

    if (action === "delete-parcel") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const parcelCode = clean(order.tracking_number || order.shipment_id);
      if (order.shipping_provider !== "ameex" || !parcelCode) return json({ success: false, code: "NO_AMEEX_PARCEL", message: "This order has no Ameex parcel to delete." }, 400);
      const result = await ameexFetch(integration, `/customer/Delivery/Parcels/Action/Type/Delete?ParcelCode=${encodeURIComponent(parcelCode)}`, { method: "DELETE" });
      requireAccepted(result, "Ameex rejected this parcel deletion");
      await updateOrder(service, workspaceId, order, { tracking_number: null, shipment_id: null, shipping_provider: null, shipping_company: null, shipping_status: null, shipment_status: null, shipping_status_raw: {}, delivery_note_ref: null, shipping_updated_at: now(), last_tracking_sync: now() });
      await logAction(service, workspaceId, "ameex.delete_parcel", { order, trackingNumber: parcelCode, success: true, duration: result.duration, httpStatus: result.response.status });
      return json({ success: true });
    }

    if (action === "relaunch") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const parcelCode = clean(order.tracking_number || order.shipment_id);
      if (order.shipping_provider !== "ameex" || !parcelCode) return json({ success: false, code: "NO_AMEEX_PARCEL", message: "This order has no Ameex parcel to relaunch." }, 400);
      const result = await ameexFetch(integration, `/customer/Delivery/Parcels/Action/Type/Relaunch?ParcelCode=${encodeURIComponent(parcelCode)}`);
      requireAccepted(result, "Ameex rejected the relaunch");
      await logAction(service, workspaceId, "ameex.relaunch", { order, trackingNumber: parcelCode, success: true, duration: result.duration, httpStatus: result.response.status });
      return json({ success: true, data: safeProviderData(result.data) });
    }

    if (action === "relaunch-new") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const parcelCode = clean(order.tracking_number || order.shipment_id);
      if (order.shipping_provider !== "ameex" || !parcelCode) return json({ success: false, code: "NO_AMEEX_PARCEL", message: "This order has no Ameex parcel to relaunch." }, 400);
      const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
      const payload = await buildAmeexParcelPayload(service, workspaceId, order, integration, changes);
      const result = await ameexFetch(integration, `/customer/Delivery/Parcels/Action/Type/RelaunchNew?ParcelCode=${encodeURIComponent(parcelCode)}`, {
        method: "POST",
        body: formPayload({ order_num: payload.order_num, receiver: payload.receiver, phone: payload.phone, city: payload.city, address: payload.address, comment: payload.comment, price: safeNumber((changes as Record<string, unknown>).price ?? payload.cod) }),
      });
      requireAccepted(result, "Ameex rejected the new-customer relaunch");
      await logAction(service, workspaceId, "ameex.relaunch_new", { order, trackingNumber: parcelCode, success: true, duration: result.duration, httpStatus: result.response.status });
      return json({ success: true, data: safeProviderData(result.data) });
    }

    if (action === "parcels-list") {
      const allowedFields = ["start", "length", "search[value]", "search[regex]", "business", "team", "city", "situation", "statut", "statut_s", "type", "date_type", "date[from]", "date[to]", "all_data"];
      const filters = body.filters && typeof body.filters === "object" ? body.filters as Record<string, unknown> : {};
      const fields = Object.fromEntries(allowedFields.filter((field) => filters[field] !== undefined).map((field) => [field, filters[field]]));
      const result = await ameexFetch(integration, "/customer/Delivery/Parcels/Json", { method: "POST", body: formPayload({ start: 0, length: 10, "search[value]": "", "search[regex]": "false", all_data: 1, ...fields }) });
      requireAccepted(result, "Could not list Ameex parcels");
      const parsed = parseAmeexParcelListResponse(result.data);
      await logAction(service, workspaceId, "ameex.parcels_list", {
        success: parsed.status === "valid",
        duration: result.duration,
        httpStatus: result.response.status,
        message: parsed.status === "provider_error" ? parsed.message : parsed.status === "unrecognized" ? parsed.reason : undefined,
        metadata: {
          lookup_status: parsed.status,
          parsed_parcel_count: parsed.status === "valid" ? parsed.parcels.length : 0,
          provider_total: parsed.status === "valid" ? parsed.total : null,
          response_summary: providerSummary(result.data),
        },
      });
      return json({
        success: true,
        lookup_status: parsed.status,
        parsed_parcel_count: parsed.status === "valid" ? parsed.parcels.length : 0,
        provider_total: parsed.status === "valid" ? parsed.total : null,
        data: safeProviderData(result.data),
      });
    }

    if (action === "create-delivery-note") {
      const ref = await createDeliveryNote(service, workspaceId, integration);
      return json({ success: true, reference: ref });
    }

    if (action === "add-parcels-to-delivery-note") {
      const reference = clean(body.reference);
      const trackingNumbers = Array.isArray(body.tracking_numbers) ? body.tracking_numbers.map(clean).filter(Boolean) : [];
      if (!reference) return json({ success: false, code: "INVALID_DELIVERY_NOTE", message: "Delivery note reference is required." }, 400);
      await addParcelsToDeliveryNote(service, workspaceId, integration, reference, trackingNumbers);
      return json({ success: true });
    }

    if (action === "save-delivery-note") {
      const reference = clean(body.reference);
      if (!reference) return json({ success: false, code: "INVALID_DELIVERY_NOTE", message: "Delivery note reference is required." }, 400);
      await saveDeliveryNote(service, workspaceId, integration, reference);
      return json({ success: true });
    }

    if (action === "delete-delivery-note") {
      const reference = clean(body.reference);
      if (!reference) return json({ success: false, code: "INVALID_DELIVERY_NOTE", message: "Delivery note reference is required." }, 400);
      const result = await ameexFetch(integration, `/customer/Delivery/DeliveryNotes/Action/Type/Delete?Ref=${encodeURIComponent(reference)}`, { method: "DELETE" });
      requireAccepted(result, "Could not delete Ameex delivery note");
      await logAction(service, workspaceId, "ameex.delivery_note_delete", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { ref: reference } });
      return json({ success: true });
    }

    if (action === "print-labels" || action === "print-note") {
      const reference = clean(body.reference);
      if (!reference) return json({ success: false, code: "INVALID_DELIVERY_NOTE", message: "Delivery note reference is required." }, 400);
      const labelTypes = new Set(["Label_100_100", "Label_A4", "Label_A4_8"]);
      const labelType = labelTypes.has(clean(body.label_type)) ? clean(body.label_type) : "Label_A4";
      const path = action === "print-labels"
        ? `/customer/Delivery/DeliveryNotes/Print/Type/Labels?Ref=${encodeURIComponent(reference)}&LabelType=${encodeURIComponent(labelType)}`
        : `/customer/Delivery/DeliveryNotes/Print/Type/Note?Ref=${encodeURIComponent(reference)}`;
      const printable = await printableAmeexResponse(integration, path);
      await logAction(service, workspaceId, action === "print-labels" ? "ameex.labels" : "ameex.print_note", { success: true, httpStatus: printable.response.status, metadata: { ref: reference, label_type: action === "print-labels" ? labelType : null } });
      return new Response(printable.html, { headers: { ...corsHeaders, "Content-Type": printable.contentType || "text/html; charset=utf-8" } });
    }

    if (action === "print-labels-for-orders") {
      const orders = await getAmeexOrders(service, workspaceId, body.order_ids);
      if (!orders.length) return json({ success: false, code: "NO_AMEEX_PARCELS", message: "Select at least one sent Ameex parcel." }, 400);
      
      // Log order details for debugging
      const orderDetails = orders.map((order: any) => ({
        order_id: order.id || order["Order ID"],
        order_number: order.order_number,
        tracking_number: order.tracking_number,
        city: order.city || order.raw_city || order.provider_city_name,
        has_phone: Boolean(order.phone),
        has_address: Boolean(order.address),
        has_customer_name: Boolean(order.customer_name)
      }));
      
      console.log("[Ameex] Print labels for orders", JSON.stringify({ 
        order_count: orders.length, 
        order_details: orderDetails,
        label_type: body.label_type 
      }));
      
      const ref = await createDeliveryNote(service, workspaceId, integration);
      try {
        const codes = orders.map((order: any) => clean(order.tracking_number)).filter(Boolean);
        await addParcelsToDeliveryNote(service, workspaceId, integration, ref, codes);
        await saveDeliveryNote(service, workspaceId, integration, ref);
        await Promise.all(orders.map((order: any) => updateOrder(service, workspaceId, order, { delivery_note_ref: ref, shipping_updated_at: now() })));
        const labelTypes = new Set(["Label_100_100", "Label_A4", "Label_A4_8"]);
        const labelType = labelTypes.has(clean(body.label_type)) ? clean(body.label_type) : "Label_A4";
        const printable = await printableAmeexResponse(integration, `/customer/Delivery/DeliveryNotes/Print/Type/Labels?Ref=${encodeURIComponent(ref)}&LabelType=${encodeURIComponent(labelType)}`);
        
        // Log details about the printable response
        console.log("[Ameex] Printable response received", JSON.stringify({
          content_type: printable.contentType,
          html_length: printable.html.length,
          http_status: printable.response.status,
          ref,
          label_type: labelType,
          parcel_count: codes.length
        }));
        
        await logAction(service, workspaceId, "ameex.labels", { success: true, httpStatus: printable.response.status, metadata: { ref, label_type: labelType, parcel_count: codes.length, html_length: printable.html.length } });
        return new Response(printable.html, { headers: { ...corsHeaders, "Content-Type": printable.response.headers.get("content-type") || "text/html; charset=utf-8", "X-Ameex-Delivery-Note-Ref": ref } });
      } catch (error: any) {
        // Log detailed error information
        console.error("[Ameex] Print labels for orders failed", JSON.stringify({ 
          error: error?.message || String(error),
          ref,
          order_count: orders.length,
          order_details: orderDetails
        }));
        
        // A note that was not successfully printed should not remain as a fake
        // completed label batch. Ameex validates whether deletion is allowed.
        await ameexFetch(integration, `/customer/Delivery/DeliveryNotes/Action/Type/Delete?Ref=${encodeURIComponent(ref)}`, { method: "DELETE" }).catch(() => null);
        throw error;
      }
    }

    if (action === "pickup") {
      const pickupCity = await resolveAmeexCity(service, workspaceId, clean(body.city));
      const address = clean(body.address);
      const phone = clean(body.phone).replace(/\s+/g, "");
      if (!address || !phone) return json({ success: false, code: "INVALID_PICKUP", message: "Pickup address and phone are required." }, 400);
      const result = await ameexFetch(integration, "/customer/Delivery/PickupRequests/Action/Type/Add", {
        method: "POST",
        body: formPayload({ mdl_business: integration.client_api_id, mdl_type: "PARCEL_M", mdl_city: pickupCity.ameex_city_id, p_address: address, p_phone: phone, p_note: clean(body.note) }),
      });
      requireAccepted(result, "Ameex rejected the pickup request");
      await logAction(service, workspaceId, "ameex.pickup", { success: true, duration: result.duration, httpStatus: result.response.status, metadata: { city_id: pickupCity.ameex_city_id } });
      return json({ success: true, data: safeProviderData(result.data) });
    }

    return json({ success: false, code: "INVALID_ACTION", message: "Unsupported Ameex action." }, 400);
  } catch (error: any) {
    console.error("[Ameex] request failed", { message: error?.message || String(error) });
    return json({ success: false, code: "AMEEX_REQUEST_FAILED", message: error?.message || "Ameex request failed." }, 400);
  }
});
