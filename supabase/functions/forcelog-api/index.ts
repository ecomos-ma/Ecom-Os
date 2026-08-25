// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FORCELOG_BASE_URL = "https://api.forcelog.ma";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Integration = { api_key: string; key_last4: string; enabled: boolean };
type Access = { userId: string; workspaceId: string; canManage: boolean };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const clean = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’'`-]/g, " ").replace(/\s+/g, " ");
const numberOrNull = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function normalizeApiKey(value: unknown) {
  const supplied = clean(value).replace(/^x-api-key\s*:\s*/i, "");
  const match = supplied.match(/\b[a-f0-9]{32}\b/i);
  return match?.[0] ?? supplied;
}

function safeProviderResponse(input: any) {
  const source = input?.["ADD-PARCEL"] ?? input?.["GET-PARCEL"] ?? input?.["GET-TRACKING"] ?? input ?? {};
  const parcel = source?.["NEW-PARCEL"] ?? source?.["NEW_PARCEL"] ?? source?.PARCEL ?? source?.parcel ?? source?.data ?? {};
  return {
    result: source?.RESULT ?? source?.result ?? null,
    message: source?.MESSAGE ?? source?.message ?? null,
    tracking_number: parcel?.TRACKING_NUMBER ?? parcel?.["TRACKING-NUMBER"] ?? parcel?.tracking_number ?? source?.TRACKING_NUMBER ?? null,
    status: parcel?.STATUS_CODE ?? parcel?.STATUS ?? parcel?.status ?? source?.STATUS_CODE ?? source?.STATUS ?? source?.status ?? null,
    delivery_fees: parcel?.DELIVERY_FEES ?? parcel?.delivery_fees ?? source?.DELIVERY_FEES ?? null,
  };
}

function getTrackingStatus(input: any) {
  const tracking = input?.["GET-TRACKING"] ?? input ?? {};
  const history = Array.isArray(tracking?.HISTORY) ? tracking.HISTORY : [];
  const lastStep = history[history.length - 1];
  return lastStep?.STATUS_CODE ?? lastStep?.STATUS ?? tracking?.STATUS_CODE ?? tracking?.STATUS ?? null;
}

function providerMessage(input: any, fallback = "ForceLog request failed.") {
  const source = input?.["GET-PARCEL-LABEL"] ?? input?.["GET-PARCEL"] ?? input?.["GET-TRACKING"] ?? input ?? {};
  return clean(source?.MESSAGE ?? source?.message) || fallback;
}

function providerSucceeded(input: any) {
  const source = input?.["GET-PARCEL-LABEL"] ?? input?.["GET-PARCEL"] ?? input?.["GET-TRACKING"] ?? input ?? {};
  return clean(source?.RESULT ?? source?.result).toUpperCase() === "SUCCESS";
}

function isParcelNotFound(message: unknown) {
  return /not\s*found|introuvable|non\s*trouv/i.test(clean(message));
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getForceLogLabelPdf(integration: Integration, trackingNumber: string) {
  let primaryMessage = "ForceLog could not generate the parcel label.";

  // A parcel can be visible in the ForceLog dashboard a moment before the label
  // service sees it. Retry the documented label endpoint before using the older
  // PDF sticker endpoint as a compatibility fallback.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { response, data } = await forceLogFetch(integration, `/customer/Parcels/GetParcelLabel?Code=${encodeURIComponent(trackingNumber)}`);
    const label = data?.["GET-PARCEL-LABEL"] ?? data ?? {};
    const fileBase64 = clean(label.FILE_BASE64);
    if (response.ok && providerSucceeded(data) && fileBase64) {
      try {
        const binary = atob(fileBase64);
        return {
          pdf: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
          fileName: clean(label.FILE_NAME).replace(/[^a-zA-Z0-9._-]/g, "_") || `forcelog-${trackingNumber}.pdf`,
          source: "parcel-label",
        };
      } catch {
        primaryMessage = "ForceLog returned an invalid PDF label.";
      }
    } else {
      primaryMessage = providerMessage(data, `ForceLog could not generate the label (${response.status}).`);
    }

    if (attempt < 2 && isParcelNotFound(primaryMessage)) await wait(750 * (attempt + 1));
    else break;
  }

  const stickerResponse = await fetch(`${FORCELOG_BASE_URL}/customer/PDF/ParcelSticker?parcelCode=${encodeURIComponent(trackingNumber)}`, {
    headers: { "X-API-Key": integration.api_key, Accept: "application/pdf" },
  });
  if (stickerResponse.ok) {
    const pdf = new Uint8Array(await stickerResponse.arrayBuffer());
    if (pdf.length) return { pdf, fileName: `forcelog-${trackingNumber}.pdf`, source: "parcel-sticker" };
  }

  return { pdf: null, fileName: null, source: null, message: primaryMessage };
}

function mapForceLogStatus(raw: unknown): string | null {
  const value = normalize(raw).replace(/\s+/g, "_").toUpperCase();
  const aliases: Record<string, string> = {
    NEW: "NEW_PARCEL", NEW_PARCEL: "NEW_PARCEL", NOUVEAU_COLIS: "NEW_PARCEL",
    WAITING_PICKUP: "WAITING_PICKUP", WAITING_FOR_PICKUP: "WAITING_PICKUP", EN_ATTENTE_DE_RAMASSAGE: "WAITING_PICKUP",
    PICKED_UP: "PICKED_UP", RAMASSE: "PICKED_UP", RAMASSÉ: "PICKED_UP",
    RECEIVED_AT_AGENCY: "RECEIVED_AT_AGENCY", RECU_EN_AGENCE: "RECEIVED_AT_AGENCY",
    IN_DISTRIBUTION: "IN_DISTRIBUTION", MISE_EN_DISTRIBUTION: "IN_DISTRIBUTION",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", EN_COURS_DE_LIVRAISON: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED", LIVRE: "DELIVERED", LIVRÉ: "DELIVERED",
    REFUSED: "REFUSED", REFUSE: "REFUSED", REFUSÉ: "REFUSED",
    RETURNED: "RETURNED_TO_SENDER", RETURNED_TO_SENDER: "RETURNED_TO_SENDER", RETOURNE: "RETURNED_TO_SENDER", RETOURNÉ: "RETURNED_TO_SENDER",
    CANCELLED: "CANCELLED", CANCELED: "CANCELLED",
  };
  return aliases[value] ?? null;
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
  const ownerLike = workspace.created_by === user.id || ["owner", "admin", "supervisor", "founder", "super_admin"].includes(role);
  const sections = Array.isArray(profile?.allowed_sections) ? profile.allowed_sections.map((item: unknown) => clean(item).toLowerCase()) : [];
  const canManage = ownerLike;
  if (needsManage && !canManage) throw new Error("Only workspace administrators can manage ForceLog credentials.");
  if (!needsManage && !ownerLike && sections.length > 0 && !sections.some((section: string) => ["shipping", "delivering", "orders"].includes(section))) {
    throw new Error("You do not have permission to manage shipments.");
  }
  return { userId: user.id, workspaceId, canManage };
}

async function integrationFor(service: any, workspaceId: string): Promise<Integration> {
  const { data, error } = await service.from("workspace_forcelog_integrations")
    .select("api_key, key_last4, enabled").eq("workspace_id", workspaceId).maybeSingle();
  if (error || !data?.enabled || !data.api_key) throw new Error("ForceLog API key is not configured for this workspace.");
  return data as Integration;
}

async function forceLogFetch(integration: Integration, path: string, init: RequestInit = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${FORCELOG_BASE_URL}${path}`, {
    ...init,
    headers: { "X-API-Key": integration.api_key, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 500) }; }
  return { response, data, duration: Date.now() - startedAt };
}

async function logAction(service: any, values: Record<string, unknown>) {
  const { error } = await service.from("shipping_logs").insert(values);
  if (error) console.error("[ForceLog] shipping log insert failed", { message: error.message });
}

function extractForceLogCities(input: any): Array<[string, any]> {
  const queue = [input];
  const visited = new Set<unknown>();
  while (queue.length) {
    let candidate = queue.shift();
    if (typeof candidate === "string") {
      try { candidate = JSON.parse(candidate); } catch { continue; }
    }
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.some((city) => city && typeof city === "object" && (city.CODE || city.code || city.NAME || city.name || city.CITY_NAME || city.city_name))) {
        return candidate.map((city, index) => [String(city?.ID ?? city?.id ?? city?.CITY_ID ?? city?.city_id ?? index), city]);
      }
      queue.push(...candidate);
      continue;
    }
    const entries = Object.entries(candidate) as Array<[string, any]>;
    if (entries.some(([, city]) => city && typeof city === "object" && (city.CODE || city.code || city.NAME || city.name || city.CITY_NAME || city.city_name))) {
      return entries;
    }
    queue.push(...entries.map(([, value]) => value));
  }
  return [];
}

function describeProviderPayload(input: any) {
  if (!input || typeof input !== "object") return "non-JSON response";
  return Object.entries(input).slice(0, 5).map(([key, value]) => {
    const fields = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).slice(0, 5).join(", ") : typeof value;
    return `${key}${fields ? ` (${fields})` : ""}`;
  }).join("; ") || "empty JSON response";
}

async function refreshCities(service: any, integration: Integration, workspaceId: string) {
  const { response, data } = await forceLogFetch(integration, "/customer/Cities");
  if (!response.ok) throw new Error(`ForceLog rejected the city request (${response.status}).`);
  const cityEntries = extractForceLogCities(data);
  const rows = cityEntries.map(([id, city]) => ({
    workspace_id: workspaceId,
    provider_city_id: Number(city?.ID ?? city?.id ?? city?.CITY_ID ?? city?.city_id ?? id),
    code: clean(city?.CODE ?? city?.code ?? city?.CITY_CODE ?? city?.city_code),
    name: clean(city?.NAME ?? city?.name ?? city?.CITY_NAME ?? city?.city_name),
    delivered_price: numberOrNull(city?.D_FEES ?? city?.d_fees ?? city?.DELIVERY_FEES),
    same_city_price: numberOrNull(city?.D_FEES_SAME_CITY ?? city?.d_fees_same_city ?? city?.SAME_CITY_FEES),
    raw_data: { CODE: city?.CODE ?? city?.code ?? null, NAME: city?.NAME ?? city?.name ?? null, D_FEES: city?.D_FEES ?? city?.d_fees ?? null, D_FEES_SAME_CITY: city?.D_FEES_SAME_CITY ?? city?.d_fees_same_city ?? null },
    updated_at: new Date().toISOString(),
  })).filter(row => Number.isFinite(row.provider_city_id) && row.code && row.name);
  if (!rows.length) {
    const summary = describeProviderPayload(data);
    console.warn("[ForceLog] unusable cities payload", { workspaceId, summary, entryCount: cityEntries.length });
    throw new Error(`ForceLog authenticated the request but did not return a city list. Response sections: ${summary}.`);
  }
  const { error } = await service.from("forcelog_cities").upsert(rows, { onConflict: "workspace_id,provider_city_id" });
  if (error) throw new Error("Could not cache ForceLog cities.");
  return rows;
}

async function resolveCity(service: any, integration: Integration, workspaceId: string, cityValue: string) {
  let { data: cities } = await service.from("forcelog_cities").select("provider_city_id, code, name, delivered_price, same_city_price").eq("workspace_id", workspaceId);
  if (!cities?.length) {
    await refreshCities(service, integration, workspaceId);
    const result = await service.from("forcelog_cities").select("provider_city_id, code, name, delivered_price, same_city_price").eq("workspace_id", workspaceId);
    cities = result.data;
  }
  if (!cities?.length) throw new Error("ForceLog city data is unavailable. Test the integration and try again.");
  const input = normalize(cityValue);
  const { data: mapping } = await service.from("city_arabic_names")
    .select("carrier_city_id").eq("carrier", "forcelog").ilike("arabic_name", cityValue.trim()).limit(2);
  if (mapping?.length === 1 && mapping[0].carrier_city_id) {
    const mapped = cities.find((city: any) => Number(city.provider_city_id) === Number(mapping[0].carrier_city_id));
    if (mapped) return mapped;
  }
  const exact = cities.filter((city: any) => normalize(city.name) === input || normalize(city.code) === input);
  if (exact.length === 1) return exact[0];
  const partial = cities.filter((city: any) => normalize(city.name).includes(input) || input.includes(normalize(city.name)));
  if (partial.length === 1) return partial[0];
  throw new Error(`Could not resolve "${cityValue}" to one ForceLog city. Select or correct the city before sending.`);
}

async function getOrder(service: any, workspaceId: string, orderId: string) {
  const { data, error } = await service.from("orders").select("*").eq("Order ID", orderId).eq("workspace_id", workspaceId).maybeSingle();
  if (error || !data) throw new Error("Order was not found in this workspace.");
  return data;
}

function getOrderTrackingNumber(order: any) {
  const raw = order?.shipping_status_raw ?? {};
  return clean(
    order?.tracking_number ||
    order?.shipment_id ||
    raw?.tracking_number ||
    raw?.TRACKING_NUMBER ||
    raw?.["TRACKING-NUMBER"],
  );
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

function validateParcel(input: Record<string, any>) {
  const rules: Array<[string, number, boolean]> = [["ORDER_NUM", 20, true], ["RECEIVER", 50, true], ["PHONE", 14, true], ["CITY", 50, true], ["ADDRESS", 100, true], ["COMMENT", 100, false], ["PRODUCT_NATURE", 100, false]];
  for (const [field, maxLength, required] of rules) {
    const value = clean(input[field]);
    if (required && !value) throw new Error(`${field.replaceAll("_", " ")} is required.`);
    if (value.length > maxLength) throw new Error(`${field.replaceAll("_", " ")} exceeds ForceLog's ${maxLength}-character limit.`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action);
    const workspaceId = clean(body.workspace_id);
    if (!action || !workspaceId) return json({ success: false, code: "INVALID_REQUEST", message: "action and workspace_id are required." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const adminAction = ["set-credentials", "disconnect", "test-connection"].includes(action);
    const access = await authenticate(req, service, workspaceId, adminAction);

    if (action === "status") {
      const { data } = await service.from("workspace_forcelog_integrations").select("enabled, key_last4, last_tested_at, last_test_status").eq("workspace_id", workspaceId).maybeSingle();
      return json({ success: true, connected: Boolean(data?.enabled) && data?.last_test_status !== "invalid_api_key", key_last4: data?.key_last4 ?? null, last_tested_at: data?.last_tested_at ?? null, last_test_status: data?.last_test_status ?? null });
    }
    if (action === "set-credentials") {
      const apiKey = normalizeApiKey(body.api_key);
      if (!/^[a-f0-9]{32}$/i.test(apiKey)) {
        return json({ success: false, code: "INVALID_API_KEY", message: "Enter the 32-character ForceLog API key only. Do not include ‘X-API-Key:’, quotes, or other text." }, 400);
      }
      const { error } = await service.from("workspace_forcelog_integrations").upsert({ workspace_id: workspaceId, api_key: apiKey, key_last4: apiKey.slice(-4), enabled: true, last_test_status: null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
      if (error) throw new Error("Could not save ForceLog credentials.");
      return json({ success: true, connected: true, key_last4: apiKey.slice(-4) });
    }
    if (action === "disconnect") {
      const { error } = await service.from("workspace_forcelog_integrations").delete().eq("workspace_id", workspaceId);
      if (error) throw new Error("Could not disconnect ForceLog.");
      return json({ success: true, connected: false });
    }

    const integration = await integrationFor(service, workspaceId);
    if (action === "test-connection") {
      const { response, data } = await forceLogFetch(integration, "/customer/Cities");
      const success = response.ok && Object.keys(data ?? {}).length > 0;
      const testStatus = success ? "connected" : response.status === 401 ? "invalid_api_key" : `http_${response.status}`;
      await service.from("workspace_forcelog_integrations").update({ last_tested_at: new Date().toISOString(), last_test_status: testStatus, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
      if (success) await refreshCities(service, integration, workspaceId);
      const failureMessage = response.status === 401
        ? "ForceLog rejected this API key. Generate a new API key in ForceLog > Settings > My account, then replace it here."
        : clean(data?.message) || `ForceLog connection failed (${response.status}).`;
      return json(success ? { success: true, message: "Connected successfully." } : { success: false, code: response.status === 401 ? "INVALID_API_KEY" : "CONNECTION_FAILED", message: failureMessage }, success ? 200 : 400);
    }
    if (action === "cities") {
      const cities = await refreshCities(service, integration, workspaceId);
      return json({ success: true, cities: cities.map(({ api_key: _ignored, raw_data, ...city }) => city) });
    }
    if (action === "create-parcel") {
      const orderId = clean(body.order_id);
      if (!orderId) return json({ success: false, code: "INVALID_REQUEST", message: "order_id is required." }, 400);
      const order = await getOrder(service, workspaceId, orderId);
      if (order.shipping_provider === "forcelog" && clean(order.tracking_number)) return json({ success: false, code: "PARCEL_EXISTS", message: "Parcel already exists for this order.", tracking_number: order.tracking_number }, 409);
      const receiver = await resolveReceiver(service, order);
      const phone = clean(order.phone).replace(/\s+/g, "");
      const requestedCity = clean(order.city || order.city_name || order.raw_city);
      const basePayload = {
        ORDER_NUM: clean(order.order_number), RECEIVER: receiver, PHONE: phone, CITY: requestedCity, ADDRESS: clean(order.address),
        COMMENT: clean(order.notes).slice(0, 100), PRODUCT_NATURE: clean(order.product_name || order.product || order.product_variant || order.sku || "Commande").slice(0, 100),
        COD: Number(order.cod_amount ?? order.total_price ?? order.total ?? 0),
      };
      validateParcel(basePayload);
      const city = await resolveCity(service, integration, workspaceId, requestedCity);
      const payload = { ...basePayload, CITY: clean(city.code) };
      console.log("[ForceLog] Creating parcel with payload:", JSON.stringify(payload, null, 2));
      const { response, data, duration } = await forceLogFetch(integration, "/customer/Parcels/AddParcel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      console.log("[ForceLog] Raw API response:", JSON.stringify(data, null, 2));
      const provider = safeProviderResponse(data);
      console.log("[ForceLog] Extracted provider response:", JSON.stringify(provider, null, 2));
      const trackingNumber = clean(provider.tracking_number);
      console.log("[ForceLog] Extracted tracking_number:", trackingNumber);
      const success = response.ok && clean(provider.result).toUpperCase() === "SUCCESS" && trackingNumber;
      await logAction(service, { workspace_id: workspaceId, provider: "forcelog", order_id: orderId, order_number: order.order_number, action: "create-parcel", request_payload: { order_id: orderId, order_number: order.order_number, city_code: city.code }, response_payload: provider, http_status: response.status, error: success ? null : clean(provider.message) || `HTTP ${response.status}` });
      if (!success) return json({ success: false, provider: "forcelog", code: "PARCEL_REJECTED", message: clean(provider.message) || "ForceLog did not return a tracking number." }, 400);
      const { data: saved, error } = await service.from("orders").update({ tracking_number: trackingNumber, shipment_id: trackingNumber, shipment_status: clean(provider.status) || "NEW_PARCEL", shipping_provider: "forcelog", shipping_company: "forcelog", shipping_status: mapForceLogStatus(provider.status) || "NEW_PARCEL", parcel_created_at: new Date().toISOString(), shipping_status_raw: provider, shipping_updated_at: new Date().toISOString(), last_tracking_sync: new Date().toISOString(), shipping_cost: numberOrNull(provider.delivery_fees) ?? city.delivered_price ?? order.shipping_cost }).eq("Order ID", orderId).eq("workspace_id", workspaceId).select('"Order ID", tracking_number, shipping_status, shipping_provider').maybeSingle();
      if (error || !saved) throw new Error(`ForceLog created parcel ${trackingNumber}, but Ecom OS could not save it. Do not resend; contact support with this tracking number.`);
      console.log("[ForceLog] parcel created and saved", { workspaceId, orderId, orderNumber: order.order_number, trackingNumber, duration, saved });
      return json({ success: true, provider: "forcelog", tracking_number: trackingNumber, order: saved });
    }
    if (action === "tracking" || action === "get-parcel") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const trackingNumber = getOrderTrackingNumber(order);
      console.log("[ForceLog] Tracking lookup for order", order["Order ID"], "tracking_number:", trackingNumber, "provider:", order.shipping_provider);
      if (!trackingNumber || order.shipping_provider !== "forcelog") return json({ success: false, code: "NO_FORCELOG_PARCEL", message: "This order has no ForceLog parcel." }, 400);
      const endpoint = action === "tracking" ? `/customer/Parcels/GetTracking?Code=${encodeURIComponent(trackingNumber)}` : `/customer/Parcels/GetParcel?Code=${encodeURIComponent(trackingNumber)}`;
      console.log("[ForceLog] Calling endpoint:", endpoint);
      const { response, data } = await forceLogFetch(integration, endpoint);
      console.log("[ForceLog] API response status:", response.status, "provider succeeded:", providerSucceeded(data));
      if (!response.ok || !providerSucceeded(data)) return json({ success: false, code: "PROVIDER_ERROR", message: providerMessage(data, `ForceLog request failed (${response.status}).`) }, 400);
      const provider = safeProviderResponse(data);
      const rawStatus = action === "tracking" ? getTrackingStatus(data) ?? provider.status : provider.status;
      const mappedStatus = mapForceLogStatus(rawStatus);
      if (action === "tracking" && mappedStatus) {
        const { error } = await service.from("orders").update({ shipping_status: mappedStatus, shipment_status: clean(rawStatus) || order.shipment_status, shipping_status_raw: provider, shipping_updated_at: new Date().toISOString(), last_tracking_sync: new Date().toISOString(), shipping_cost: numberOrNull(provider.delivery_fees) ?? order.shipping_cost }).eq("Order ID", order["Order ID"]).eq("workspace_id", workspaceId);
        if (error) throw new Error("Could not save the ForceLog tracking update.");
      }
      return json({ success: true, provider: "forcelog", tracking_number: trackingNumber, shipping_status: mappedStatus ?? order.shipping_status, data: provider });
    }
    if (action === "label" || action === "sticker") {
      const order = await getOrder(service, workspaceId, clean(body.order_id));
      const trackingNumber = getOrderTrackingNumber(order);
      if (!trackingNumber || order.shipping_provider !== "forcelog") return json({ success: false, code: "NO_FORCELOG_PARCEL", message: "This order has no ForceLog parcel." }, 400);
      if (action === "label") {
        const result = await getForceLogLabelPdf(integration, trackingNumber);
        if (!result.pdf || !result.fileName) {
          await logAction(service, { workspace_id: workspaceId, provider: "forcelog", order_id: order["Order ID"], order_number: order.order_number, action: "label", request_payload: { tracking_number: trackingNumber }, error: result.message || "ForceLog could not generate the label." });
          return json({ success: false, code: "LABEL_FAILED", message: result.message || "ForceLog could not generate the label." }, 400);
        }
        await logAction(service, { workspace_id: workspaceId, provider: "forcelog", order_id: order["Order ID"], order_number: order.order_number, action: "label", request_payload: { tracking_number: trackingNumber }, response_payload: { source: result.source } });
        return new Response(result.pdf, { headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.fileName}"` } });
      }
      const response = await fetch(`${FORCELOG_BASE_URL}/customer/PDF/ParcelSticker?parcelCode=${encodeURIComponent(trackingNumber)}`, { headers: { "X-API-Key": integration.api_key } });
      if (!response.ok) return json({ success: false, code: "LABEL_FAILED", message: `ForceLog could not generate the sticker (${response.status}).` }, 400);
      return new Response(await response.arrayBuffer(), { headers: { ...corsHeaders, "Content-Type": response.headers.get("content-type") || "application/pdf", "Content-Disposition": `inline; filename="forcelog-${trackingNumber}.pdf"` } });
    }
    return json({ success: false, code: "INVALID_ACTION", message: "Unsupported ForceLog action." }, 400);
  } catch (error: any) {
    console.error("[ForceLog] request failed", { message: error?.message });
    return json({ success: false, provider: "forcelog", code: "FORCELOG_ERROR", message: clean(error?.message) || "ForceLog request failed." }, 400);
  }
});
