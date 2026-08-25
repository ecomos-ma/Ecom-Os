import whatsappWeb from "whatsapp-web.js";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";
import { supabase } from "../supabase/client.js";
import { handleInboundMessage, handleMessageAck } from "./events.js";

// whatsapp-web.js is CommonJS. Node 24 no longer synthesizes all of its named
// exports reliably when this worker runs as ESM, so use the default namespace.
const { Client, LocalAuth } = whatsappWeb;

const clients = new Map();
const states = new Map();
const qrCodes = new Map();
const clientStarts = new Map();

const TERMINAL_STATES = new Set(["disconnected", "error"]);

function safeWorkspaceId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "")) {
    throw new Error("Invalid workspace id");
  }
  return value;
}

async function persistStatus(workspaceId, status, values = {}) {
  states.set(workspaceId, status);
  const payload = { connection_status: status, last_error: null, ...values };
  if (status === "ready") payload.last_connected_at = new Date().toISOString();
  if (status === "disconnected") payload.last_disconnected_at = new Date().toISOString();
  const { error } = await supabase.from("whatsapp_settings").update(payload).eq("workspace_id", workspaceId);
  if (error) console.error(`[client:${workspaceId}] status persistence failed`, error.message);
}

async function createClient(workspaceId) {
  const staleClient = clients.get(workspaceId);
  if (staleClient) {
    clients.delete(workspaceId);
    qrCodes.delete(workspaceId);
    try { await staleClient.destroy(); } catch (error) { console.warn(`[client:${workspaceId}] stale destroy`, error.message); }
  }

  await persistStatus(workspaceId, "initializing", { connected_phone: null });
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `workspace-${workspaceId}`, dataPath: config.sessionPath }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  });

  clients.set(workspaceId, client);
  client.on("qr", async (qr) => {
    qrCodes.set(workspaceId, qr);
    await persistStatus(workspaceId, "qr_required");
  });
  client.on("authenticated", async () => {
    qrCodes.delete(workspaceId);
    await persistStatus(workspaceId, "authenticated");
  });
  client.on("ready", async () => {
    qrCodes.delete(workspaceId);
    const phone = client.info?.wid?.user || null;
    await persistStatus(workspaceId, "ready", { connected_phone: phone });
  });
  client.on("auth_failure", async (error) => {
    qrCodes.delete(workspaceId);
    await persistStatus(workspaceId, "error", { last_error: String(error || "Authentication failure") });
  });
  client.on("disconnected", async (reason) => {
    if (clients.get(workspaceId) === client) clients.delete(workspaceId);
    qrCodes.delete(workspaceId);
    await persistStatus(workspaceId, "disconnected", { connected_phone: null, last_error: String(reason || "Disconnected") });
  });
  client.on("message", (message) => handleInboundMessage(workspaceId, client, message).catch((error) => {
    console.error(`[client:${workspaceId}] inbound handler`, error);
  }));
  client.on("message_ack", (message, ack) => handleMessageAck(workspaceId, message, ack).catch((error) => {
    console.error(`[client:${workspaceId}] ack handler`, error);
  }));

  client.initialize().catch(async (error) => {
    if (clients.get(workspaceId) === client) clients.delete(workspaceId);
    qrCodes.delete(workspaceId);
    try { await client.destroy(); } catch {}
    await persistStatus(workspaceId, "error", { last_error: error.message });
  });
  return client;
}

export async function getOrCreateClient(workspaceId) {
  safeWorkspaceId(workspaceId);

  const existing = clients.get(workspaceId);
  if (existing && !TERMINAL_STATES.has(states.get(workspaceId))) return existing;

  const pending = clientStarts.get(workspaceId);
  if (pending) return pending;

  const start = createClient(workspaceId).finally(() => clientStarts.delete(workspaceId));
  clientStarts.set(workspaceId, start);
  return start;
}

export async function waitForConnectionState(workspaceId, timeoutMs = 12_000) {
  safeWorkspaceId(workspaceId);
  const deadline = Date.now() + timeoutMs;
  const settled = new Set(["qr_required", "authenticated", "ready", "error", "disconnected"]);

  while (Date.now() < deadline) {
    const state = getClientState(workspaceId);
    if (settled.has(state.status)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return getClientState(workspaceId);
}

export function getClient(workspaceId) {
  return clients.get(workspaceId) || null;
}

export function getClientState(workspaceId) {
  return { status: states.get(workspaceId) || "disconnected", qr: qrCodes.get(workspaceId) || null };
}

export async function disconnectClient(workspaceId, revokeSession = true) {
  safeWorkspaceId(workspaceId);
  const pendingStart = clientStarts.get(workspaceId);
  if (pendingStart) await pendingStart.catch(() => {});
  const client = clients.get(workspaceId);
  clients.delete(workspaceId);
  qrCodes.delete(workspaceId);

  if (client) {
    if (revokeSession) {
      try { await client.logout(); } catch (error) { console.warn(`[client:${workspaceId}] logout`, error.message); }
    }
    try { await client.destroy(); } catch (error) { console.warn(`[client:${workspaceId}] destroy`, error.message); }
  }

  if (revokeSession) {
    const root = resolve(config.sessionPath);
    const target = resolve(join(root, `session-workspace-${workspaceId}`));
    if (target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) {
      await rm(target, { recursive: true, force: true, maxRetries: 3 }).catch((error) => {
        console.warn(`[client:${workspaceId}] session cleanup`, error.message);
      });
    }
  }

  await persistStatus(workspaceId, "disconnected", { connected_phone: null });
}

export function connectedWorkspaceIds() {
  return [...clients.keys()];
}
