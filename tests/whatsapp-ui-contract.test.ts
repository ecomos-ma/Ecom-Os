import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const layout = read("src/components/Layout.tsx");
const mobileChrome = read("src/components/MobileAppChrome.tsx");
const styles = read("src/index.css");
const whatsapp = read("src/pages/WhatsApp.tsx");
const whatsappControl = read("supabase/functions/whatsapp-control/index.ts");
const html = read("index.html");

test("WhatsApp is mounted once and cannot become a permanent route-error spinner", () => {
  assert.equal((layout.match(/<Outlet\s*\/>/g) ?? []).length, 1);
  assert.match(app, /import WhatsApp from "\.\/pages\/WhatsApp"/);
  assert.doesNotMatch(app, /lazy\(\(\) => import\("\.\/pages\/WhatsApp"\)\)/);
  assert.match(app, /Unable to open this page/);
  assert.match(app, /window\.location\.reload\(\)/);
});

test("WhatsApp inbox tolerates incomplete contacts and invalid provider timestamps", () => {
  assert.match(whatsapp, /const safeDate =/);
  assert.match(whatsapp, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(whatsapp, /const contactName =/);
  assert.match(whatsapp, /This conversation has no valid WhatsApp number/);
});

test("WhatsApp composer stays viewport-bound and sends recorded audio through the secure queue", () => {
  assert.match(layout, /lockScroll=\{isWhatsAppInbox \|\| isLiveView\}/);
  assert.match(layout, /lockScroll \? "h-full min-h-0" : "min-h-full"/);
  assert.match(whatsapp, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(whatsapp, /action: "send_audio"/);
  assert.match(whatsapp, /from\("whatsapp-audio"\)[\s\S]*\.upload\(storagePath, blob/);
  assert.match(whatsapp, /sticky bottom-0 z-20/);
  assert.match(whatsappControl, /action === "send_audio"/);
  assert.match(whatsappControl, /channel_sequence: \["audio"\]/);
  assert.match(whatsappControl, /\.eq\("workspace_id", workspaceId\)/);
});

test("WhatsApp inbox exposes real avatars, emoji, and authenticated media attachments without changing AI routing", () => {
  const workerRoutes = read("whatsapp-worker/src/api/routes.js");
  const provider = read("whatsapp-worker/src/provider/baileys-provider.js");
  const migration = read("supabase/migrations/20260909210056_whatsapp_media_storage.sql");
  assert.match(whatsapp, /avatar_url/);
  assert.match(whatsapp, /action: "profile_photo"/);
  assert.match(whatsapp, /commonEmoji\.map/);
  assert.match(whatsapp, /from\("whatsapp-media"\)\.upload/);
  assert.match(whatsapp, /action: "send_media"/);
  assert.match(whatsappControl, /action === "send_media"/);
  assert.match(workerRoutes, /send-media/);
  assert.match(workerRoutes, /profile-photo/);
  assert.match(provider, /profilePictureUrl\(jid, "image"\)/);
  assert.match(provider, /document: buffer/);
  assert.match(migration, /public = false/);
  assert.match(migration, /whatsapp_is_workspace_member/);
  assert.match(migration, /whatsapp_can_manage/);
});

test("mobile navigation is a stable five-column dock with a contained center action", () => {
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(mobileChrome, /className="mobile-nav-item"[\s\S]*aria-label="Quick actions"/);
  assert.match(mobileChrome, /className="mobile-center-fab"[\s\S]*<span>Quick<\/span>/);
});

test("only EcomOS PNG favicon references remain", () => {
  assert.doesNotMatch(html, /favicon\.ico|lovable/i);
  assert.match(html, /favicon\.png\?v=ecomos/);
  assert.equal(existsSync(new URL("../public/favicon.ico", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/icon-72-test.png", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/icon-96-test.png", import.meta.url)), false);
  const favicon = readFileSync(new URL("../public/favicon.png", import.meta.url));
  assert.deepEqual([...favicon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
