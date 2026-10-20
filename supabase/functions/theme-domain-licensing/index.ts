import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  generateThemeLicenseCode,
  hashThemeLicenseCode,
  normalizeThemeDomain,
  normalizeThemeLicenseCode,
  validThemeLicenseCode,
} from "../_shared/theme-license.ts";

class HttpError extends Error { constructor(message: string, public readonly status: number) { super(message); } }

type LicenseStatus = "active" | "disabled" | "archived" | "revoked";
type DomainStatus = "active" | "disabled" | "removed";
type LicenseDomain = {
  id: string; hostname: string; status: DomainStatus; created_at: string; updated_at: string;
  last_check_at: string | null; disabled_at: string | null; removed_at: string | null;
};
type LicenseEvent = {
  id: number; event_type: string; hostname: string | null; metadata: Record<string, unknown>;
  created_at: string; actor_id: string | null;
};
type ClientLicenseRow = {
  id: string; client_name: string; phone: string; email: string | null; theme_name: string;
  license_key_hash: string | null; license_key_encrypted: string | null; license_display: string;
  price: number | string; currency: string; status: LicenseStatus; notes: string | null;
  order_reference: string | null; payment_notes: string | null; created_at: string; updated_at: string;
  disabled_at: string | null; archived_at: string | null; revoked_at: string | null; last_check_at: string | null;
  has_custom_unauthorized_message: boolean;
  unauthorized_title: string | null; unauthorized_message: string | null;
  unauthorized_primary_button_text: string | null; unauthorized_primary_button_url: string | null;
  unauthorized_secondary_button_text: string | null; unauthorized_secondary_button_url: string | null;
  license_domains?: LicenseDomain[]; license_events?: LicenseEvent[];
};
type UnauthorizedMessage = {
  title: string; message: string; primary_button_text: string; primary_button_url: string;
  secondary_button_text: string | null; secondary_button_url: string | null;
};

const LICENSE_FIELDS = "id, client_name, phone, email, theme_name, license_key_hash, license_key_encrypted, license_display, price, currency, status, notes, order_reference, payment_notes, created_at, updated_at, disabled_at, archived_at, revoked_at, last_check_at, has_custom_unauthorized_message, unauthorized_title, unauthorized_message, unauthorized_primary_button_text, unauthorized_primary_button_url, unauthorized_secondary_button_text, unauthorized_secondary_button_url";
const DOMAIN_FIELDS = "id, hostname, status, created_at, updated_at, last_check_at, disabled_at, removed_at";
const EVENT_FIELDS = "id, event_type, hostname, metadata, created_at, actor_id";
const FALLBACK_UNAUTHORIZED_MESSAGE: UnauthorizedMessage = {
  title: "Want This Theme?",
  message: "This theme is not activated for this domain. To purchase or activate it, contact Ecom OS.",
  primary_button_text: "Purchase Theme",
  primary_button_url: "https://ecomos.ma",
  secondary_button_text: null,
  secondary_button_url: null,
};

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) throw new HttpError("Service configuration is incomplete", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req: Request, client: SupabaseClient) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError("Authentication required", 401);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError("Authentication required", 401);
  return data.user;
}

async function adminClientFor(req: Request): Promise<{ admin: SupabaseClient; userId: string }> {
  const admin = serviceClient();
  const user = await authenticate(req, admin);
  const authHeader = req.headers.get("authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!anonKey) throw new HttpError("Service configuration is incomplete", 503);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.rpc("platform_get_my_authorization_v1");
  if (error || !data?.is_platform_admin || !Array.isArray(data.permissions) || !data.permissions.includes("settings.manage")) {
    throw new HttpError("Platform administrator permission required", 403);
  }
  return { admin, userId: user.id };
}

function configuredOrigins() {
  return (Deno.env.get("APP_URLS") || Deno.env.get("APP_URL") || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")?.trim() || "";
  const configured = new Set(["https://www.ecomos.ma", "https://ecomos.ma", "https://ecomscale.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080", ...configuredOrigins()]);
  let allowed = configured.has(origin);
  if (!allowed && origin) {
    try { allowed = new URL(origin).protocol === "https:"; } catch { allowed = false; }
  }
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Invalid request", 400);
  return value as Record<string, unknown>;
}

async function readJson(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 128_000) throw new HttpError("Request is too large", 413);
  try { return bodyObject(await req.json()); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError("Invalid JSON", 400); }
}

function requireUuid(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) throw new HttpError(`${field} is invalid`, 400);
  return normalized;
}

function requiredText(value: unknown, field: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new HttpError(`${field} is required and must be ${max} characters or fewer`, 400);
  return result;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return "";
  const result = String(value).trim();
  if (result.length > max) throw new HttpError(`${field} must be ${max} characters or fewer`, 400);
  return result;
}

function plainMessageText(value: unknown, field: string, max: number, required: boolean) {
  const result = value === undefined || value === null ? "" : String(value).trim();
  if (!result && !required) return "";
  if (!result || result.length > max || /[<>\u0000-\u001f\u007f]/.test(result)) {
    throw new HttpError(`${field} must be plain text and ${max} characters or fewer`, 400);
  }
  return result;
}

function safeHttpsUrl(value: unknown, field: string, required: boolean) {
  const result = value === undefined || value === null ? "" : String(value).trim();
  if (!result && !required) return "";
  if (!result || result.length > 2048) throw new HttpError(`${field} must be a secure HTTPS URL`, 400);
  let url: URL;
  try { url = new URL(result); } catch { throw new HttpError(`${field} must be a secure HTTPS URL`, 400); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new HttpError(`${field} must be a secure HTTPS URL`, 400);
  return url.toString();
}

function normalizeUnauthorizedMessage(value: unknown, allowDisabled = false) {
  const body = bodyObject(value);
  const enabled = allowDisabled ? Boolean(body.has_custom_unauthorized_message) : true;
  if (!enabled) return { enabled: false, title: "", message: "", primaryText: "", primaryUrl: "", secondaryText: "", secondaryUrl: "" };
  const title = plainMessageText(body.title, "Title", 120, true);
  const message = plainMessageText(body.message, "Message", 1200, true);
  const primaryText = plainMessageText(body.primary_button_text, "Primary button text", 80, true);
  const primaryUrl = safeHttpsUrl(body.primary_button_url, "Primary button URL", true);
  const secondaryText = plainMessageText(body.secondary_button_text, "Second button text", 80, false);
  const secondaryUrl = safeHttpsUrl(body.secondary_button_url, "Second button URL", false);
  if (Boolean(secondaryText) !== Boolean(secondaryUrl)) throw new HttpError("Second button text and URL must be provided together", 400);
  return { enabled, title, message, primaryText, primaryUrl, secondaryText, secondaryUrl };
}

function responseMessage(value: Partial<UnauthorizedMessage> | null | undefined): UnauthorizedMessage | null {
  if (!value) return null;
  try {
    const title = plainMessageText(value.title, "Title", 120, true);
    const message = plainMessageText(value.message, "Message", 1200, true);
    const primaryText = plainMessageText(value.primary_button_text, "Primary button text", 80, true);
    const primaryUrl = safeHttpsUrl(value.primary_button_url, "Primary button URL", true);
    const secondaryText = plainMessageText(value.secondary_button_text, "Second button text", 80, false);
    const secondaryUrl = safeHttpsUrl(value.secondary_button_url, "Second button URL", false);
    if (Boolean(secondaryText) !== Boolean(secondaryUrl)) return null;
    return { title, message, primary_button_text: primaryText, primary_button_url: primaryUrl, secondary_button_text: secondaryText || null, secondary_button_url: secondaryUrl || null };
  } catch { return null; }
}

function normalizeClientInput(body: Record<string, unknown>) {
  const clientName = requiredText(body.client_name, "Client name", 160);
  const phone = requiredText(body.phone, "Phone number", 60);
  const email = optionalText(body.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Enter a valid email address", 400);
  const themeName = requiredText(body.theme_name, "Theme name", 160);
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 9_999_999_999.99) throw new HttpError("Enter a valid sale price", 400);
  const currency = requiredText(body.currency, "Currency", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError("Currency must be a 3-letter code", 400);
  return {
    clientName, phone, email, themeName, price, currency,
    notes: optionalText(body.notes, "Notes", 5000),
    orderReference: optionalText(body.order_reference, "Order/reference number", 160),
    paymentNotes: optionalText(body.payment_notes, "Payment notes", 5000),
  };
}

function normalizeDomains(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]+/) : [];
  let domains: string[];
  try { domains = raw.map((item) => normalizeThemeDomain(typeof item === "string" ? item : "")); }
  catch { throw new HttpError("Enter valid domains without wildcards", 400); }
  if (!domains.length) throw new HttpError("Add at least one allowed domain", 400);
  if (new Set(domains).size !== domains.length) throw new HttpError("Remove duplicate domains", 400);
  return domains;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encryptionKeyBytes() {
  const secret = Deno.env.get("LICENSE_ENCRYPTION_KEY")?.trim() || "";
  let bytes: Uint8Array;
  try {
    bytes = /^[a-f0-9]{64}$/i.test(secret)
      ? Uint8Array.from(secret.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16))
      : base64UrlToBytes(secret);
  } catch { throw new HttpError("License encryption is not configured", 503); }
  if (bytes.length !== 32) throw new HttpError("License encryption is not configured", 503);
  return bytes;
}

async function encryptLicense(code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", encryptionKeyBytes(), "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(code));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptLicense(payload: string) {
  const [version, iv, encrypted] = payload.split(".");
  if (version !== "v1" || !iv || !encrypted) throw new HttpError("Stored license cannot be decrypted", 500);
  try {
    const key = await crypto.subtle.importKey("raw", encryptionKeyBytes(), "AES-GCM", false, ["decrypt"]);
    const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, key, base64UrlToBytes(encrypted));
    return new TextDecoder().decode(result);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Stored license cannot be decrypted", 500);
  }
}

function licenseDisplay(code: string) {
  if (code.startsWith("ECO-LIC-")) return `ECO-LIC-••••-••••-${code.slice(-4)}`;
  return `Legacy ••••${code.slice(-6)}`;
}

async function authorizationToken(licenseId: string, hostname: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ sub: licenseId, hostname, exp: expiresAt })));
  const seed = new Uint8Array([...encryptionKeyBytes(), ...new TextEncoder().encode(":authorization")]);
  const signingBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
  const key = await crypto.subtle.importKey("raw", signingBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return { token: `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

async function requestHash(req: Request, value: string): Promise<string> {
  const forwarded = req.headers.get("x-ecomos-client-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return hashThemeLicenseCode(`${forwarded}:${value}`);
}

async function allowRequest(req: Request, admin: SupabaseClient, value: string): Promise<boolean> {
  const { data, error } = await admin.rpc("theme_license_take_rate_limit", { p_requester_hash: await requestHash(req, value) });
  return !error && data === true;
}

async function globalUnauthorizedMessage(admin: SupabaseClient): Promise<UnauthorizedMessage> {
  const { data } = await admin.from("license_unauthorized_message_defaults")
    .select("title, message, primary_button_text, primary_button_url, secondary_button_text, secondary_button_url")
    .eq("singleton", true).maybeSingle();
  return responseMessage(data as Partial<UnauthorizedMessage> | null) || FALLBACK_UNAUTHORIZED_MESSAGE;
}

function clientUnauthorizedMessage(row: Pick<ClientLicenseRow, "has_custom_unauthorized_message" | "unauthorized_title" | "unauthorized_message" | "unauthorized_primary_button_text" | "unauthorized_primary_button_url" | "unauthorized_secondary_button_text" | "unauthorized_secondary_button_url">, fallback: UnauthorizedMessage) {
  if (!row.has_custom_unauthorized_message) return fallback;
  return responseMessage({
    title: row.unauthorized_title || undefined,
    message: row.unauthorized_message || undefined,
    primary_button_text: row.unauthorized_primary_button_text || undefined,
    primary_button_url: row.unauthorized_primary_button_url || undefined,
    secondary_button_text: row.unauthorized_secondary_button_text,
    secondary_button_url: row.unauthorized_secondary_button_url,
  }) || fallback;
}

function publicLicense(row: ClientLicenseRow, includeEvents = false) {
  return {
    id: row.id, client_name: row.client_name, phone: row.phone, email: row.email, theme_name: row.theme_name,
    license_display: row.license_display, price: Number(row.price), currency: row.currency, status: row.status,
    notes: row.notes, order_reference: row.order_reference, payment_notes: row.payment_notes,
    created_at: row.created_at, updated_at: row.updated_at, disabled_at: row.disabled_at,
    archived_at: row.archived_at, revoked_at: row.revoked_at, last_check_at: row.last_check_at,
    has_custom_unauthorized_message: row.has_custom_unauthorized_message,
    unauthorized_message: row.has_custom_unauthorized_message ? responseMessage({
      title: row.unauthorized_title || undefined, message: row.unauthorized_message || undefined,
      primary_button_text: row.unauthorized_primary_button_text || undefined, primary_button_url: row.unauthorized_primary_button_url || undefined,
      secondary_button_text: row.unauthorized_secondary_button_text, secondary_button_url: row.unauthorized_secondary_button_url,
    }) : null,
    domains: (row.license_domains || []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    ...(includeEvents ? { events: row.license_events || [] } : {}),
  };
}

async function loadLicense(admin: SupabaseClient, id: string, includeEvents = true) {
  const select = `${LICENSE_FIELDS}, license_domains(${DOMAIN_FIELDS})${includeEvents ? `, license_events(${EVENT_FIELDS})` : ""}`;
  const { data, error } = await admin.from("client_licenses").select(select).eq("id", id).maybeSingle();
  if (error) throw new HttpError("License could not be loaded", 500);
  if (!data) throw new HttpError("License not found", 404);
  const row = data as unknown as ClientLicenseRow;
  if (row.license_events) row.license_events.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return row;
}

async function licenseWithSecret(admin: SupabaseClient, id: string) {
  const row = await loadLicense(admin, id, true);
  const licenseKey = row.license_key_encrypted ? await decryptLicense(row.license_key_encrypted) : null;
  return { ...publicLicense(row, true), license_key: licenseKey };
}

async function recordValidation(admin: SupabaseClient, licenseId: string, eventType: string, hostname: string, metadata: Record<string, unknown> = {}) {
  const { error } = await admin.from("license_events").insert({ license_id: licenseId, event_type: eventType, hostname, metadata });
  if (error) console.error("[theme-domain-licensing] validation event failed", error.message);
}

async function validateLicense(req: Request, body: Record<string, unknown>) {
  const rawCode = body.license ?? body.code;
  const rawHostname = body.hostname;
  const admin = serviceClient();
  // Rate-limit every public validation attempt before lookup, including malformed
  // requests. The bucket is per requester rather than per supplied hostname.
  if (!(await allowRequest(req, admin, "theme-license-validation"))) {
    return json(req, { allowed: false, unauthorized_message: FALLBACK_UNAUTHORIZED_MESSAGE }, 429);
  }
  const fallback = await globalUnauthorizedMessage(admin);
  if (!validThemeLicenseCode(rawCode) || typeof rawHostname !== "string" || rawHostname.length > 512) return json(req, { allowed: false, unauthorized_message: fallback });
  const code = normalizeThemeLicenseCode(rawCode);
  let hostname: string;
  try { hostname = normalizeThemeDomain(rawHostname); } catch { return json(req, { allowed: false, unauthorized_message: fallback }); }

  const hash = await hashThemeLicenseCode(code);
  const validationFields = "id, status, has_custom_unauthorized_message, unauthorized_title, unauthorized_message, unauthorized_primary_button_text, unauthorized_primary_button_url, unauthorized_secondary_button_text, unauthorized_secondary_button_url";
  const { data, error } = await admin.from("client_licenses").select(validationFields).eq("license_key_hash", hash).maybeSingle();
  if (error || !data) return json(req, { allowed: false, unauthorized_message: fallback });
  const message = clientUnauthorizedMessage(data as ClientLicenseRow, fallback);
  if (data.status !== "active") {
    await recordValidation(admin, data.id, "LICENSE_VALIDATION_BLOCKED", hostname, { status: data.status });
    return json(req, { allowed: false, unauthorized_message: message });
  }

  const { data: domain, error: domainError } = await admin.from("license_domains").select("id, status").eq("license_id", data.id).eq("hostname", hostname).neq("status", "removed").maybeSingle();
  if (domainError || !domain || domain.status !== "active") {
    await recordValidation(admin, data.id, "DOMAIN_MISMATCH", hostname, { domain_status: domain?.status || "not_found" });
    return json(req, { allowed: false, unauthorized_message: message });
  }

  const checkedAt = new Date().toISOString();
  const [licenseUpdate, domainUpdate] = await Promise.all([
    admin.from("client_licenses").update({ last_check_at: checkedAt, updated_at: checkedAt }).eq("id", data.id),
    admin.from("license_domains").update({ last_check_at: checkedAt, updated_at: checkedAt }).eq("id", domain.id),
  ]);
  if (licenseUpdate.error || domainUpdate.error) return json(req, { allowed: false, unauthorized_message: message }, 503);
  await recordValidation(admin, data.id, "LICENSE_VALIDATED", hostname);
  const authorization = await authorizationToken(data.id, hostname);
  return json(req, { allowed: true, authorization_token: authorization.token, expires_at: authorization.expiresAt });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  let action = "";
  try {
    const body = await readJson(req);
    action = String(body.action || "").trim().toLowerCase();
    if (action === "verify" || action === "validate") return await validateLicense(req, body);

    const { admin, userId } = await adminClientFor(req);

    if (action === "list") {
      const { data, error } = await admin.from("client_licenses").select(`${LICENSE_FIELDS}, license_domains(${DOMAIN_FIELDS})`).order("created_at", { ascending: false });
      if (error) throw new HttpError("Client licenses could not be loaded", 500);
      const allRows = (data || []) as unknown as ClientLicenseRow[];
      const statuses = new Set(["all", "active", "disabled", "archived", "revoked"]);
      const status = statuses.has(String(body.status || "all")) ? String(body.status || "all") : "all";
      const currency = String(body.currency || "all").trim().toUpperCase();
      const dateFrom = typeof body.date_from === "string" && body.date_from ? Date.parse(body.date_from) : Number.NaN;
      const dateTo = typeof body.date_to === "string" && body.date_to ? Date.parse(`${body.date_to}T23:59:59.999Z`) : Number.NaN;
      const search = String(body.search || "").trim();
      const normalizedSearch = search.toLowerCase();
      const licenseHash = validThemeLicenseCode(search) ? await hashThemeLicenseCode(normalizeThemeLicenseCode(search)) : "";
      const filtered = allRows.filter((row) => {
        if (status !== "all" && row.status !== status) return false;
        if (currency !== "ALL" && row.currency !== currency) return false;
        const created = Date.parse(row.created_at);
        if (Number.isFinite(dateFrom) && created < dateFrom) return false;
        if (Number.isFinite(dateTo) && created > dateTo) return false;
        if (!search) return true;
        return row.license_key_hash === licenseHash || [row.client_name, row.phone, row.email || "", row.theme_name, row.license_display]
          .some((value) => value.toLowerCase().includes(normalizedSearch)) ||
          (row.license_domains || []).some((domain) => domain.hostname.includes(normalizedSearch));
      });
      const revenue: Record<string, number> = {};
      for (const row of allRows) revenue[row.currency] = (revenue[row.currency] || 0) + Number(row.price);
      const stats = {
        total_clients: allRows.length,
        active_licenses: allRows.filter((row) => row.status === "active").length,
        authorized_domains: allRows.flatMap((row) => row.license_domains || []).filter((domain) => domain.status === "active").length,
        total_revenue: revenue,
        disabled_licenses: allRows.filter((row) => row.status === "disabled").length,
        archived_licenses: allRows.filter((row) => row.status === "archived").length,
      };
      return json(req, { licenses: filtered.map((row) => publicLicense(row)), stats, currencies: [...new Set(allRows.map((row) => row.currency))].sort() });
    }

    if (action === "get") return json(req, { license: await licenseWithSecret(admin, requireUuid(body.id, "id")) });

    if (action === "create") {
      const input = normalizeClientInput(body);
      const domains = normalizeDomains(body.domains);
      let createdId = "";
      let code = "";
      for (let attempt = 0; attempt < 5 && !createdId; attempt += 1) {
        code = generateThemeLicenseCode();
        const hash = await hashThemeLicenseCode(code);
        const encrypted = await encryptLicense(code);
        const { data, error } = await admin.rpc("create_client_license_v1", {
          p_client_name: input.clientName, p_phone: input.phone, p_email: input.email,
          p_theme_name: input.themeName, p_license_key_hash: hash, p_license_key_encrypted: encrypted,
          p_license_display: licenseDisplay(code), p_price: input.price, p_currency: input.currency,
          p_notes: input.notes, p_order_reference: input.orderReference, p_payment_notes: input.paymentNotes,
          p_domains: domains, p_actor_id: userId,
        });
        if (!error) { createdId = String(data); break; }
        const details = `${error.message || ""} ${error.details || ""}`;
        if (error.code === "23505" && details.includes("license_key_hash")) continue;
        if (error.code === "23505") throw new HttpError("Remove duplicate domains from this client license", 409);
        throw new HttpError("Client license could not be created", 500);
      }
      if (!createdId) throw new HttpError("A unique license key could not be generated", 503);
      return json(req, { license: await licenseWithSecret(admin, createdId), code }, 201);
    }

    if (action === "update") {
      const id = requireUuid(body.id, "id");
      const input = normalizeClientInput(body);
      const { error } = await admin.rpc("update_client_license_v1", {
        p_license_id: id, p_client_name: input.clientName, p_phone: input.phone, p_email: input.email,
        p_theme_name: input.themeName, p_price: input.price, p_currency: input.currency,
        p_notes: input.notes, p_order_reference: input.orderReference, p_payment_notes: input.paymentNotes,
        p_actor_id: userId,
      });
      if (error) throw new HttpError(error.code === "P0002" ? "License not found" : "Client license could not be updated", error.code === "P0002" ? 404 : 500);
      return json(req, { license: await licenseWithSecret(admin, id) });
    }

    if (["disable", "enable", "archive", "restore", "revoke"].includes(action)) {
      const id = requireUuid(body.id, "id");
      const { error } = await admin.rpc("client_license_status_action_v1", { p_license_id: id, p_action: action, p_actor_id: userId });
      if (error) throw new HttpError(error.code === "P0002" ? "License not found" : error.message || "License status could not be changed", error.code === "P0002" ? 404 : 400);
      return json(req, { license: await licenseWithSecret(admin, id) });
    }

    if (action === "domain_action") {
      const id = requireUuid(body.id, "id");
      const domainAction = String(body.domain_action || "").toLowerCase();
      if (!["add", "disable", "enable", "remove"].includes(domainAction)) throw new HttpError("Invalid domain action", 400);
      let hostname: string;
      try { hostname = normalizeThemeDomain(body.hostname); } catch { throw new HttpError("Enter a valid domain", 400); }
      const { error } = await admin.rpc("client_license_domain_action_v1", { p_license_id: id, p_hostname: hostname, p_action: domainAction, p_actor_id: userId });
      if (error?.code === "23505") throw new HttpError("This domain is already active on this client license", 409);
      if (error) throw new HttpError(error.message || "Domain could not be changed", error.code === "P0002" ? 404 : 400);
      return json(req, { license: await licenseWithSecret(admin, id) });
    }

    if (action === "rotate") {
      const id = requireUuid(body.id, "id");
      const code = generateThemeLicenseCode();
      const { error } = await admin.rpc("rotate_client_license_v1", {
        p_license_id: id, p_license_key_hash: await hashThemeLicenseCode(code),
        p_license_key_encrypted: await encryptLicense(code), p_license_display: licenseDisplay(code), p_actor_id: userId,
      });
      if (error) throw new HttpError(error.message || "License could not be rotated", 400);
      return json(req, { license: await licenseWithSecret(admin, id), code });
    }

    if (action === "get_unauthorized_message_default") {
      return json(req, { message: await globalUnauthorizedMessage(admin) });
    }

    if (action === "update_unauthorized_message") {
      const id = requireUuid(body.id, "id");
      const input = normalizeUnauthorizedMessage(body.unauthorized_message, true);
      const { error } = await admin.rpc("update_client_unauthorized_message_v1", {
        p_license_id: id, p_has_custom: input.enabled, p_title: input.title, p_message: input.message,
        p_primary_button_text: input.primaryText, p_primary_button_url: input.primaryUrl,
        p_secondary_button_text: input.secondaryText, p_secondary_button_url: input.secondaryUrl, p_actor_id: userId,
      });
      if (error) throw new HttpError(error.code === "P0002" ? "License not found" : "Unauthorized theme message could not be updated", error.code === "P0002" ? 404 : 400);
      return json(req, { license: await licenseWithSecret(admin, id) });
    }

    if (action === "update_unauthorized_message_default") {
      const input = normalizeUnauthorizedMessage(body.unauthorized_message);
      const { error } = await admin.rpc("update_license_unauthorized_message_default_v1", {
        p_title: input.title, p_message: input.message, p_primary_button_text: input.primaryText,
        p_primary_button_url: input.primaryUrl, p_secondary_button_text: input.secondaryText,
        p_secondary_button_url: input.secondaryUrl, p_actor_id: userId,
      });
      if (error) throw new HttpError("Default unauthorized theme message could not be updated", 400);
      return json(req, { message: await globalUnauthorizedMessage(admin) });
    }

    if (action === "lookup") {
      if (!validThemeLicenseCode(body.license)) return json(req, { found: false });
      const code = normalizeThemeLicenseCode(body.license);
      const hash = await hashThemeLicenseCode(code);
      const { data, error } = await admin.from("client_licenses").select("id, license_key_encrypted").eq("license_key_hash", hash).maybeSingle();
      if (error) throw new HttpError("License search failed", 500);
      if (!data) return json(req, { found: false });
      if (!data.license_key_encrypted) {
        const { error: importError } = await admin.rpc("import_existing_license_v1", {
          p_license_id: data.id, p_license_key_encrypted: await encryptLicense(code),
          p_license_display: licenseDisplay(code), p_actor_id: userId,
        });
        if (importError) throw new HttpError("Existing license could not be imported", 500);
      }
      return json(req, { found: true, license: await licenseWithSecret(admin, data.id) });
    }

    throw new HttpError("Unsupported action", 400);
  } catch (error) {
    if (action === "verify" || action === "validate") return json(req, { allowed: false }, error instanceof HttpError ? error.status : 503);
    if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
    console.error("[theme-domain-licensing]", error instanceof Error ? error.message : "unknown error");
    return json(req, { error: "Request failed" }, 500);
  }
});
