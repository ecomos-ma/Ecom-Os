import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("WhatsApp UI calls the VPS worker directly instead of the Edge Function", () => {
  const modal = read("src/pages/settings/components/WhatsAppSettingsModal.tsx");
  const card = read("src/pages/settings/components/WhatsAppIntegrationCard.tsx");
  const service = read("src/services/whatsappWorkerService.ts");

  assert.doesNotMatch(modal, /functions\.invoke\(["']whatsapp-control["']/);
  assert.doesNotMatch(card, /functions\.invoke\(["']whatsapp-control["']/);
  assert.match(service, /VITE_WHATSAPP_WORKER_URL/);
  assert.match(service, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(service, /\/status\/\$\{encodeURIComponent\(workspaceId\)\}/);
});

test("worker authenticates browser users and authorizes workspace access", () => {
  const server = read("whatsapp-worker/src/api/server.js");
  const config = read("whatsapp-worker/src/config.js");

  assert.match(server, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(server, /profile_workspaces/);
  assert.match(server, /authorizeWorkspaceAccess/);
  assert.match(server, /Access-Control-Allow-Origin/);
  assert.match(server, /req\.method === "OPTIONS"/);
  assert.match(config, /WORKER_ALLOWED_ORIGINS/);
  assert.match(config, /apiSecret: configuredApiSecret/);
});

test("removed Edge Function deployment error is not user-facing", () => {
  const source = [
    read("src/pages/settings/components/WhatsAppSettingsModal.tsx"),
    read("src/pages/settings/components/WhatsAppIntegrationCard.tsx"),
    read("src/services/whatsappWorkerService.ts"),
  ].join("\n");

  assert.doesNotMatch(source, /WhatsApp control service is not deployed or its CORS origin is not configured/);
});
