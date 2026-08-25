import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.111.0";

export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
export const TIKTOK_AUTHORIZE_URL = "https://ads.tiktok.com/marketing_api/auth";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type JsonObject = Record<string, unknown>;

export interface TikTokApiEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

export class TikTokError extends Error {
  constructor(
    message: string,
    public readonly category: "authentication" | "permission" | "rate_limit" | "validation" | "temporary" | "configuration",
    public readonly status = 500,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new TikTokError(`${name} is not configured`, "configuration", 503);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateRequest(req: Request, client: SupabaseClient): Promise<User> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new TikTokError("Authentication required", "authentication", 401);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new TikTokError("Your session has expired", "authentication", 401);
  return data.user;
}

export async function authorizeWorkspace(
  client: SupabaseClient,
  userId: string,
  workspaceId: string,
  manage = false,
): Promise<void> {
  const { data: profile, error } = await client
    .from("profiles")
    .select("id, workspace_id, role, is_active, deleted_at, allowed_sections")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile || profile.is_active === false || profile.deleted_at) {
    throw new TikTokError("Workspace access required", "permission", 403);
  }

  const { data: membership } = await client
    .from("profile_workspaces")
    .select("id")
    .eq("profile_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (profile.workspace_id !== workspaceId && !membership) {
    throw new TikTokError("Workspace access required", "permission", 403);
  }

  const role = String(profile.role ?? "");
  const ownerLike = ["founder", "owner", "supervisor", "admin", "manager"].includes(role);
  if (manage && !ownerLike) throw new TikTokError("Workspace administrator permission required", "permission", 403);
  const sections = Array.isArray(profile.allowed_sections) ? profile.allowed_sections.map(String) : [];
  if (!manage && !ownerLike && !sections.includes("TikTok Ads")) {
    throw new TikTokError("TikTok Ads permission required", "permission", 403);
  }
}

export function isCronRequest(req: Request): boolean {
  const configured = Deno.env.get("TIKTOK_CRON_SECRET")?.trim();
  const supplied = req.headers.get("x-cron-secret")?.trim();
  return Boolean(configured && supplied && timingSafeEqual(configured, supplied));
}

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
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
  const configured = requiredEnv("TIKTOK_TOKEN_ENCRYPTION_KEY");
  if (/^[0-9a-f]{64}$/i.test(configured)) {
    return Uint8Array.from(configured.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  }
  const decoded = base64ToBytes(configured);
  if (decoded.length !== 32) {
    throw new TikTokError("TIKTOK_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)", "configuration", 503);
  }
  return decoded;
}

async function encryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encryptionKeyBytes(), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(secret));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(encrypted: string): Promise<string> {
  const [version, ivValue, ciphertextValue] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new TikTokError("Stored credential is invalid", "configuration", 500);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivValue) },
      await encryptionKey(),
      base64ToBytes(ciphertextValue),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new TikTokError("Stored credential cannot be decrypted", "configuration", 500);
  }
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sanitizeText(value: unknown, fallback = "TikTok request failed"): string {
  const message = typeof value === "string" ? value : fallback;
  return message
    .replace(/(?:access|refresh)[_-]?token["'=:\s]+[^\s,"'}]+/gi, "credential=[redacted]")
    .replace(/[A-Za-z0-9_-]{36,}/g, "[redacted]")
    .slice(0, 500);
}

function classifyApiError(status: number, code: number, message: string): TikTokError {
  const normalized = message.toLowerCase();
  if (status === 401 || normalized.includes("access token") || normalized.includes("unauthorized")) {
    return new TikTokError("TikTok authorization expired", "authentication", 401);
  }
  if (status === 403 || normalized.includes("permission") || normalized.includes("scope")) {
    return new TikTokError("Missing TikTok reporting permission", "permission", 403);
  }
  if (status === 429 || normalized.includes("rate limit") || code === 40100) {
    return new TikTokError("TikTok rate limit reached; sync will retry", "rate_limit", 429, true);
  }
  if (status >= 500) return new TikTokError("TikTok is temporarily unavailable", "temporary", 502, true);
  return new TikTokError("TikTok rejected the request", "validation", 400);
}

export async function tiktokRequest<T>(
  path: string,
  options: { token?: string; method?: "GET" | "POST"; query?: Record<string, unknown>; body?: JsonObject; retries?: number },
): Promise<T> {
  const retries = options.retries ?? 3;
  const method = options.method ?? "GET";
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [key, rawValue] of Object.entries(options.query ?? {})) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    url.searchParams.set(key, typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue));
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options.token ? { "Access-Token": options.token } : {}),
        },
        body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
        signal: controller.signal,
      });
      const raw = await response.text();
      let envelope: TikTokApiEnvelope<T>;
      try {
        envelope = JSON.parse(raw) as TikTokApiEnvelope<T>;
      } catch {
        throw new TikTokError("TikTok returned an invalid response", "temporary", 502, true);
      }
      if (!response.ok || Number(envelope.code) !== 0) {
        const classified = classifyApiError(response.status, Number(envelope.code), sanitizeText(envelope.message));
        if (classified.retryable && attempt < retries) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt)));
          continue;
        }
        throw classified;
      }
      return envelope.data;
    } catch (error) {
      const normalized = error instanceof TikTokError
        ? error
        : new TikTokError(error instanceof DOMException && error.name === "AbortError" ? "TikTok request timed out" : "TikTok is temporarily unavailable", "temporary", 502, true);
      if (normalized.retryable && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt)));
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new TikTokError("TikTok request failed", "temporary", 502, true);
}

export interface PageInfo {
  page?: number;
  page_size?: number;
  total_page?: number;
  total_number?: number;
}

export async function fetchTikTokPages<T>(
  path: string,
  token: string,
  query: Record<string, unknown>,
  extract: (data: JsonObject) => { rows: T[]; pageInfo?: PageInfo },
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const data = await tiktokRequest<JsonObject>(path, { token, query: { ...query, page, page_size: 1000 } });
    const { rows, pageInfo } = extract(data);
    all.push(...rows);
    const totalPage = Number(pageInfo?.total_page ?? page);
    if (rows.length === 0 || page >= totalPage) break;
  }
  return all;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(0, Math.min(days, 180) - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export function dateRangeInTimeZone(days: number, timeZone: string | null | undefined): { startDate: string; endDate: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const end = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(0, Math.min(days, 180) - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function errorResponse(error: unknown): Response {
  const normalized = error instanceof TikTokError ? error : new TikTokError("TikTok operation failed", "temporary", 500);
  return jsonResponse({ success: false, error: normalized.message, category: normalized.category, retryable: normalized.retryable }, normalized.status);
}
