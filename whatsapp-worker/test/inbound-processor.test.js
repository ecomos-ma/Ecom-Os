import assert from "node:assert/strict";
import test from "node:test";
import { InboundProcessor } from "../src/automation/inbound-processor.js";
import { WhatsAppAiProcessor } from "../src/automation/ai-processor.js";

const message = {
  providerEventId: "incoming-1",
  remoteJid: "212600000000@s.whatsapp.net",
  phone: "0600000000",
  text: "1",
  receivedAt: "2026-08-31T12:00:00.000Z",
  rawPayload: { message_type: "conversation" },
};

test("a normal confirmation reply is processed once and sent to the customer", async () => {
  let sentBody = null;
  const events = [];
  const processor = new InboundProcessor({
    logger: { error() {} },
    repository: {
      configured: true,
      async processInbound() { return { action: "confirm_order", order_id: "order-1", reply_text: "Confirmed" }; },
      async loadInboundTemplateContext() { return { order: null, workspace: null }; },
      async logEvent(event) { events.push(event); },
      async logMessage() {},
    },
  });

  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-1" }; } }, message);

  assert.equal(sentBody, "Confirmed");
  assert.equal(events.find((event) => event.event_type === "inbound_received")?.metadata.address_flow, false);
});

test("a normal reply uses the established confirmation handler", async () => {
  let sentBody = null;
  const processor = new InboundProcessor({
    logger: { error() {} },
    repository: {
      configured: true,
      async processInbound() { return { action: "confirm", order_id: "order-1", reply_text: "Confirmed" }; },
      async loadInboundTemplateContext() { return { order: null, workspace: null }; },
      async logEvent() {},
      async logMessage() {},
    },
  });

  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-1" }; } }, message);

  assert.equal(sentBody, "Confirmed");
});

test("an exact reply action always wins and never calls the AI fallback", async () => {
  let gatewayCalls = 0;
  const repository = {
    configured: true,
    async processInbound() { return { action: "confirm_order", order_id: "order-1", reply_text: "Confirmed by rule" }; },
    async loadInboundTemplateContext() { return { order: null, workspace: null }; },
    async logEvent() {},
    async logMessage() {},
  };
  const aiProcessor = new WhatsAppAiProcessor({
    repository,
    gateway: { async infer() { gatewayCalls += 1; return {}; } },
    logger: { warn() {} },
  });
  const processor = new InboundProcessor({
    logger: { error() {} },
    aiProcessor,
    repository,
  });

  let sentBody = null;
  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-rule" }; } }, message);

  assert.equal(sentBody, "Confirmed by rule");
  assert.equal(gatewayCalls, 0);
});

test("AI may replace only an unmatched normal result", async () => {
  const processor = new InboundProcessor({
    logger: { error() {} },
    aiProcessor: {
      async fallback(_workspaceId, _inbound, normalResult) {
        assert.equal(normalResult.action, "unmatched");
        return { action: "change_quantity", order_id: "order-1", reply_text: "Quantity updated" };
      },
    },
    repository: {
      configured: true,
      async processInbound() { return { action: "unmatched", order_id: "order-1", reply_text: null }; },
      async loadInboundTemplateContext() { return { order: null, workspace: null }; },
      async logEvent() {},
      async logMessage() {},
    },
  });

  let sentBody = null;
  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-ai" }; } }, message);
  assert.equal(sentBody, "Quantity updated");
});

test("all AI keys unavailable sends the workspace fallback with Reply Action options", async () => {
  let sentBody = null;
  const events = [];
  let orderUpdates = 0;
  const repository = {
    configured: true,
    async processInbound() { return { action: "unmatched", order_id: "order-1", reply_text: null }; },
    async loadInboundTemplateContext() { return { order: null, workspace: null }; },
    async loadAiContext() {
      return {
        aiSettings: { enabled: true, fallback_reply: "Fallback:\n{{available_options}}", fallback_show_options: true },
        replyActions: [{ name: "Confirm order", keywords: ["1"] }, { name: "Call back", keywords: ["2️⃣"] }],
        order: null, workspace: null, items: [], products: [], variants: [], statuses: [], messages: [],
      };
    },
    async executeAiAction() { orderUpdates += 1; },
    async logEvent(event) { events.push(event); },
    async logMessage() {},
  };
  const aiProcessor = new WhatsAppAiProcessor({
    repository,
    gateway: { async infer() { const error = new Error("all keys failed"); error.reasonCode = "all_keys_cooldown"; throw error; } },
    logger: { warn() {} },
  });
  const processor = new InboundProcessor({ logger: { error() {} }, aiProcessor, repository });

  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-fallback" }; } }, {
    ...message,
    providerEventId: "incoming-ai-failure",
    text: "How much is delivery?",
  });

  assert.equal(sentBody, "Fallback:\n1 — Confirm order\n2 — Call back");
  assert.equal(orderUpdates, 0);
  assert.equal(events.find((event) => event.event_type === "ai_unavailable")?.metadata.reason_code, "all_keys_cooldown");
});

test("explicit human request starts a handoff without calling AI", async () => {
  let sentBody = null;
  let aiCalls = 0;
  let handoffReason = null;
  const repository = {
    configured: true,
    async processInbound() { return { action: "unmatched", order_id: "order-1", reply_text: null }; },
    async loadAiContext() { return { aiSettings: { enabled: true, handoff_enabled: true }, order: {}, replyActions: [] }; },
    async loadInboundTemplateContext() { return { order: null, workspace: null }; },
    async executeAiHandoff(values) { handoffReason = values.reason; return { applied: true, reply_text: "A team member will call you shortly." }; },
    async logEvent() {},
    async logMessage() {},
  };
  const processor = new InboundProcessor({
    logger: { error() {} },
    repository,
    aiProcessor: new WhatsAppAiProcessor({ repository, gateway: { async infer() { aiCalls += 1; } }, logger: { warn() {} } }),
  });
  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "handoff" }; } }, { ...message, text: "بغيت نهضر مع شي واحد", providerEventId: "handoff-1" });
  assert.equal(aiCalls, 0);
  assert.equal(handoffReason, "customer_requested_human");
  assert.equal(sentBody, "A team member will call you shortly.");
});

test("confirmation plus address sends the address request without changing worker routing", async () => {
  let sentBody = null;
  const events = [];
  const processor = new InboundProcessor({
    logger: { error() {} },
    repository: {
      configured: true,
      async processInbound() {
        return {
          action: "request_address",
          order_id: "order-1",
          conversation_state: "awaiting_address",
          reply_text: "Please write your full address.",
        };
      },
      async loadInboundTemplateContext() { return { order: { address: null }, workspace: null }; },
      async logEvent(event) { events.push(event); },
      async logMessage() {},
    },
  });

  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-address-request" }; } }, message);

  assert.equal(sentBody, "Please write your full address.");
  assert.equal(events.find((event) => event.event_type === "inbound_received")?.metadata.address_flow, true);
  assert.equal(events.find((event) => event.event_type === "inbound_received")?.metadata.conversation_state, "awaiting_address");
});

test("completed address flow renders the exact saved address in the final reply", async () => {
  let sentBody = null;
  const processor = new InboundProcessor({
    logger: { error() {} },
    repository: {
      configured: true,
      async processInbound() {
        return {
          action: "confirm_with_address",
          order_id: "order-1",
          conversation_state: "completed",
          reply_text: "✅ Your order is confirmed.\n📍 Address: {{address}}",
        };
      },
      async loadInboundTemplateContext() {
        return { order: { address: "Marrakech Massira 2 Rue 14 N22" }, workspace: null };
      },
      async logEvent() {},
      async logMessage() {},
    },
  });

  await processor.handle("workspace-1", { async sendText(_jid, body) { sentBody = body; return { id: "outgoing-address-success" }; } }, {
    ...message,
    providerEventId: "incoming-address",
    text: "Marrakech Massira 2 Rue 14 N22",
  });

  assert.equal(sentBody, "✅ Your order is confirmed.\n📍 Address: Marrakech Massira 2 Rue 14 N22");
});
