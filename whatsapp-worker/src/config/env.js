import { config as loadDotEnv } from "dotenv";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function loadWorkerEnvironment() {
  loadDotEnv({ path: resolve(workerRoot, ".env"), quiet: true });
  loadDotEnv({ path: resolve(workerRoot, "..", ".env"), override: false, quiet: true });
}

function value(env, name) {
  return String(env[name] ?? "").trim();
}

function required(env, name) {
  const result = value(env, name);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function integer(env, name, fallback, minimum = 0) {
  const parsed = Number(value(env, name) || fallback);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function origins(env, mode) {
  const configured = value(env, "WORKER_ALLOWED_ORIGINS");
  const defaults = mode === "development"
    ? ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:8081", "http://127.0.0.1:8081"]
    : [];
  const result = (configured ? configured.split(",") : defaults)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (result.includes("*")) throw new Error('WORKER_ALLOWED_ORIGINS cannot contain "*"');
  return Object.freeze(result);
}

export function createWorkerConfig(env = process.env, root = workerRoot) {
  const mode = value(env, "WORKER_MODE");
  if (!new Set(["development", "production", "test"]).has(mode)) {
    throw new Error("WORKER_MODE must be explicitly set to development, production, or test");
  }

  const host = value(env, "WORKER_HOST") || (mode === "production" ? "0.0.0.0" : "127.0.0.1");
  if (mode === "development" && !LOOPBACK_HOSTS.has(host)) {
    throw new Error("Development mode must bind to a loopback host");
  }

  const sessionValue = value(env, "SESSION_STORAGE_PATH") || "sessions";
  const sessionPath = isAbsolute(sessionValue) ? resolve(sessionValue) : resolve(root, sessionValue);
  const supabaseUrl = value(env, "SUPABASE_URL") || value(env, "VITE_SUPABASE_URL") || null;
  const serviceRoleKey = value(env, "SUPABASE_SERVICE_ROLE_KEY") || null;
  const apiSecret = value(env, "WORKER_API_SECRET") || null;

  if (mode === "production") {
    required(env, "WORKER_API_SECRET");
    required(env, "SUPABASE_URL");
    required(env, "SUPABASE_SERVICE_ROLE_KEY");
  }

  return Object.freeze({
    mode,
    localDevelopment: mode === "development",
    host,
    port: integer(env, "WORKER_PORT", 5000, 1),
    allowedOrigins: origins(env, mode),
    sessionPath,
    supabaseUrl,
    serviceRoleKey,
    apiSecret,
    workerId: value(env, "WORKER_ID") || `worker-${process.pid}`,
    version: "3.0.0",
    provider: "baileys",
    pollMs: integer(env, "QUEUE_POLL_MS", 3000, 1000),
    heartbeatMs: integer(env, "HEARTBEAT_MS", 15000, 5000),
    staleJobMinutes: integer(env, "STALE_JOB_MINUTES", 10, 1),
    claimLimit: 1,
    reconnectBaseMs: integer(env, "PROVIDER_RECONNECT_BASE_MS", 1000, 250),
    reconnectMaxMs: integer(env, "PROVIDER_RECONNECT_MAX_MS", 30000, 1000),
    toolsEncryptionKey: value(env, "TOOLS_API_ENCRYPTION_KEY") || null,
    aiModel: value(env, "WHATSAPP_AI_MODEL") || "gemini-3.6-flash",
    aiTimeoutMs: integer(env, "WHATSAPP_AI_TIMEOUT_MS", 20000, 1000),
  });
}

export { workerRoot };
