import assert from "node:assert/strict";
import test from "node:test";
import { InboundProcessor } from "../src/automation/inbound-processor.js";

const message = {
  providerEventId: "incoming-1",
  remoteJid: "212600000000@s.whatsapp.net",
  phone: "0600000000",
  text: "3",
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
