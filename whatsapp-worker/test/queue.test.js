import assert from "node:assert/strict";
import test from "node:test";
import { QueueProcessor } from "../src/automation/queue-processor.js";
import { ErrorCode } from "../src/utils/errors.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

class MemoryRepository {
  constructor({ sequence = ["text", "audio"], audioOnly = false } = {}) {
    this.configured = true;
    this.updates = [];
    this.messages = [];
    this.events = [];
    this.lastSent = null;
    this.context = {
      settings: { enabled: true, retry_base_seconds: 10, retry_max_seconds: 60, confirmation_message: "Hello {{customer_name}}" },
      order: { "Order ID": "22222222-2222-4222-8222-222222222222", customer_name: "Amine", customer_id: null, phone: "0612345678" },
      workspace: { name: "Shop" },
      rule: {
        text_enabled: !audioOnly,
        text_template: "Hello {{customer_name}}",
        audio_enabled: true,
        audio_recording_id: "33333333-3333-4333-8333-333333333333",
        fallback_text_enabled: true,
        fallback_text: "Voice unavailable for {{customer_name}}",
        channel_sequence: sequence,
      },
    };
  }
  async getJobContext() { return this.context; }
  async isOptedOut() { return false; }
  async getRecording() {
    return {
      id: "33333333-3333-4333-8333-333333333333",
      workspace_id: workspaceId,
      name: "confirmation.ogg",
      storage_path: `${workspaceId}/confirmation.ogg`,
      mime_type: "audio/ogg",
      file_size: 42,
      duration_seconds: 3,
    };
  }
  async downloadRecording() { throw new Error("storage unavailable"); }
  async updateJob(_id, _workspaceId, values) { this.updates.push(structuredClone(values)); }
  async logMessage(values) { this.messages.push(values); }
  async logEvent(values) { this.events.push(values); }
  async updateLastMessageSent(_workspaceId, value) { this.lastSent = value; }
}

class MemorySessionManager {
  constructor({ failSend = false } = {}) { this.sent = []; this.failSend = failSend; }
  getState() { return { connection_status: "ready" }; }
  async isRegistered() { return { registered: true, jid: "212612345678@s.whatsapp.net" }; }
  async sendText(_workspaceId, jid, text) {
    if (this.failSend) throw new Error("socket closed after write");
    const result = { id: `text-${this.sent.length + 1}` };
    this.sent.push({ kind: "text", jid, text });
    return result;
  }
  async sendVoice(_workspaceId, jid, audio) {
    const result = { id: `voice-${this.sent.length + 1}` };
    this.sent.push({ kind: "voice", jid, audio });
    return result;
  }
}

function job(overrides = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    workspace_id: workspaceId,
    order_id: "22222222-2222-4222-8222-222222222222",
    rule_id: "55555555-5555-4555-8555-555555555555",
    phone: "0612345678",
    normalized_phone: "212612345678",
    message_type: "confirmation",
    channel_sequence: ["text", "audio"],
    payload: {},
    attempts: 1,
    max_attempts: 3,
    ...overrides,
  };
}

function processor(repository, sessionManager) {
  return new QueueProcessor({
    repository,
    sessionManager,
    config: { workerId: "test-worker", pollMs: 3000, staleJobMinutes: 10, claimLimit: 1, version: "3.0.0", provider: "baileys" },
    logger: { error() {}, warn() {}, info() {} },
  });
}

test("text then inaccessible audio keeps one text, logs fallback, and completes", async () => {
  const repository = new MemoryRepository();
  const sessions = new MemorySessionManager();
  await processor(repository, sessions).processJob(job());

  assert.deepEqual(sessions.sent.map((item) => item.kind), ["text"]);
  assert.equal(sessions.sent[0].text, "Hello Amine");
  assert.equal(repository.messages.length, 1);
  assert.ok(repository.events.some((event) => event.event_type === "audio_fallback"));
  assert.ok(repository.updates.some((update) => update.status === "sent"));
  assert.ok(repository.lastSent);
});

test("audio-only inaccessible media sends fallback text once", async () => {
  const repository = new MemoryRepository({ sequence: ["audio"], audioOnly: true });
  const sessions = new MemorySessionManager();
  await processor(repository, sessions).processJob(job({ channel_sequence: ["audio"] }));

  assert.deepEqual(sessions.sent.map((item) => item.kind), ["text"]);
  assert.equal(sessions.sent[0].text, "Voice unavailable for Amine");
  assert.equal(repository.messages.length, 1);
  assert.equal(repository.messages[0].raw_payload.part, "audio_fallback");
});

test("provider error after the send boundary fails closed as delivery unknown", async () => {
  const repository = new MemoryRepository({ sequence: ["text"], audioOnly: false });
  repository.context.rule.audio_enabled = false;
  const sessions = new MemorySessionManager({ failSend: true });
  await processor(repository, sessions).processJob(job({ channel_sequence: ["text"] }));

  assert.ok(repository.updates.some((update) => update.error_code === ErrorCode.DELIVERY_UNKNOWN && update.status === "failed"));
  assert.ok(!repository.updates.some((update) => update.status === "pending"));
});

test("seller-authored message steps send each text in order", async () => {
  const repository = new MemoryRepository({ sequence: ["text"] });
  repository.context.rule.message_steps = [
    { id: "message-1", type: "text", text_template: "First {{customer_name}}", audio_recording_id: null },
    { id: "message-2", type: "text", text_template: "Second {{customer_name}}", audio_recording_id: null },
    { id: "message-3", type: "text", text_template: "Third {{customer_name}}", audio_recording_id: null },
  ];
  const sessions = new MemorySessionManager();
  await processor(repository, sessions).processJob(job({ channel_sequence: ["text"] }));

  assert.deepEqual(sessions.sent.map((item) => item.text), ["First Amine", "Second Amine", "Third Amine"]);
  assert.equal(repository.messages.length, 3);
  assert.ok(repository.updates.some((update) => update.status === "sent"));
});

test("a stale per-part send marker blocks automatic duplicate transmission", async () => {
  const repository = new MemoryRepository();
  const sessions = new MemorySessionManager();
  await processor(repository, sessions).processJob(job({
    send_token: "66666666-6666-4666-8666-666666666666",
    payload: { current_part: "0:text", completed_parts: [] },
  }));

  assert.equal(sessions.sent.length, 0);
  assert.ok(repository.updates.some((update) => update.error_code === ErrorCode.DELIVERY_UNKNOWN));
});
