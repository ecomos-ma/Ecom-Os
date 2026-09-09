// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { HttpError } from "./security.ts";

export const YOUCAN_API_BASE = "https://api.youcan.shop";
export const YOUCAN_REQUIRED_SCOPES = [
  "read-orders",
  "edit-orders",
  "view-store-info",
  "read-products",
  "read-customers",
  "read-checkout-fields",
  "read-rest-hooks",
  "edit-rest-hooks",
  "delete-rest-hooks",
] as const;
export const YOUCAN_WEBHOOK_EVENTS = [
  "order.created",
  "order.updated",
  "order.paid",
  "app.uninstalled",
] as const;

export function requiredYouCanEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(`Missing environment variable: ${name}`, 503);
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encryptionKeyBytes(): Uint8Array {
  const configured = requiredYouCanEnv("YOUCAN_TOKEN_ENCRYPTION_KEY");
  if (/^[0-9a-f]{64}$/i.test(configured)) {
    return Uint8Array.from(configured.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  }
  const decoded = base64ToBytes(configured);
  if (decoded.length !== 32) throw new HttpError("YouCan credential encryption is misconfigured", 503);
  return decoded;
}

async function encryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(encryptionKeyBytes()).buffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptYouCanSecret(secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(secret),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptYouCanSecret(envelope: string): Promise<string> {
  const [version, ivValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new HttpError("Stored YouCan credential is invalid", 503);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(base64ToBytes(ivValue)).buffer },
      await encryptionKey(),
      Uint8Array.from(base64ToBytes(ciphertextValue)).buffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError("Stored YouCan credential cannot be decrypted", 503);
  }
}

type CredentialRow = {
  id: string;
  workspace_id: string;
  status: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
};

export async function persistEncryptedTokens(
  client: SupabaseClient,
  integrationId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null,
): Promise<void> {
  const { error } = await client.from("integrations").update({
    access_token_encrypted: await encryptYouCanSecret(accessToken),
    refresh_token_encrypted: refreshToken ? await encryptYouCanSecret(refreshToken) : null,
    access_token: null,
    refresh_token: null,
    expires_at: expiresAt,
    token_encryption_version: 1,
    updated_at: new Date().toISOString(),
  }).eq("id", integrationId);
  if (error) throw new HttpError("YouCan credentials could not be stored securely", 503);
}

async function refreshAccessToken(client: SupabaseClient, row: CredentialRow, refreshToken: string): Promise<string> {
  const response = await fetch(`${YOUCAN_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: requiredYouCanEnv("YOUCAN_CLIENT_ID"),
      client_secret: requiredYouCanEnv("YOUCAN_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await client.from("integrations").update({ status: "auth_expired", needs_reconnect: true }).eq("id", row.id);
    throw new HttpError("YouCan authorization expired. Reconnect the store.", 409);
  }
  const body = await response.json().catch(() => ({}));
  if (!body?.access_token) throw new HttpError("YouCan returned an invalid token response", 502);
  const expiresAt = body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null;
  await persistEncryptedTokens(client, row.id, String(body.access_token), body.refresh_token ? String(body.refresh_token) : refreshToken, expiresAt);
  return String(body.access_token);
}

export async function integrationAccessToken(client: SupabaseClient, integrationId: string): Promise<{ token: string; integration: CredentialRow }> {
  const { data, error } = await client.from("integrations")
    .select("id, workspace_id, status, access_token, refresh_token, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("id", integrationId).eq("provider", "youcan").maybeSingle();
  const row = data as CredentialRow | null;
  if (error || !row || row.status !== "active") throw new HttpError("YouCan is disconnected", 409);
  let accessToken = row.access_token_encrypted
    ? await decryptYouCanSecret(row.access_token_encrypted)
    : row.access_token;
  let refreshToken = row.refresh_token_encrypted
    ? await decryptYouCanSecret(row.refresh_token_encrypted)
    : row.refresh_token;
  if (!accessToken) throw new HttpError("YouCan authorization is unavailable. Reconnect the store.", 409);

  // Transparently migrate legacy plaintext credentials before using them.
  if (!row.access_token_encrypted) {
    await persistEncryptedTokens(client, row.id, accessToken, refreshToken, row.expires_at);
  }
  if (row.expires_at && new Date(row.expires_at).getTime() - Date.now() < 5 * 60_000) {
    if (!refreshToken) throw new HttpError("YouCan authorization expired. Reconnect the store.", 409);
    accessToken = await refreshAccessToken(client, row, refreshToken);
  }
  return { token: accessToken, integration: row };
}

function retryDelay(attempt: number): number {
  return Math.min(4_000, 250 * (2 ** attempt)) + Math.floor(Math.random() * 150);
}

export async function youcanRequest(
  accessToken: string,
  path: string,
  init: RequestInit = {},
  retry = 3,
): Promise<any> {
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${YOUCAN_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (attempt < retry) { await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt))); continue; }
      throw new HttpError("YouCan is temporarily unavailable", 502);
    }
    if (response.ok) return response.status === 204 ? null : await response.json().catch(() => ({}));
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < retry) { await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt))); continue; }
    if (response.status === 401) throw new HttpError("YouCan authorization expired. Reconnect the store.", 409);
    if (response.status === 403) throw new HttpError("YouCan permission is missing. Reconnect the store.", 409);
    throw new HttpError(`YouCan request failed (${response.status})`, 502);
  }
  throw new HttpError("YouCan is temporarily unavailable", 502);
}

export async function paginateYouCan(accessToken: string, path: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const body = await youcanRequest(accessToken, `${path}${separator}page=${page}&limit=50`);
    all.push(...(Array.isArray(body?.data) ? body.data : []));
    totalPages = Number(body?.meta?.pagination?.total_pages ?? body?.meta?.last_page ?? 1);
    page += 1;
  } while (page <= totalPages && page <= 200);
  return all;
}

export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) return `212${digits.slice(1)}`;
  return digits;
}

export function canonicalYouCanStatus(order: any): string {
  const raw = String(order?.status_object?.slug ?? order?.status ?? order?.status_slug ?? "open").toLowerCase();
  if (["canceled-by-seller", "cancelled", "canceled"].includes(raw)) return "cancelled";
  if (["closed", "fulfilled", "completed", "delivered"].includes(raw)) return "delivered";
  if (["processed", "processing", "confirmed", "paid", "captured"].includes(raw)) return "confirmed";
  if (["refunded", "returned"].includes(raw)) return "returned";
  return "pending";
}

export function youCanGeneralStatus(statusValue: unknown): string | null {
  const statuses: Record<string, string> = {
    pending: "open",
    confirmed: "processed",
    delivered: "closed",
    cancelled: "canceled-by-seller",
  };
  return statuses[String(statusValue ?? "").toLowerCase()] ?? null;
}

export function youCanShippingStatus(statusValue: unknown): string | null {
  const statuses: Record<string, string> = {
    pending: "unfulfilled",
    unfulfilled: "unfulfilled",
    confirmed: "processing",
    processing: "processing",
    out_for_delivery: "shipped",
    shipped: "shipped",
    delivered: "fulfilled",
    fulfilled: "fulfilled",
    cancelled: "canceled",
    canceled: "canceled",
  };
  return statuses[String(statusValue ?? "").toLowerCase()] ?? null;
}

function tracked(order: any, field: string): unknown {
  const sources = [order, order?.attribution, order?.tracking, order?.metadata, order?.extra_fields, order?.custom_fields];
  for (const source of sources) {
    if (source && typeof source === "object" && !Array.isArray(source) && source[field] != null) return source[field];
  }
  const landing = order?.landing_page ?? order?.landing_page_url ?? order?.attribution?.landing_page;
  try { if (landing) return new URL(String(landing)).searchParams.get(field); } catch { /* ignore malformed provider URLs */ }
  return null;
}

export function mapYouCanOrder(order: any, workspaceId: string, integrationId: string): { order: Record<string, unknown>; items: Record<string, unknown>[]; customer: Record<string, unknown> | null } {
  const detected: Record<string, unknown> = {};
  for (const group of [order?.extra_fields, order?.custom_fields]) {
    if (!Array.isArray(group)) continue;
    for (const field of group) {
      const inferred = inferCheckoutField(field?.label ?? field?.name ?? field?.title);
      if (inferred) detected[inferred.canonical] = field?.value ?? field?.content ?? null;
    }
  }
  const attribute = (name: string) => tracked(order, name) ?? detected[name] ?? null;
  const customer = order?.customer ?? {};
  const address = Array.isArray(customer?.address) ? customer.address[0] ?? {} : (customer?.address ?? {});
  const variants = Array.isArray(order?.variants) ? order.variants : [];
  const first = variants[0] ?? {};
  const variant = first?.variant ?? first;
  const customerName = String(customer?.full_name ?? [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ?? "").trim() || null;
  const phone = normalizePhone(customer?.phone ?? detected.phone);
  const landingPage = order?.landing_page ?? order?.landing_page_url ?? order?.attribution?.landing_page ?? null;
  const status = canonicalYouCanStatus(order);
  const externalId = String(order?.id ?? "").trim();
  const createdAt = order?.created_at ?? new Date().toISOString();
  const orderRow: Record<string, unknown> = {
    workspace_id: workspaceId,
    source_integration_id: integrationId,
    external_order_id: externalId,
    youcan_order_id: externalId,
    youcan_ref: order?.reference ? String(order.reference) : null,
    order_number: `#YC-${order?.reference ?? externalId}`,
    source: "youcan",
    customer_name: customerName ?? detected.customer_name ?? null,
    first_name: customer?.first_name ?? detected.first_name ?? null,
    last_name: customer?.last_name ?? detected.last_name ?? null,
    email: customer?.email ?? detected.email ?? null,
    customer_email: customer?.email ?? detected.email ?? null,
    phone,
    address: [address?.first_line, address?.second_line].filter(Boolean).join(", ") || detected.address || null,
    city: customer?.city ?? address?.city ?? detected.city ?? null,
    raw_city: customer?.city ?? address?.city ?? detected.city ?? null,
    province: address?.state ?? address?.province ?? detected.region ?? null,
    region: address?.region ?? detected.region ?? null,
    zip_code: address?.zip_code ?? address?.postal_code ?? detected.zip_code ?? null,
    country: address?.country ?? detected.country ?? null,
    total: Number(order?.total_price ?? order?.total ?? 0),
    total_price: Number(order?.total_price ?? order?.total ?? 0),
    currency: order?.currency ?? order?.currency_code ?? null,
    status,
    sku: variant?.sku ?? null,
    product_name: variant?.product?.name ?? variant?.name ?? null,
    product_variant: Array.isArray(variant?.values) ? variant.values.join(", ") : (variant?.name ?? null),
    quantity: variants.reduce((sum: number, item: any) => sum + Number(item?.quantity ?? 0), 0) || 1,
    unit_price: Number(first?.price ?? variant?.price ?? 0),
    discount: Number(order?.discount_total ?? order?.discount ?? 0),
    shipping_cost: Number(order?.shipping?.cost ?? order?.shipping_price ?? 0),
    payment_method: order?.payment?.method ?? order?.payment_method ?? null,
    notes: order?.notes ?? order?.note ?? null,
    order_date: createdAt,
    created_at: createdAt,
    provider_payload_updated_at: order?.updated_at ?? createdAt,
    youcan_status_raw: String(order?.status_object?.slug ?? order?.status ?? ""),
    youcan_shipping_status_raw: String(order?.shipping?.status ?? order?.shipping_status ?? ""),
    youcan_payment_status_raw: String(order?.payment?.status ?? order?.payment_status ?? ""),
    youcan_sync_origin: "provider",
    source_platform: attribute("source_platform") ?? attribute("utm_source"),
    utm_source: attribute("utm_source"), utm_medium: attribute("utm_medium"),
    utm_campaign: attribute("utm_campaign"), utm_content: attribute("utm_content"),
    utm_term: attribute("utm_term"), landing_page: landingPage,
    referrer: order?.referrer ?? order?.attribution?.referrer ?? null,
    customer_ip: attribute("customer_ip") ?? attribute("ip_address"),
    fbclid: attribute("fbclid"), gclid: attribute("gclid"), ttclid: attribute("ttclid"),
    meta_campaign_id: tracked(order, "meta_campaign_id") ?? tracked(order, "campaign_id"),
    meta_adset_id: tracked(order, "meta_adset_id") ?? tracked(order, "adset_id"),
    meta_ad_id: tracked(order, "meta_ad_id") ?? tracked(order, "ad_id"),
    tiktok_campaign_id: tracked(order, "tiktok_campaign_id"),
    tiktok_adgroup_id: tracked(order, "tiktok_adgroup_id"), tiktok_ad_id: tracked(order, "tiktok_ad_id"),
    attribution_data: { imported_from: "youcan", provider_fields_present: Boolean(tracked(order, "utm_source") || tracked(order, "fbclid") || tracked(order, "gclid") || tracked(order, "ttclid")) },
  };
  const itemRows = variants.map((entry: any, index: number) => {
    const value = entry?.variant ?? entry;
    return {
      workspace_id: workspaceId, integration_id: integrationId,
      external_line_id: String(entry?.id ?? value?.id ?? index),
      external_product_id: value?.product?.id ? String(value.product.id) : null,
      external_variant_id: value?.id ? String(value.id) : null,
      sku: value?.sku ?? null, product_name: value?.product?.name ?? value?.name ?? null,
      variant_name: Array.isArray(value?.values) ? value.values.join(", ") : value?.name ?? null,
      quantity: Math.max(1, Number(entry?.quantity ?? 1)), unit_price: Number(entry?.price ?? value?.price ?? 0),
      image_url: value?.image?.url ?? value?.product?.thumbnail ?? value?.product?.images?.[0]?.url ?? null,
    };
  });
  const customerRow = customerName || phone || customer?.email ? {
    workspace_id: workspaceId, source_integration_id: integrationId,
    external_customer_id: customer?.id ? String(customer.id) : null,
    youcan_customer_id: customer?.id ? String(customer.id) : null,
    name: customerName ?? phone ?? customer?.email, first_name: customer?.first_name ?? null,
    last_name: customer?.last_name ?? null, email: customer?.email ?? null, phone,
    normalized_phone: phone, city: customer?.city ?? address?.city ?? null,
    address: [address?.first_line, address?.second_line].filter(Boolean).join(", ") || null,
    region: address?.state ?? address?.region ?? null, country: address?.country ?? null,
    postal_code: address?.zip_code ?? address?.postal_code ?? null, provider_updated_at: order?.updated_at ?? createdAt,
  } : null;
  return { order: orderRow, items: itemRows, customer: customerRow };
}

export function inferCheckoutField(labelValue: unknown): { canonical: string; language: string | null; confidence: number } | null {
  const label = String(labelValue ?? "").trim().toLocaleLowerCase();
  const normalized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const rules: Array<[RegExp, string, string | null]> = [
    [/^(full name|name|nom complet|nom|الاسم الكامل|الاسم)$/, "customer_name", null],
    [/^(first name|prenom|prénom|الاسم الأول)$/, "first_name", null],
    [/^(last name|nom de famille|النسب|اسم العائلة)$/, "last_name", null],
    [/^(phone|telephone|téléphone|tel|mobile|الهاتف|رقم الهاتف)$/, "phone", null],
    [/^(email|e mail|courriel|البريد الإلكتروني)$/, "email", null],
    [/^(address|adresse|العنوان)$/, "address", null],
    [/^(city|ville|المدينة)$/, "city", null],
    [/^(region|province|state|جهة|المنطقة)$/, "region", null],
    [/^(zip|postal code|code postal|الرمز البريدي)$/, "zip_code", null],
    [/^(country|pays|البلد)$/, "country", null],
    [/^(customer ip|ip address|ip|عنوان ip)$/, "customer_ip", null],
    [/^(utm source)$/, "utm_source", null], [/^(utm medium)$/, "utm_medium", null],
    [/^(utm campaign)$/, "utm_campaign", null], [/^(utm content)$/, "utm_content", null],
    [/^(utm term)$/, "utm_term", null], [/^(fbclid)$/, "fbclid", null],
    [/^(gclid)$/, "gclid", null], [/^(ttclid)$/, "ttclid", null],
  ];
  for (const [pattern, canonical, language] of rules) if (pattern.test(normalized)) return { canonical, language, confidence: 1 };
  return null;
}

export async function ensureYouCanWebhooks(client: SupabaseClient, integrationId: string, workspaceId: string, accessToken: string): Promise<{ healthy: boolean; active: number }> {
  const targetUrl = `${requiredYouCanEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/youcan-webhook`;
  const listed = await youcanRequest(accessToken, "/resthooks/list").catch(() => ({ data: [] }));
  const existingHooks = Array.isArray(listed?.data) ? listed.data : Array.isArray(listed) ? listed : [];
  let active = 0;
  let lastError: string | null = null;
  for (const event of YOUCAN_WEBHOOK_EVENTS) {
    try {
      const matching = existingHooks.find((hook: any) => String(hook?.event ?? hook?.event_name ?? hook?.type ?? "") === event && String(hook?.target_url ?? hook?.address ?? hook?.url ?? "") === targetUrl && !["deactivated", "inactive"].includes(String(hook?.status ?? "").toLowerCase()));
      for (const obsolete of existingHooks.filter((hook: any) => {
        const hookEvent = String(hook?.event ?? hook?.event_name ?? hook?.type ?? "");
        const hookUrl = String(hook?.target_url ?? hook?.address ?? hook?.url ?? "");
        return hookEvent === event && hookUrl !== targetUrl && hookUrl.includes("wxfialbmyfkafobtkrde.supabase.co/functions/v1/youcan-webhook");
      })) {
        const obsoleteId = String(obsolete?.id ?? obsolete?.hook_id ?? "").trim();
        if (obsoleteId) await youcanRequest(accessToken, `/resthooks/unsubscribe/${encodeURIComponent(obsoleteId)}`, { method: "POST" }, 1).catch(() => null);
      }
      const body = matching ?? await youcanRequest(accessToken, "/resthooks/subscribe", { method: "POST", body: JSON.stringify({ target_url: targetUrl, event }) });
      const providerId = String(body?.id ?? body?.hook_id ?? body?.webhook_id ?? body?.data?.id ?? "").trim();
      if (!providerId) throw new HttpError("YouCan returned an invalid webhook response", 502);
      await client.from("youcan_webhook_subscriptions").upsert({
        workspace_id: workspaceId, integration_id: integrationId, event_type: event,
        provider_subscription_id: providerId, status: "active", last_verified_at: new Date().toISOString(), last_error: null,
      }, { onConflict: "workspace_id,integration_id,event_type" });
      active += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Webhook subscription failed";
      await client.from("youcan_webhook_subscriptions").upsert({
        workspace_id: workspaceId, integration_id: integrationId, event_type: event,
        status: "failed", last_verified_at: new Date().toISOString(), last_error: lastError,
      }, { onConflict: "workspace_id,integration_id,event_type" });
    }
  }
  const healthy = active === YOUCAN_WEBHOOK_EVENTS.length;
  await client.from("integrations").update({
    webhook_health: healthy ? "healthy" : "degraded",
    webhook_last_checked_at: new Date().toISOString(), webhook_last_error: healthy ? null : lastError,
  }).eq("id", integrationId);
  return { healthy, active };
}
