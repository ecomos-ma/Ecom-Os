import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { WhatsAppAiGateway } from "../src/ai/gateway.js";

async function encryptedCredential(value, material) {
  const digest = createHash("sha256").update(`ecomos-tools:${material}`).digest();
  const key = await webcrypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return {
    credential_ciphertext: Buffer.from(cipher).toString("base64"),
    credential_iv: Buffer.from(iv).toString("base64"),
  };
}

test("Gemini gateway cools down a rate-limited key and fails over to the next key", async () => {
  const encryptionKey = "test-only-encryption-material";
  const first = { id: "provider-1", endpoint: "https://gemini.example/v1beta", ...await encryptedCredential("key-one", encryptionKey) };
  const second = { id: "provider-2", endpoint: "https://gemini.example/v1beta", ...await encryptedCredential("key-two", encryptionKey) };
  const results = [];
  const requestedKeys = [];
  const repository = {
    async listAiProviders() { return [first, second]; },
    async recordAiProviderResult(id, result) { results.push({ id, ...result }); },
  };
  const gateway = new WhatsAppAiGateway({
    repository,
    config: { toolsEncryptionKey: encryptionKey, serviceRoleKey: "", aiTimeoutMs: 5000, aiModel: "gemini-3.6-flash" },
    logger: { warn() {} },
    async fetchImpl(_url, options) {
      requestedKeys.push(options.headers["x-goog-api-key"]);
      if (requestedKeys.length === 1) return new Response('{"error":"rate limited"}', { status: 429 });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ intent: "confirm_order", confidence: 0.99, parameters: {}, needs_clarification: false, reply_text: "Confirmed" }) }] } }],
      }), { status: 200 });
    },
  });

  const decision = await gateway.infer({ workspace: { id: "workspace-1" }, aiSettings: { enabled: true, permissions: {} } }, "1");

  assert.equal(decision.intent, "confirm_order");
  assert.equal(decision.providerId, "provider-2");
  assert.deepEqual(requestedKeys, ["key-one", "key-two"]);
  assert.equal(results[0].id, "provider-1");
  assert.equal(results[0].success, false);
  assert.equal(results[0].cooldownSeconds, 300);
  assert.equal(results[1].success, true);
});

test("Gemini gateway accepts a JSON object prefixed with a presentation label", async () => {
  const encryptionKey = "test-only-encryption-material";
  const provider = { id: "provider-1", endpoint: "https://gemini.example/v1beta", ...await encryptedCredential("key-one", encryptionKey) };
  const results = [];
  const repository = {
    async listAiProviders() { return [provider]; },
    async recordAiProviderResult(id, result) { results.push({ id, ...result }); },
  };
  const gateway = new WhatsAppAiGateway({
    repository,
    config: { toolsEncryptionKey: encryptionKey, serviceRoleKey: "", aiTimeoutMs: 5000, aiModel: "gemini-3.6-flash" },
    logger: { warn() {} },
    async fetchImpl() {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: `JSON\n${JSON.stringify({ intent: "question", confidence: 0.8, parameters: {}, needs_clarification: false, reply_text: "Answer" })}` }] } }],
      }), { status: 200 });
    },
  });

  const decision = await gateway.infer({ workspace: { id: "workspace-1" }, aiSettings: { enabled: true, permissions: {} } }, "How much?");

  assert.equal(decision.intent, "question");
  assert.equal(decision.reply_text, "Answer");
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);
});
