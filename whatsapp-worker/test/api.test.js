import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createWorkerConfig } from "../src/config/env.js";
import { FakeWhatsAppProvider } from "../src/provider/fake-provider.js";
import { createWorkerRuntime } from "../src/runtime.js";
import { SessionManager } from "../src/sessions/session-manager.js";
import { UnconfiguredWhatsAppRepository } from "../src/supabase/repository.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const logger = { info() {}, warn() {}, error() {}, fatal() {}, child() { return this; } };

async function startRuntime() {
  const providers = [];
  const config = createWorkerConfig({ WORKER_MODE: "test", WORKER_ALLOWED_ORIGINS: "http://localhost:8080" }, process.cwd());
  const runtime = createWorkerRuntime({
    config,
    logger,
    repository: new UnconfiguredWhatsAppRepository(),
    authStore: { hasCredentials: async () => false, clear: async () => {} },
    providerFactory: ({ workspaceId: id }) => {
      const provider = new FakeWhatsAppProvider({ workspaceId: id, logger });
      providers.push(provider);
      return provider;
    },
  });
  const server = runtime.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { runtime, providers, server, base: `http://127.0.0.1:${address.port}` };
}

test("fresh auth retry disconnects the current socket before reconnecting", async () => {
  const events = [];
  class TrackingProvider extends FakeWhatsAppProvider {
    constructor(options) {
      super(options);
      this.disconnectCalls = 0;
      this.connectCalls = [];
    }

    async connect(options = {}) {
      this.connectCalls.push(options);
      events.push(["connect", options?.forceFreshAuth ?? false]);
      return super.connect();
    }

    async disconnect({ revoke = false } = {}) {
      this.disconnectCalls += 1;
      events.push(["disconnect", revoke]);
      return super.disconnect({ revoke });
    }
  }

  const config = createWorkerConfig({ WORKER_MODE: "test", WORKER_ALLOWED_ORIGINS: "http://localhost:8080" }, process.cwd());
  const runtime = createWorkerRuntime({
    config,
    logger,
    repository: new UnconfiguredWhatsAppRepository(),
    authStore: { hasCredentials: async () => false, clear: async () => {} },
    providerFactory: ({ workspaceId: id }) => new TrackingProvider({ workspaceId: id, logger }),
  });

  await runtime.sessionManager.connect(workspaceId);
  const provider = runtime.sessionManager.getProvider(workspaceId);
  events.length = 0;

  provider.emit("error", { code: "AUTH_SESSION_INVALID", message: "session invalid" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(provider.disconnectCalls, 1);
  assert.equal(provider.connectCalls.at(-1)?.forceFreshAuth, true);
  assert.deepEqual(events, [["disconnect", false], ["connect", true]]);
});

test("connect on an already-ready provider resynchronizes canonical database state", async () => {
  const updates = [];
  const repository = {
    configured: true,
    async updateConnectionStatus(id, state, values) { updates.push({ id, state, values }); },
  };
  const provider = new FakeWhatsAppProvider({ workspaceId, logger });
  const manager = new SessionManager({
    providerFactory: () => provider,
    repository,
    authStore: {},
    inboundProcessor: { handle() {} },
    receiptProcessor: { handle() {} },
    logger,
  });

  await manager.connect(workspaceId);
  await new Promise((resolve) => setImmediate(resolve));
  provider.emitReady();
  await new Promise((resolve) => setImmediate(resolve));
  updates.length = 0;

  const snapshot = await manager.connect(workspaceId);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(snapshot.connection_status, "ready");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].state, "ready");
  assert.equal(updates[0].values.connectedPhone, "212600000000");
});

test("health, CORS, non-blocking connect, duplicate connect, status, send and disconnect behave", async (t) => {
  const context = await startRuntime();
  t.after(() => new Promise((resolve) => context.server.close(resolve)));

  const health = await fetch(`${context.base}/health`).then((response) => response.json());
  assert.equal(health.online, true);
  assert.equal(health.provider, "baileys");
  assert.equal(health.activeSessions, 0);

  const preflight = await fetch(`${context.base}/sessions/${workspaceId}/status`, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:8080" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:8080");

  const blocked = await fetch(`${context.base}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(blocked.status, 403);

  const startedAt = performance.now();
  const connectResponse = await fetch(`${context.base}/sessions/${workspaceId}/connect`, { method: "POST" });
  const connect = await connectResponse.json();
  assert.equal(connectResponse.status, 202);
  assert.equal(connect.connection_status, "starting");
  assert.ok(performance.now() - startedAt < 500);

  const duplicateResponse = await fetch(`${context.base}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  assert.equal(duplicateResponse.status, 202);
  assert.equal(context.providers.length, 1);

  await new Promise((resolve) => setImmediate(resolve));
  const qrStatus = await fetch(`${context.base}/status/${workspaceId}`).then((response) => response.json());
  assert.equal(qrStatus.connection_status, "qr_ready");
  assert.match(qrStatus.qr, /^fake-qr-/);
  assert.equal(qrStatus.qr_revision, 1);
  assert.ok(qrStatus.qr_generated_at);

  context.providers[0].emitQr("fake-qr-refreshed");
  await new Promise((resolve) => setImmediate(resolve));
  const refreshedQr = await fetch(`${context.base}/sessions/${workspaceId}/status`).then((response) => response.json());
  assert.equal(refreshedQr.qr, "fake-qr-refreshed");
  assert.equal(refreshedQr.qr_revision, 2);
  assert.ok(refreshedQr.state_revision > qrStatus.state_revision);

  context.providers[0].emitReady();
  const readyStatus = await fetch(`${context.base}/sessions/${workspaceId}/status`).then((response) => response.json());
  assert.equal(readyStatus.connection_status, "ready");
  assert.equal(readyStatus.connected, true);

  const sendResponse = await fetch(`${context.base}/sessions/${workspaceId}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0612345678", message: "hello" }),
  });
  assert.equal(sendResponse.status, 200);
  assert.equal(context.providers[0].sent[0].text, "hello");

  const canonicalTestResponse = await fetch(`${context.base}/sessions/${workspaceId}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0612345678", message: "canonical test" }),
  });
  assert.equal(canonicalTestResponse.status, 200);
  assert.equal(context.providers[0].sent[1].text, "canonical test");

  const legacyTestResponse = await fetch(`${context.base}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId, phone: "+212 6 12 34 56 78", message: "legacy" }),
  });
  assert.equal(legacyTestResponse.status, 200);
  assert.equal(context.providers[0].sent[2].text, "legacy");

  const disconnectResponse = await fetch(`${context.base}/disconnect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId, revoke_session: true }),
  });
  assert.equal(disconnectResponse.status, 200);
  assert.equal((await disconnectResponse.json()).connection_status, "disconnected");
  assert.equal(context.runtime.sessionManager.activeCount(), 0);
});
