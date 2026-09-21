import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  HttpError,
  authenticate,
  authorizeWorkspace,
  errorResponse,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";
import { buildBlockedGuardScript, buildCustomerGuardScript } from "./guard-script.ts";

const PUBLIC_ANTI_FAKE_ENDPOINT = "https://www.ecomos.ma/api/anti-fake-orders";

type BlockMode = "message" | "cyber_prank";
type RuleType = "ip" | "phone" | "name" | "address" | "address_contains";

type StoreRecord = {
  id: string;
  workspace_id: string;
  store_url: string;
  hostname: string;
  site_key: string;
  enabled: boolean;
  customer_guard_enabled: boolean;
  default_block_mode: BlockMode;
  default_message: string;
  created_at: string;
  updated_at: string;
};

type RuleRecord = {
  id: string;
  workspace_id: string;
  store_id: string;
  rule_type: RuleType;
  rule_value: string;
  normalized_value: string | null;
  ip_address: string | null;
  block_mode: BlockMode;
  message: string | null;
  note: string;
  enabled: boolean;
  starts_at: string;
  expires_at: string | null;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
};

const MANAGER_ROLES = ["owner", "admin", "manager", "supervisor", "founder", "super_admin", "root_founder"];

function publicCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function publicJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...publicCorsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function javascript(source: string): Response {
  return new Response(source, {
    status: 200,
    headers: {
      ...publicCorsHeaders(),
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function requireString(value: unknown, field: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength) throw new HttpError(`${field} is invalid`, 400);
  return normalized;
}

function blockMode(value: unknown, fallback: BlockMode = "message"): BlockMode {
  return value === "cyber_prank" || value === "message" ? value : fallback;
}

function ruleType(value: unknown): RuleType {
  const allowed: RuleType[] = ["ip", "phone", "name", "address", "address_contains"];
  if (!allowed.includes(value as RuleType)) throw new HttpError("rule_type is invalid", 400);
  return value as RuleType;
}

function parseStoreUrl(value: unknown): { storeUrl: string; hostname: string } {
  let raw = requireString(value, "store_url", 500);
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpError("Enter a valid public store URL", 400);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (!hostname || parsed.username || parsed.password || (!isLocal && parsed.protocol !== "https:")) {
    throw new HttpError("The store URL must be a public HTTPS address", 400);
  }
  if (hostname === "seller-area.youcan.shop") {
    throw new HttpError("Use the public storefront URL, not the YouCan seller dashboard URL", 400);
  }
  const validDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname);
  if (!isLocal && !validDomain) throw new HttpError("The store hostname is invalid", 400);
  return { storeUrl: parsed.origin, hostname };
}

function normalizeIp(raw: string): string {
  let value = raw.split(",")[0]?.trim().replace(/^::ffff:/i, "") ?? "";
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
  return value.toLowerCase();
}

function isIpAddress(value: string): boolean {
  const ip = normalizeIp(value);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return ip.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255 && String(Number(part)) === part);
  }
  if (!ip.includes(":") || !/^[0-9a-f:.]+$/i.test(ip)) return false;
  try {
    const parsed = new URL(`http://[${ip}]`);
    return parsed.hostname.length > 2;
  } catch {
    return false;
  }
}

function trustedClientIp(req: Request): string | null {
  // When the public EcomOS proxy is in front of the function, the original
  // visitor address is carried by x-forwarded-for. Prefer it over the proxy's
  // own Cloudflare edge address, then validate every candidate before lookup.
  for (const name of ["x-ecomos-client-ip", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
    const candidate = normalizeIp(req.headers.get(name) ?? "");
    if (isIpAddress(candidate)) return candidate;
  }
  return null;
}

function requestHostname(req: Request): string | null {
  for (const value of [
    req.headers.get("origin"),
    req.headers.get("referer"),
    req.headers.get("x-forwarded-host"),
    req.headers.get("x-original-host"),
    req.headers.get("host"),
  ]) {
    if (!value) continue;
    const candidate = value.split(",")[0]?.trim();
    if (!candidate) continue;
    try {
      const parsed = candidate.includes("://") ? new URL(candidate) : new URL(`https://${candidate}`);
      return parsed.hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      // Ignore malformed browser metadata and fail open below.
    }
  }
  return null;
}

function hostMatches(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  const stripWww = (value: string) => value.toLowerCase().replace(/^www\./, "");
  return stripWww(expected) === stripWww(actual);
}

function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(2);
  if (/^0[5-7]\d{8}$/.test(digits)) digits = `212${digits.slice(1)}`;
  if (/^[5-7]\d{8}$/.test(digits)) digits = `212${digits}`;
  return digits;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCustomerValue(type: RuleType, value: string): string {
  return type === "phone" ? normalizePhone(value) : normalizeText(value);
}

function isActive(rule: Pick<RuleRecord, "enabled" | "starts_at" | "expires_at">): boolean {
  const now = Date.now();
  return rule.enabled && Date.parse(rule.starts_at) <= now && (!rule.expires_at || Date.parse(rule.expires_at) > now);
}

function safeMessage(rule: RuleRecord, store: StoreRecord): string {
  return (rule.message?.trim() || store.default_message || "Access to this store is restricted.").slice(0, 500);
}

function blockedPayload(rule: RuleRecord, store: StoreRecord) {
  return {
    blocked: true,
    mode: blockMode(rule.block_mode, store.default_block_mode),
    message: safeMessage(rule, store),
  };
}

async function recordHit(client: ReturnType<typeof serviceClient>, ruleId: string): Promise<void> {
  const result = await client.rpc("record_anti_fake_order_rule_hit", { p_rule_id: ruleId });
  if (result.error) console.warn("[anti-fake-orders] Could not record rule hit", result.error.message);
}

async function publicStore(client: ReturnType<typeof serviceClient>, siteKey: string): Promise<StoreRecord | null> {
  if (!/^[0-9a-f]{48}$/i.test(siteKey)) return null;
  const { data, error } = await client
    .from("anti_fake_order_stores")
    .select("id,workspace_id,store_url,hostname,site_key,enabled,customer_guard_enabled,default_block_mode,default_message,created_at,updated_at")
    .eq("site_key", siteKey)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  return data as StoreRecord | null;
}

async function findIpRule(client: ReturnType<typeof serviceClient>, storeId: string, ip: string): Promise<RuleRecord | null> {
  const { data, error } = await client
    .from("anti_fake_order_rules")
    .select("*")
    .eq("store_id", storeId)
    .eq("rule_type", "ip")
    .eq("ip_address", ip)
    .eq("enabled", true)
    .limit(5);
  if (error) throw error;
  return ((data ?? []) as RuleRecord[]).find(isActive) ?? null;
}

async function findCustomerRule(
  client: ReturnType<typeof serviceClient>,
  storeId: string,
  customer: { phone?: string; name?: string; address?: string },
): Promise<RuleRecord | null> {
  const { data, error } = await client
    .from("anti_fake_order_rules")
    .select("*")
    .eq("store_id", storeId)
    .neq("rule_type", "ip")
    .eq("enabled", true)
    .limit(500);
  if (error) throw error;
  const phone = normalizePhone(customer.phone ?? "");
  const name = normalizeText(customer.name ?? "");
  const address = normalizeText(customer.address ?? "");
  return ((data ?? []) as RuleRecord[]).find((rule) => {
    if (!isActive(rule) || !rule.normalized_value) return false;
    if (rule.rule_type === "phone") return Boolean(phone) && phone === rule.normalized_value;
    if (rule.rule_type === "name") return Boolean(name) && name === rule.normalized_value;
    if (rule.rule_type === "address") return Boolean(address) && address === rule.normalized_value;
    return rule.rule_type === "address_contains" && Boolean(address) && address.includes(rule.normalized_value);
  }) ?? null;
}

function bootstrapSource(endpoint: string, store: StoreRecord, rule: RuleRecord | null): string {
  if (rule) return buildBlockedGuardScript(blockMode(rule.block_mode, store.default_block_mode), safeMessage(rule, store));
  if (store.customer_guard_enabled) return buildCustomerGuardScript(endpoint, store.site_key);
  return "/* EcomOS Anti-Fake Orders: allowed */";
}

async function management(req: Request, body: Record<string, unknown>): Promise<Response> {
  const client = serviceClient();
  const user = await authenticate(req, client);
  const workspaceId = requireUuid(body.workspace_id, "workspace_id");
  await authorizeWorkspace(client, user.id, workspaceId, MANAGER_ROLES);
  const action = String(body.action ?? "");

  if (action === "load") {
    const [{ data: store, error: storeError }, { data: rules, error: rulesError }] = await Promise.all([
      client.from("anti_fake_order_stores").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      client.from("anti_fake_order_rules").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    ]);
    if (storeError || rulesError) throw new HttpError("Anti-Fake Orders data could not be loaded", 503);
    return json(req, { store: store ?? null, rules: rules ?? [] });
  }

  if (action === "save_store") {
    const parsed = parseStoreUrl(body.store_url);
    const message = requireString(body.default_message ?? "Access to this store is restricted.", "default_message", 500);
    const payload = {
      workspace_id: workspaceId,
      created_by: user.id,
      store_url: parsed.storeUrl,
      hostname: parsed.hostname,
      enabled: body.enabled !== false,
      customer_guard_enabled: body.customer_guard_enabled !== false,
      default_block_mode: blockMode(body.default_block_mode),
      default_message: message,
    };
    const { data, error } = await client.from("anti_fake_order_stores")
      .upsert(payload, { onConflict: "workspace_id" }).select("*").single();
    if (error) throw new HttpError("Store protection settings could not be saved", 503);
    return json(req, { store: data });
  }

  const { data: store, error: storeError } = await client.from("anti_fake_order_stores")
    .select("id").eq("workspace_id", workspaceId).maybeSingle();
  if (storeError || !store) throw new HttpError("Add the store URL before creating block rules", 409);

  if (action === "add_rule") {
    const type = ruleType(body.rule_type);
    const value = requireString(body.rule_value, "rule_value", 500);
    const duration = body.duration_hours === null ? null : Number(body.duration_hours);
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 8760)) {
      throw new HttpError("duration_hours must be between 1 and 8760, or lifetime", 400);
    }
    const normalizedValue = type === "ip" ? null : normalizeCustomerValue(type, value);
    if (type === "ip" && !isIpAddress(value)) throw new HttpError("Enter a valid IPv4 or IPv6 address", 400);
    if (type === "phone" && (normalizedValue?.length ?? 0) < 7) throw new HttpError("Enter a valid phone number", 400);
    if (type !== "ip" && type !== "phone" && (normalizedValue?.length ?? 0) < 2) throw new HttpError("The customer value is too short", 400);
    const customMessage = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 500) : null;
    const startsAt = new Date();
    const expiresAt = duration === null ? null : new Date(startsAt.getTime() + duration * 3_600_000).toISOString();
    const payload = {
      workspace_id: workspaceId,
      store_id: store.id,
      created_by: user.id,
      rule_type: type,
      rule_value: value,
      normalized_value: normalizedValue,
      ip_address: type === "ip" ? normalizeIp(value) : null,
      block_mode: blockMode(body.block_mode),
      message: customMessage,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : "",
      enabled: true,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt,
    };
    const { data, error } = await client.from("anti_fake_order_rules").insert(payload).select("*").single();
    if (error?.code === "23505") throw new HttpError("This block rule already exists", 409);
    if (error) throw new HttpError("The block rule could not be created", 503);
    return json(req, { rule: data }, 201);
  }

  const ruleId = requireUuid(body.rule_id, "rule_id");
  if (action === "set_rule_enabled") {
    if (typeof body.enabled !== "boolean") throw new HttpError("enabled is invalid", 400);
    const { data, error } = await client.from("anti_fake_order_rules").update({ enabled: body.enabled })
      .eq("id", ruleId).eq("workspace_id", workspaceId).select("*").maybeSingle();
    if (error) throw new HttpError("The block rule could not be updated", 503);
    if (!data) throw new HttpError("Block rule not found", 404);
    return json(req, { rule: data });
  }

  if (action === "delete_rule") {
    const { error } = await client.from("anti_fake_order_rules").delete().eq("id", ruleId).eq("workspace_id", workspaceId);
    if (error) throw new HttpError("The block rule could not be deleted", 503);
    return json(req, { success: true });
  }

  throw new HttpError("Unsupported action", 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: publicCorsHeaders() });

  if (req.method === "GET") {
    // Script requests fail open: a service or database outage must never hide a
    // healthy storefront from ordinary visitors.
    try {
      const url = new URL(req.url);
      const siteKey = url.searchParams.get("site_key")?.trim() ?? "";
      const requestHost = url.searchParams.get("host")?.trim() || requestHostname(req) || null;
      const client = serviceClient();
      const store = await publicStore(client, siteKey);
      if (!store || !hostMatches(store.hostname, requestHost)) return javascript("/* EcomOS Anti-Fake Orders: allowed */");
      const ip = trustedClientIp(req);
      const rule = ip ? await findIpRule(client, store.id, ip) : null;
      if (rule) await recordHit(client, rule.id);
      return javascript(bootstrapSource(PUBLIC_ANTI_FAKE_ENDPOINT, store, rule));
    } catch (error) {
      console.warn("[anti-fake-orders] Public bootstrap failed open", error);
      return javascript("/* EcomOS Anti-Fake Orders unavailable: allowed */");
    }
  }

  if (req.method !== "POST") return publicJson({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (body.action === "customer_check") {
    try {
      const client = serviceClient();
      const siteKey = typeof body.site_key === "string" ? body.site_key.trim() : "";
      const store = await publicStore(client, siteKey);
      if (!store || !store.customer_guard_enabled || !hostMatches(store.hostname, requestHostname(req))) {
        return publicJson({ blocked: false });
      }
      const rawCustomer = body.customer && typeof body.customer === "object" ? body.customer as Record<string, unknown> : {};
      const customer = {
        phone: typeof rawCustomer.phone === "string" ? rawCustomer.phone.slice(0, 80) : "",
        name: typeof rawCustomer.name === "string" ? rawCustomer.name.slice(0, 160) : "",
        address: typeof rawCustomer.address === "string" ? rawCustomer.address.slice(0, 500) : "",
      };
      const rule = await findCustomerRule(client, store.id, customer);
      if (!rule) return publicJson({ blocked: false });
      await recordHit(client, rule.id);
      return publicJson(blockedPayload(rule, store));
    } catch (error) {
      console.warn("[anti-fake-orders] Customer check failed open", error);
      return publicJson({ blocked: false });
    }
  }

  try {
    return await management(req, body);
  } catch (error) {
    return errorResponse(req, error);
  }
});
