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

test("WhatsApp is route-split, mounted once, and cannot become a permanent route-error spinner", () => {
  assert.equal((layout.match(/<Outlet\s*\/>/g) ?? []).length, 1);
  assert.match(app, /const WhatsApp = lazy\(\(\) => import\("\.\/pages\/WhatsApp"\)\)/);
  assert.equal((app.match(/path="\/whatsapp"/g) ?? []).length, 1);
  assert.match(app, /<LoadablePage>[\s\S]*?<WhatsApp \/>[\s\S]*?<\/LoadablePage>/);
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
  assert.match(whatsapp, /ref=\{messageViewportRef\}/);
  assert.match(whatsapp, /viewport\.scrollTop = viewport\.scrollHeight/);
  assert.match(read("src/components/SupportTicketLauncher.tsx"), /support-ticket-launcher--whatsapp/);
  assert.match(styles, /\.support-ticket-launcher--whatsapp \{ bottom: calc\(var\(--mobile-nav-total\) \+ 4\.5rem\); \}/);
});

test("WhatsApp status defaults are editable, cover confirmation and delivery, and never bulk-save a null rule id", () => {
  const settingsModal = read("src/pages/settings/components/WhatsAppSettingsModal.tsx");
  assert.match(settingsModal, /const STATUS_RULE_PRESETS/);
  assert.match(settingsModal, /rule_key: "status-no-answer"[\s\S]*?enabled: true/);
  assert.match(settingsModal, /rule_key: "delivery-out-for-delivery"/);
  assert.match(settingsModal, /rule_key: "delivery-delivered"/);
  assert.match(settingsModal, /Every standard message is ready/);
  assert.match(settingsModal, /payload\.id = id \|\| crypto\.randomUUID\(\)/);
  assert.doesNotMatch(settingsModal, /if \(id\) payload\.id = id/);
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

test("Confirmation status messages are server-derived, workspace-scoped, and queued with the configured automation rule", () => {
  const service = read("src/services/whatsappWorkerService.ts");
  const migration = read("supabase/migrations/20260910023842_confirmation_whatsapp_manual_status_message.sql");
  assert.match(service, /action: "send_order_status"/);
  assert.match(whatsappControl, /action === "send_order_status"/);
  assert.match(whatsappControl, /authorizeWorkspaceMember\(client, user\.id, workspaceId\)/);
  assert.match(whatsappControl, /from\("orders"\)\.select\("\*"\)\.eq\("workspace_id", workspaceId\)\.eq\("Order ID", orderId\)/);
  assert.match(whatsappControl, /from\("whatsapp_automation_rules"\)/);
  assert.match(whatsappControl, /from\("whatsapp_opt_outs"\)/);
  assert.match(whatsappControl, /rule_id: rule\.id/);
  assert.match(whatsappControl, /automation_event: "manual_status"/);
  assert.doesNotMatch(whatsappControl.match(/if \(action === "send_order_status"\)[\s\S]*?return json\(req, \{ ok: true/)?.[0] ?? "", /body\.message/);
  assert.match(migration, /'status-no-answer'/);
  assert.match(migration, /array\['no_answer'\]/);
  assert.match(migration, /add column if not exists confirmation_source text/);
  assert.match(migration, /add column if not exists confirmed_by_user_id uuid/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});

test("mobile navigation is an adaptive safe-area dock on portrait and landscape phones", () => {
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /--mobile-nav-total: calc\(var\(--mobile-nav-height\) \+ max\(\.25rem, var\(--safe-bottom\)\)\)/);
  assert.match(styles, /\.mobile-bottom-nav \{[\s\S]*?bottom: 0;[\s\S]*?height: var\(--mobile-nav-total\)/);
  assert.match(styles, /\.app-main \{[\s\S]*?padding-bottom: var\(--mobile-nav-total\)/);
  assert.match(styles, /@media \(orientation: landscape\) and \(max-width: 932px\) and \(max-height: 520px\)/);
  assert.match(layout, /<main className="app-main/);
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
