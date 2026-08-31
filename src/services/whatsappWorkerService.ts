import { supabase } from "../lib/supabase";

export type WhatsAppWorkerAction = "connect" | "disconnect" | "status" | "test" | "reconnect" | "logout" | "send";

type WorkerRequest = {
  action: WhatsAppWorkerAction;
  workspaceId: string;
  accessToken?: string;
  payload?: Record<string, unknown>;
};

const VALID_WHATSAPP_STATUS = new Set([
  "disconnected",
  "initializing",
  "qr_required",
  "authenticated",
  "ready",
  "reconnecting",
  "error",
]);

// Use local worker in development, production Edge Function otherwise
const useLocalWorker = import.meta.env.DEV;
const LOCAL_WORKER_URL = "/api/whatsapp-worker";

async function safeJsonResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: response.ok,
      status: response.status,
      empty: true
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Worker returned invalid JSON (${response.status})`);
  }
}

async function getValidWhatsAppSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  let currentSession = session;

  if (!currentSession?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token) {
      throw new Error("AUTH_SESSION_INVALID");
    }
    currentSession = refreshed.data.session;
  }

  const token = currentSession.access_token;
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("AUTH_TOKEN_MALFORMED");
  }

  return currentSession;
}

export function normalizeWhatsAppStatus(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") {
    if (typeof value === "object" && value && value !== null) {
      const candidate = value as Record<string, unknown>;
      const direct = candidate.connection_status ?? candidate.status ?? candidate.state ?? candidate.connectionStatus;
      if (direct !== undefined) return normalizeWhatsAppStatus(direct, fallback);
      if (candidate.connected === true) return "ready";
      if (candidate.connected === false && typeof candidate.worker_available === "boolean" && !candidate.worker_available) return "error";
      return fallback;
    }

    if (value === true) return "ready";
    if (value === false) return fallback;
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;

  const mapped: Record<string, string> = {
    connected: "ready",
    ready: "ready",
    qr_ready: "qr_required",
    waiting_for_qr: "qr_required",
    qr_required: "qr_required",
    qrrequired: "qr_required",
    authenticated: "authenticated",
    auth_failure: "error",
    authfailed: "error",
    initializing: "initializing",
    reconnecting: "reconnecting",
    disconnected: "disconnected",
    error: "error",
    logged_out: "disconnected",
    logout: "disconnected",
  };

  const next = mapped[normalized] ?? normalized;
  return VALID_WHATSAPP_STATUS.has(next) ? next : fallback;
}

async function callLocalWorker(action: WhatsAppWorkerAction, workspaceId: string, payload: Record<string, unknown> = {}) {
  // Use canonical routes that match worker API
  const endpoints: Record<WhatsAppWorkerAction, string> = {
    connect: `/sessions/${workspaceId}/connect`,
    disconnect: `/sessions/${workspaceId}/disconnect`,
    status: `/sessions/${workspaceId}/status`,
    test: `/sessions/${workspaceId}/send`,
    reconnect: `/sessions/${workspaceId}/reconnect`,
    logout: `/sessions/${workspaceId}/logout`,
    send: `/sessions/${workspaceId}/send`,
  };

  const url = `${LOCAL_WORKER_URL}${endpoints[action]}`;
  const method = action === "status" ? "GET" : "POST";

  const options: RequestInit = {
    method,
  };

  // Only add Content-Type for POST requests with body
  if (method === "POST" && Object.keys(payload).length > 0) {
    options.headers = {
      "Content-Type": "application/json",
    };
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(url, options);
  const data = await safeJsonResponse(response);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `WhatsApp worker ${action} failed (${response.status})`);
  }

  const connection_status = normalizeWhatsAppStatus(data?.connection_status ?? data?.status ?? data?.state ?? data);
  return {
    ...data,
    connection_status: connection_status ?? data.connection_status ?? data.status ?? data.state ?? null,
    status: connection_status ?? data.status ?? data.state ?? null,
    state: connection_status ?? data.state ?? data.status ?? null,
    worker_available: typeof data.worker_available === "boolean" ? data.worker_available : true,
  };
}

export async function callWhatsAppWorker({ action, workspaceId, payload = {} }: WorkerRequest) {
  if (!workspaceId) throw new Error("Workspace not found");

  // Use local worker in development, production Edge Function otherwise
  if (useLocalWorker) {
    return callLocalWorker(action, workspaceId, payload);
  }

  // Production: use Supabase Edge Function
  await getValidWhatsAppSession();

  const { data, error } = await supabase.functions.invoke("whatsapp-control", {
    body: {
      action,
      workspace_id: workspaceId,
      ...payload,
    },
  });

  if (error) {
    const message = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message) : "WhatsApp control request failed.";
    throw new Error(message || "WhatsApp control request failed.");
  }

  if (!data || typeof data !== "object") return data;

  const connection_status = normalizeWhatsAppStatus(data?.connection_status ?? data?.status ?? data?.state ?? data);
  return {
    ...data,
    connection_status: connection_status ?? data.connection_status ?? data.status ?? data.state ?? null,
    status: connection_status ?? data.status ?? data.state ?? null,
    state: connection_status ?? data.state ?? data.status ?? null,
    worker_available: typeof data.worker_available === "boolean" ? data.worker_available : true,
  };
}

export async function connectWhatsApp(workspaceId: string) {
  if (!workspaceId) throw new Error("Workspace not found");

  // Local development: no auth required
  if (useLocalWorker) {
    return callLocalWorker("connect", workspaceId);
  }

  // Production: use auth and Edge Function
  const result = await callWhatsAppWorker({
    action: "connect",
    workspaceId,
  });

  if (!result || typeof result !== "object") {
    throw new Error("WhatsApp connection request failed");
  }

  if (result.error) {
    throw new Error(typeof result.error === "string" ? result.error : "WhatsApp connection request failed");
  }

  return result;
}

export async function disconnectWhatsApp(workspaceId: string) {
  if (!workspaceId) throw new Error("Workspace not found");

  // Local development: no auth required
  if (useLocalWorker) {
    return callLocalWorker("disconnect", workspaceId, { revoke_session: true });
  }

  // Production: use Edge Function
  return callWhatsAppWorker({
    action: "disconnect",
    workspaceId,
    payload: { revoke_session: true },
  });
}

export async function getWorkerHealth() {
  if (useLocalWorker) {
    try {
      const response = await fetch(`${LOCAL_WORKER_URL}/health`);
      return await safeJsonResponse(response);
    } catch {
      return null;
    }
  }

  // Production: health is tracked via heartbeat in database
  return null;
}
