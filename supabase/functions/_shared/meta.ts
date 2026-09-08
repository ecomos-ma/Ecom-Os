import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2.111.0";
import {
  corsHeaders as strictCorsHeaders,
  errorResponse as sharedErrorResponse,
  HttpError,
} from "./security.ts";

export type JsonObject = Record<string, unknown>;
export type MetaErrorCategory =
  | "authentication"
  | "permission"
  | "rate_limit"
  | "validation"
  | "temporary"
  | "configuration";

export const META_GRAPH_VERSION =
  Deno.env.get("META_GRAPH_VERSION")?.trim() || "v26.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_OAUTH_BASE = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_REQUIRED_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
];

export class MetaError extends HttpError {
  constructor(
    message: string,
    status: number,
    public readonly category: MetaErrorCategory,
    public readonly retryable = false,
    public readonly providerRequestId?: string,
  ) {
    super(message, status);
  }
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value)
    throw new MetaError(
      "Meta service configuration is incomplete",
      503,
      "configuration",
    );
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    ...strictCorsHeaders(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  });
}

export function errorResponse(req: Request, error: unknown): Response {
  if (error instanceof MetaError) {
    return jsonResponse(
      req,
      {
        error: error.message,
        category: error.category,
        retryable: error.retryable,
      },
      error.status,
    );
  }
  return sharedErrorResponse(req, error);
}

export async function authenticateRequest(
  req: Request,
  client: SupabaseClient,
): Promise<User> {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token)
    throw new MetaError("Authentication required", 401, "authentication");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new MetaError("Your session has expired", 401, "authentication");
  return data.user;
}

export async function resolveActiveWorkspace(
  client: SupabaseClient,
  userId: string,
  manage = false,
): Promise<{ workspaceId: string; role: string }> {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select(
      "id, workspace_id, role, is_active, deleted_at, status, allowed_sections",
    )
    .eq("id", userId)
    .maybeSingle();
  if (
    profileError ||
    !profile?.workspace_id ||
    profile.is_active === false ||
    profile.deleted_at ||
    ["inactive", "suspended", "removed", "deleted"].includes(
      String(profile.status ?? "active").toLowerCase(),
    )
  ) {
    throw new MetaError("Active workspace access required", 403, "permission");
  }
  const workspaceId = String(profile.workspace_id);
  const [
    { data: workspace, error: workspaceError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    client
      .from("workspaces")
      .select("id, is_active, deleted_at, status")
      .eq("id", workspaceId)
      .maybeSingle(),
    client
      .from("profile_workspaces")
      .select("role, is_owner, status")
      .eq("profile_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (
    workspaceError ||
    membershipError ||
    !workspace ||
    workspace.is_active === false ||
    workspace.deleted_at ||
    ["inactive", "suspended", "removed", "deleted"].includes(
      String(workspace.status ?? "active").toLowerCase(),
    )
  ) {
    throw new MetaError("Active workspace access required", 403, "permission");
  }
  if (
    !membership ||
    String(membership.status ?? "active").toLowerCase() !== "active"
  ) {
    throw new MetaError(
      "Active workspace membership required",
      403,
      "permission",
    );
  }
  const role = String(
    membership?.is_owner
      ? "owner"
      : (membership?.role ?? profile.role ?? "user"),
  ).toLowerCase();
  const managers = [
    "founder",
    "super_admin",
    "owner",
    "supervisor",
    "admin",
    "manager",
  ];
  const sections = Array.isArray(profile.allowed_sections)
    ? profile.allowed_sections.map(String)
    : [];
  if (manage && !managers.includes(role))
    throw new MetaError(
      "Workspace administrator permission required",
      403,
      "permission",
    );
  if (
    !manage &&
    !managers.includes(role) &&
    !sections.some((section) =>
      ["ads", "ads manager", "meta ads"].includes(section.toLowerCase()),
    )
  ) {
    throw new MetaError("Meta Ads permission required", 403, "permission");
  }
  return { workspaceId, role };
}

export function isCronRequest(req: Request): boolean {
  const configured = Deno.env.get("META_CRON_SECRET")?.trim() ?? "";
  const supplied = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (!configured || !supplied) return false;
  const a = new TextEncoder().encode(configured);
  const b = new TextEncoder().encode(supplied);
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
  const configured = requiredEnv("META_TOKEN_ENCRYPTION_KEY");
  if (/^[0-9a-f]{64}$/i.test(configured)) {
    return Uint8Array.from(configured.match(/.{2}/g) ?? [], (part) =>
      Number.parseInt(part, 16),
    );
  }
  const decoded = base64ToBytes(configured);
  if (decoded.length !== 32)
    throw new MetaError(
      "Meta token encryption key is invalid",
      503,
      "configuration",
    );
  return decoded;
}

async function encryptionKey(): Promise<CryptoKey> {
  const rawKey = Uint8Array.from(encryptionKeyBytes()).buffer;
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(secret),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(encrypted: string): Promise<string> {
  const [version, ivValue, ciphertextValue] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue)
    throw new MetaError(
      "Stored Meta credential is invalid",
      500,
      "configuration",
    );
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(base64ToBytes(ivValue)).buffer },
      await encryptionKey(),
      Uint8Array.from(base64ToBytes(ciphertextValue)).buffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new MetaError(
      "Stored Meta credential cannot be decrypted",
      500,
      "configuration",
    );
  }
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function appSecretProof(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("META_APP_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeText(
  value: unknown,
  fallback = "Meta request failed",
): string {
  const message = typeof value === "string" ? value : fallback;
  return message
    .replace(/access_token["'=:\s]+[^\s,"'}&]+/gi, "access_token=[redacted]")
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .slice(0, 500);
}

function classifyMetaError(status: number, payload: JsonObject): MetaError {
  const raw = (
    payload.error && typeof payload.error === "object" ? payload.error : payload
  ) as JsonObject;
  const code = Number(raw.code ?? 0);
  const subcode = Number(raw.error_subcode ?? 0);
  const message = sanitizeText(raw.message, "Meta rejected the request");
  const requestId =
    typeof raw.fbtrace_id === "string" ? raw.fbtrace_id : undefined;
  if (status === 401 || code === 190)
    return new MetaError(
      "Meta authorization expired; reconnect the account",
      401,
      "authentication",
      false,
      requestId,
    );
  if (
    status === 403 ||
    code === 10 ||
    code === 200 ||
    subcode === 458 ||
    subcode === 460
  )
    return new MetaError(
      "Meta permission is missing or no longer valid",
      403,
      "permission",
      false,
      requestId,
    );
  if (
    status === 429 ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613
  )
    return new MetaError(
      "Meta rate limit reached; the operation will retry",
      429,
      "rate_limit",
      true,
      requestId,
    );
  if (status >= 500 || [1, 2, 341].includes(code))
    return new MetaError(
      "Meta is temporarily unavailable",
      502,
      "temporary",
      true,
      requestId,
    );
  return new MetaError(message, 400, "validation", false, requestId);
}

export async function metaRequest<T = JsonObject>(
  pathOrUrl: string,
  options: {
    token?: string;
    method?: "GET" | "POST" | "DELETE";
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    retries?: number;
  } = {},
): Promise<T> {
  const token = options.token;
  const method = options.method ?? "GET";
  const retries = options.retries ?? 3;
  const baseUrl = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${META_GRAPH_BASE}/${pathOrUrl.replace(/^\/+/, "")}`);
  const addParams = (
    target: URLSearchParams,
    values: Record<string, unknown>,
  ) => {
    for (const [key, raw] of Object.entries(values)) {
      if (raw === undefined || raw === null || raw === "") continue;
      target.set(
        key,
        typeof raw === "string"
          ? raw
          : typeof raw === "number" || typeof raw === "boolean"
            ? String(raw)
            : JSON.stringify(raw),
      );
    }
  };
  addParams(baseUrl.searchParams, options.query ?? {});
  if (token) {
    baseUrl.searchParams.set("appsecret_proof", await appSecretProof(token));
  }
  const form = new URLSearchParams();
  addParams(form, options.body ?? {});
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(baseUrl, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(method === "GET"
            ? {}
            : { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        body: method === "GET" ? undefined : form,
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (
        !response.ok ||
        (payload && typeof payload === "object" && "error" in payload)
      ) {
        const classified = classifyMetaError(
          response.status,
          (payload ?? {}) as JsonObject,
        );
        if (classified.retryable && attempt < retries) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              retryAfter > 0
                ? retryAfter * 1000
                : Math.min(8000, 500 * 2 ** attempt),
            ),
          );
          continue;
        }
        throw classified;
      }
      return payload as T;
    } catch (error) {
      const normalized =
        error instanceof MetaError
          ? error
          : new MetaError(
              error instanceof DOMException && error.name === "AbortError"
                ? "Meta request timed out"
                : "Meta is temporarily unavailable",
              502,
              "temporary",
              true,
            );
      if (normalized.retryable && attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt)),
        );
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new MetaError("Meta request failed", 502, "temporary", true);
}

export async function metaUploadImage(
  token: string,
  adAccountId: string,
  sourceUrl: string,
  workspaceId: string,
  filename = "creative.jpg",
): Promise<{ hash: string; url?: string }> {
  assertCreativeSourceUrl(sourceUrl, workspaceId);
  let source: Response;
  try {
    source = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new MetaError(
      "Creative file could not be downloaded",
      400,
      "validation",
    );
  }
  if (!source.ok)
    throw new MetaError(
      "Creative file could not be downloaded",
      400,
      "validation",
    );
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024)
    throw new MetaError(
      "Image exceeds the 30 MB upload limit",
      400,
      "validation",
    );
  const form = new FormData();
  form.set(
    "filename",
    new Blob([bytes], {
      type: source.headers.get("content-type") || "image/jpeg",
    }),
    filename,
  );
  form.set("appsecret_proof", await appSecretProof(token));
  const response = await fetch(
    `${META_GRAPH_BASE}/${normalizeAdAccountId(adAccountId)}/adimages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok || payload.error)
    throw classifyMetaError(response.status, payload);
  const images =
    payload.images && typeof payload.images === "object"
      ? (payload.images as JsonObject)
      : {};
  const image = Object.values(images)[0] as JsonObject | undefined;
  if (!image?.hash)
    throw new MetaError(
      "Meta did not return an image hash",
      502,
      "temporary",
      true,
    );
  return {
    hash: String(image.hash),
    url: image.url ? String(image.url) : undefined,
  };
}

export async function metaUploadVideo(
  token: string,
  adAccountId: string,
  sourceUrl: string,
  workspaceId: string,
  name = "Creative video",
): Promise<{ id: string }> {
  assertCreativeSourceUrl(sourceUrl, workspaceId);
  return metaRequest<{ id: string }>(
    `${normalizeAdAccountId(adAccountId)}/advideos`,
    { token, method: "POST", body: { file_url: sourceUrl, name } },
  );
}

function assertCreativeSourceUrl(sourceUrl: string, workspaceId: string): void {
  try {
    const source = new URL(sourceUrl);
    const storageOrigin = new URL(requiredEnv("SUPABASE_URL")).origin;
    const expectedPath = `/storage/v1/object/sign/meta-creatives/${workspaceId}/`;
    if (
      source.protocol !== "https:" ||
      source.origin !== storageOrigin ||
      !source.pathname.includes(expectedPath)
    )
      throw new Error();
  } catch {
    throw new MetaError(
      "Creative source must be a signed URL from the workspace Meta creative bucket",
      400,
      "validation",
    );
  }
}

export async function fetchAllPages<T = JsonObject>(
  path: string,
  options: {
    token: string;
    query?: Record<string, unknown>;
    maxPages?: number;
  },
): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = path;
  let query = options.query;
  let page = 0;
  const maxPages = options.maxPages ?? 100;
  while (next && page < maxPages) {
    if (next.startsWith("http")) {
      const safeNext = new URL(next);
      safeNext.searchParams.delete("access_token");
      safeNext.searchParams.delete("appsecret_proof");
      next = safeNext.toString();
    }
    const payload = await metaRequest<{
      data?: T[];
      paging?: { next?: string };
    }>(next, { token: options.token, query });
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));
    next = payload.paging?.next ?? null;
    query = undefined;
    page += 1;
  }
  return rows;
}

export async function activeConnection(
  client: SupabaseClient,
  workspaceId: string,
): Promise<{ id: string; accessToken: string; row: JsonObject }> {
  const { data, error } = await client
    .from("meta_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.access_token_encrypted)
    throw new MetaError("Connect Meta before continuing", 409, "configuration");
  return {
    id: String(data.id),
    accessToken: await decryptSecret(String(data.access_token_encrypted)),
    row: data as JsonObject,
  };
}

export async function writeActionLog(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    actorUserId?: string | null;
    source: string;
    sourceId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    result: string;
    requestId?: string;
    error?: MetaError | Error;
  },
): Promise<void> {
  await client.from("meta_action_logs").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId ?? null,
    source: input.source,
    source_id: input.sourceId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    reason: input.reason ?? null,
    before_state: input.before ?? {},
    after_state: input.after ?? {},
    result: input.result,
    provider_request_id:
      input.requestId ??
      (input.error instanceof MetaError ? input.error.providerRequestId : null),
    error_category:
      input.error instanceof MetaError ? input.error.category : null,
    error_message: input.error ? sanitizeText(input.error.message) : null,
  });
}

export function actionValue(rows: unknown, names: string[]): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total, row) => {
    if (!row || typeof row !== "object") return total;
    const item = row as JsonObject;
    return names.includes(String(item.action_type ?? ""))
      ? total + Number(item.value ?? 0)
      : total;
  }, 0);
}

export function normalizeAdAccountId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^(act_)?\d+$/.test(id))
    throw new MetaError("Ad account ID is invalid", 400, "validation");
  return id.startsWith("act_") ? id : `act_${id}`;
}
