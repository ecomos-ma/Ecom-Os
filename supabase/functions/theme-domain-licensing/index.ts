import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";

class HttpError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
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
function normalizeThemeDomain(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 512) throw new Error("Invalid domain");
  const value = input.trim();
  if (/[*\\\s@?#]/.test(value)) throw new Error("Invalid domain");
  const scheme = value.indexOf("://");
  if (scheme >= 0 && !["http", "https"].includes(value.slice(0, scheme).toLowerCase())) throw new Error("Invalid domain");
  let url: URL;
  try { url = new URL(scheme >= 0 ? value : "https://" + value); } catch { throw new Error("Invalid domain"); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid domain");
  const domain = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const labels = domain.split(".");
  const tld = labels[labels.length - 1] || "";
  if (domain.length > 253 || labels.length < 2 || labels.some((part) => part.length < 1 || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) || tld.length < 2 || (!tld.startsWith("xn--") && !/^[a-z]+$/.test(tld)) || /^(?:\d+\.){3}\d+$/.test(domain)) throw new Error("Invalid domain");
  return domain;
}
function generateThemeLicenseCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "ecomos_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashThemeLicenseCode(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validThemeLicenseCode(code: unknown): code is string { return typeof code === "string" && /^ecomos_[a-f0-9]{64}$/.test(code); }
function requireUuid(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) throw new HttpError(field + " is invalid", 400);
  return normalized;
}
function configuredOrigins() { return (Deno.env.get("APP_URLS") || Deno.env.get("APP_URL") || "").split(",").map((value) => value.trim()).filter(Boolean); }

type LicenseRow = {
  id: string; label: string; domain: string; status: "active" | "disabled" | "revoked";
  created_at: string; updated_at: string; last_checked_at: string | null; revoked_at: string | null;
};

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")?.trim() || "";
  const configured = new Set(["https://ecomscale.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080", ...configuredOrigins()]);
  let allowed = configured.has(origin);
  if (!allowed && origin) {
    try {
      const url = new URL(origin);
      allowed = url.protocol === "https:" && normalizeThemeDomain(url.hostname) === url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    } catch { allowed = false; }
  }
  return {
    "Content-Type": "application/json",
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

async function adminClientFor(req: Request): Promise<{ admin: SupabaseClient; userId: string }> {
  const admin = serviceClient();
  const user = await authenticate(req, admin);
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.rpc("platform_get_my_authorization_v1");
  if (error || !data?.is_platform_admin || !Array.isArray(data.permissions) || !data.permissions.includes("settings.manage")) {
    throw new HttpError("Platform administrator permission required", 403);
  }
  return { admin, userId: user.id };
}

async function requestHash(req: Request, value: string): Promise<string> {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return hashThemeLicenseCode(forwarded + ":" + value);
}

async function allowRequest(req: Request, admin: SupabaseClient, value: string): Promise<boolean> {
  const hash = await requestHash(req, value);
  const { data, error } = await admin.rpc("theme_license_take_rate_limit", { p_requester_hash: hash });
  return !error && data === true;
}

function publicRow(row: LicenseRow) {
  return { id: row.id, label: row.label, domain: row.domain, status: row.status, created_at: row.created_at, updated_at: row.updated_at, last_checked_at: row.last_checked_at, revoked_at: row.revoked_at };
}

async function readJson(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 12_000) throw new HttpError("Request is too large", 413);
  try { return bodyObject(await req.json()); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError("Invalid JSON", 400); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  let action = "";
  try {
    const body = await readJson(req);
    action = String(body.action || "").trim().toLowerCase();

    if (action === "verify") {
      const code = body.code;
      const hostname = body.hostname;
      if (!validThemeLicenseCode(code) || typeof hostname !== "string" || hostname.length > 512) return json(req, { allowed: false });
      let domain: string;
      try { domain = normalizeThemeDomain(hostname); } catch { return json(req, { allowed: false }); }
      const admin = serviceClient();
      if (!(await allowRequest(req, admin, domain))) return json(req, { allowed: false }, 429);
      const hash = await hashThemeLicenseCode(code);
      const { data: license, error } = await admin.from("theme_domain_licenses").select("id, domain, status, token_hash").eq("token_hash", hash).eq("status", "active").maybeSingle();
      if (error || !license || license.domain !== domain) return json(req, { allowed: false });
      await admin.from("theme_domain_licenses").update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", license.id);
      return json(req, { allowed: true });
    }

    const { admin, userId } = await adminClientFor(req);
    if (action === "list") {
      const { data, error } = await admin.from("theme_domain_licenses").select("id, label, domain, status, created_at, updated_at, last_checked_at, revoked_at").order("created_at", { ascending: false });
      if (error) throw new HttpError("Licenses could not be loaded", 500);
      return json(req, { licenses: (data || []).map(publicRow) });
    }

    if (action === "create") {
      const label = String(body.label || "").trim();
      if (!label || label.length > 120) throw new HttpError("Label must be between 1 and 120 characters", 400);
      let domain: string;
      try { domain = normalizeThemeDomain(body.domain); } catch { throw new HttpError("Enter a valid domain without a wildcard", 400); }
      const code = generateThemeLicenseCode();
      const { data, error } = await admin.from("theme_domain_licenses").insert({ label, domain, status: "active", token_hash: await hashThemeLicenseCode(code), created_by: userId }).select("id, label, domain, status, created_at, updated_at, last_checked_at, revoked_at").single();
      if (error) {
        if (error.code === "23505") throw new HttpError("An active license already exists for this domain", 409);
        throw new HttpError("License could not be created", 500);
      }
      return json(req, { license: publicRow(data as LicenseRow), code });
    }

    if (action === "update") {
      const id = requireUuid(body.id, "id");
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.label !== undefined) {
        const label = String(body.label || "").trim();
        if (!label || label.length > 120) throw new HttpError("Label must be between 1 and 120 characters", 400);
        updates.label = label;
      }
      if (body.domain !== undefined) {
        try { updates.domain = normalizeThemeDomain(body.domain); } catch { throw new HttpError("Enter a valid domain without a wildcard", 400); }
      }
      if (body.status !== undefined) {
        if (!["active", "disabled", "revoked"].includes(String(body.status))) throw new HttpError("Invalid license status", 400);
        updates.status = String(body.status);
        if (updates.status === "revoked") updates.revoked_at = new Date().toISOString();
      }
      const { data, error } = await admin.from("theme_domain_licenses").update(updates).eq("id", id).select("id, label, domain, status, created_at, updated_at, last_checked_at, revoked_at").single();
      if (error) {
        if (error.code === "23505") throw new HttpError("An active license already exists for this domain", 409);
        throw new HttpError(error.code === "PGRST116" ? "License not found" : "License could not be updated", error.code === "PGRST116" ? 404 : 500);
      }
      return json(req, { license: publicRow(data as LicenseRow) });
    }

    if (action === "rotate") {
      const id = requireUuid(body.id, "id");
      const code = generateThemeLicenseCode();
      const { data, error } = await admin.from("theme_domain_licenses").update({ token_hash: await hashThemeLicenseCode(code), status: "active", revoked_at: null, updated_at: new Date().toISOString() }).eq("id", id).select("id, label, domain, status, created_at, updated_at, last_checked_at, revoked_at").single();
      if (error) throw new HttpError(error.code === "PGRST116" ? "License not found" : "License could not be rotated", error.code === "PGRST116" ? 404 : 500);
      return json(req, { license: publicRow(data as LicenseRow), code });
    }

    if (action === "revoke" || action === "disable" || action === "enable") {
      const id = requireUuid(body.id, "id");
      const status = action === "revoke" ? "revoked" : action === "disable" ? "disabled" : "active";
      const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (action === "revoke") { updates.revoked_at = new Date().toISOString(); updates.token_hash = null; }
      if (action === "enable") updates.revoked_at = null;
      const { data, error } = await admin.from("theme_domain_licenses").update(updates).eq("id", id).select("id, label, domain, status, created_at, updated_at, last_checked_at, revoked_at").single();
      if (error) {
        if (error.code === "23505") throw new HttpError("An active license already exists for this domain", 409);
        throw new HttpError(error.code === "PGRST116" ? "License not found" : "License could not be changed", error.code === "PGRST116" ? 404 : 500);
      }
      return json(req, { license: publicRow(data as LicenseRow) });
    }
    throw new HttpError("Unsupported action", 400);
  } catch (error) {
    if (action === "verify") return json(req, { allowed: false }, error instanceof HttpError ? error.status : 503);
    if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
    console.error("[theme-domain-licensing]", error instanceof Error ? error.message : "unknown error");
    return json(req, { error: "Request failed" }, 500);
  }
});
