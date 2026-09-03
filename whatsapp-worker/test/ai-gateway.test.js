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

function decisionEnvelope(reply = "Answered") {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intent: "question", confidence: 0.9, parameters: {}, needs_clarification: false, reply_text: reply }) }] } }] });
}

test("WhatsApp AI uses the highest-priority Groq provider when healthy", async () => {
  const material = "groq-success-material";
  const provider = { id: "groq", provider: "groq", tool_scope: "whatsapp_ai", priority: 1, endpoint: "https://groq.test/v1", ...await encryptedCredential("groq-key", material) };
  let requested = "";
  const gateway = new WhatsAppAiGateway({ repository: { async listAiProviders() { return [provider]; }, async recordAiProviderResult() {} }, config: { toolsEncryptionKey: material, aiTimeoutMs: 1000 }, logger: { warn() {} }, async fetchImpl(_url, options) { requested = options.headers.Authorization; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "question", confidence: 0.9 }) } }] }), { status: 200 }); } });
  const result = await gateway.infer({ workspace: { id: "w1" }, aiSettings: {} }, "hello");
  assert.equal(result.providerId, "groq");
  assert.equal(requested, "Bearer groq-key");
});

test("WhatsApp AI sends only the current order product and variants for contextual Darija questions", async () => {
  const material = "context-test-material";
  const provider = { id: "groq", provider: "groq", tool_scope: "whatsapp_ai", priority: 1, endpoint: "https://groq.test/v1", model: "openai/gpt-oss-20b", ...await encryptedCredential("groq-key", material) };
  let prompt = "";
  const gateway = new WhatsAppAiGateway({ repository: { async listAiProviders() { return [provider]; }, async recordAiProviderResult() {} }, config: { toolsEncryptionKey: material, aiTimeoutMs: 1000 }, logger: { warn() {} }, async fetchImpl(_url, options) {
    prompt = JSON.parse(options.body).messages[0].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "question", confidence: 0.9, parameters: { question_type: "other" }, reply_text: "عندنا Noir و Bleu" }) } }] }), { status: 200 });
  } });
  const result = await gateway.infer({ workspace: { id: "w1", name: "Nura" }, order: { "Order ID": "YC-1", total: 249, status: "pending" }, items: [{ product_id: "p1", variant_id: "v1", quantity: 1, price: 249 }], products: [{ id: "p1", name: "Produit A", price: 249 }], variants: [{ id: "v1", product_id: "p1", variant_name: "Color", variant_type: "color", variant_value: "Noir", price: 249, stock: 3 }, { id: "v2", product_id: "p1", variant_name: "Color", variant_type: "color", variant_value: "Bleu", price: 249, stock: 2 }], messages: [{ direction: "outbound", body: "Votre commande Produit A" }], aiSettings: { permissions: {} } }, "Chno alwan l3ndkom", { testOnly: true });
  assert.equal(result.reply_text, "عندنا Noir و Bleu");
  assert.match(prompt, /CURRENT_ORDER/);
  assert.match(prompt, /Produit A/);
  assert.match(prompt, /Noir/);
  assert.match(prompt, /produit ta3i/);
});

test("WhatsApp AI failover keeps the same conversation context across Groq, Cloudflare and Gemini", async () => {
  const material = "failover-test-material";
  const providers = [
    { id: "groq", provider: "groq", model: "llama-3.3-70b-versatile", tool_scope: "whatsapp_ai", priority: 1, endpoint: "https://groq.test/v1", ...await encryptedCredential("groq-key", material) },
    { id: "cf", provider: "cloudflare_workers_ai", model: "@cf/test", tool_scope: "whatsapp_ai", priority: 2, endpoint: "https://cf.test/accounts/a/ai/run/@cf/test", ...await encryptedCredential("cf-key", material) },
    { id: "gemini", provider: "gemini", model: "gemini-test", tool_scope: "whatsapp_ai", priority: 3, endpoint: "https://gemini.test/v1beta", ...await encryptedCredential("gemini-key", material) },
    { id: "landing", provider: "groq", model: "other", tool_scope: "landing_page_ai", priority: 0, endpoint: "https://wrong.test/v1", ...await encryptedCredential("wrong-key", material) },
  ];
  const calls = [];
  const repository = { async listAiProviders() { return providers; }, async recordAiProviderResult() {} };
  const context = { workspace: { id: "w1" }, messages: [{ direction: "inbound", body: "same context" }], aiSettings: { enabled: true, permissions: {} } };
  const gateway = new WhatsAppAiGateway({ repository, config: { toolsEncryptionKey: material, aiTimeoutMs: 1000 }, logger: { warn() {} }, async fetchImpl(url, options) {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
    if (calls.length <= 2) return new Response("failed", { status: 503 });
    return new Response(decisionEnvelope("Gemini answer"), { status: 200 });
  } });
  const result = await gateway.infer(context, "customer question");
  assert.equal(result.reply_text, "Gemini answer");
  assert.deepEqual(calls.map((call) => call.headers.Authorization ? "auth" : call.headers["x-goog-api-key"]), ["auth", "auth", "auth", "auth", "gemini-key"]);
  assert.ok(calls.every((call) => JSON.stringify(call.body).includes("same context") || JSON.stringify(call.body).includes("customer question")));
  assert.ok(calls.every((call) => !call.url.includes("wrong.test")));
});

test("WhatsApp AI fails over to Cloudflare after every Groq key fails", async () => {
  const material = "cf-failover-material";
  const providers = [
    { id: "g1", provider: "groq", tool_scope: "whatsapp_ai", priority: 1, endpoint: "https://groq.test/v1", ...await encryptedCredential("g1", material) },
    { id: "g2", provider: "groq", tool_scope: "whatsapp_ai", priority: 2, endpoint: "https://groq.test/v1", ...await encryptedCredential("g2", material) },
    { id: "cf", provider: "cloudflare", tool_scope: "whatsapp_ai", priority: 3, endpoint: "https://cf.test/accounts/account123/ai/run/model", ...await encryptedCredential("cf", material) },
  ];
  let count = 0;
  const gateway = new WhatsAppAiGateway({ repository: { async listAiProviders() { return providers; }, async recordAiProviderResult() {} }, config: { toolsEncryptionKey: material, aiTimeoutMs: 1000 }, logger: { warn() {} }, async fetchImpl() { count += 1; return count < 3 ? new Response("down", { status: 401 }) : new Response(JSON.stringify({ result: { response: JSON.stringify({ intent: "question", confidence: 0.8 }) } }), { status: 200 }); } });
  const result = await gateway.infer({ workspace: { id: "w1" }, aiSettings: {} }, "hello");
  assert.equal(result.intent, "question");
  assert.equal(count, 3);
});

test("WhatsApp AI hands off only after every scoped provider fails", async () => {
  const material = "all-fail-material";
  const provider = { id: "g", provider: "groq", tool_scope: "whatsapp_ai", endpoint: "https://groq.test/v1", ...await encryptedCredential("g", material) };
  const gateway = new WhatsAppAiGateway({ repository: { async listAiProviders() { return [provider]; }, async recordAiProviderResult() {} }, config: { toolsEncryptionKey: material, aiTimeoutMs: 1000 }, logger: { warn() {} }, async fetchImpl() { return new Response("down", { status: 503 }); } });
  await assert.rejects(() => gateway.infer({ workspace: { id: "w1" }, aiSettings: {} }, "hello"), /All .* providers failed/);
});
