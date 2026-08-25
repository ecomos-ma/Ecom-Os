export type WhatsAppWorkerAction = "connect" | "disconnect" | "status" | "test";

type WorkerRequest = {
  action: WhatsAppWorkerAction;
  workspaceId: string;
  accessToken: string;
  payload?: Record<string, unknown>;
};

function workerBaseUrl(): string {
  const configured = (import.meta.env.VITE_WHATSAPP_WORKER_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `http://${window.location.hostname}:5000`;
  }

  throw new Error("WhatsApp worker URL is not configured. Set VITE_WHATSAPP_WORKER_URL to the HTTPS URL of your VPS worker.");
}

export async function callWhatsAppWorker({ action, workspaceId, accessToken, payload = {} }: WorkerRequest) {
  if (!workspaceId) throw new Error("Workspace not found");
  if (!accessToken) throw new Error("Your session expired. Sign in again.");

  const baseUrl = workerBaseUrl();
  const isStatus = action === "status";
  const url = isStatus
    ? `${baseUrl}/status/${encodeURIComponent(workspaceId)}`
    : `${baseUrl}/${action}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      method: isStatus ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(isStatus ? {} : { "Content-Type": "application/json" }),
      },
      body: isStatus ? undefined : JSON.stringify({ workspace_id: workspaceId, ...payload }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({ error: "Invalid response from WhatsApp worker" }));
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `WhatsApp worker returned HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("WhatsApp worker did not respond. Make sure the VPS worker is running.");
    }
    if (error instanceof TypeError) {
      throw new Error("WhatsApp worker is offline or unreachable. Start the worker and verify its HTTPS URL.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
