import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/pages/Confirmation.tsx");
const hook = read("src/hooks/useConfirmationCRM.ts");
const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");
const service = read("src/services/confirmationCrmService.ts");
const table = read("src/pages/confirmation/ConfirmationOrdersTable.tsx");
const whatsappService = read("src/services/whatsappWorkerService.ts");
const customerMigration = read("supabase/migrations/20260910094105_confirmation_customer_profile_editor.sql");
const styles = read("src/index.css");

test("Pending is the default and appears before All", () => {
  assert.match(hook, /useState<"all" \| CanonicalStatus>\("pending"\)/);
  assert.ok(page.indexOf('id === "pending"') < page.indexOf('changeStatusTab("all")'));
});

test("focus mode is the default full-width confirmation workspace", () => {
  assert.match(page, /return "focus"/);
  assert.match(page, /presentation="focus"/);
  assert.match(page, /Focus mode/);
  assert.match(drawer, /focusMode \? "relative flex h-full w-full flex-col bg-base-surface"/);
  assert.match(drawer, /Order list/);
});

test("Confirmation reads the canonical seller-facing order ID", () => {
  assert.match(service, /display_order_id/);
  assert.match(service, /row\.display_order_id \|\| row\.order_number/);
});

test("agents can queue the configured status message beside each customer", () => {
  assert.match(page, /sendOrderStatusWhatsAppMessage/);
  assert.match(page, /sendingWhatsAppOrderId/);
  assert.match(drawer, /Send live message/);
  assert.match(drawer, /whatsappLogo/);
  assert.match(table, /Send live WhatsApp message to/);
  assert.match(whatsappService, /action: "send_order_status"/);
  assert.doesNotMatch(drawer, /https:\/\/wa\.me/);
});

test("changing a status tab clears the focused order and shows only that tab's cached rows", () => {
  assert.match(page, /const changeStatusTab[\s\S]*setSelectedOrder\(null\)[\s\S]*crm\.setStatus\(nextStatus\)/);
  assert.match(hook, /const setStatus = useCallback[\s\S]*orderCacheKey\(workspaceId, userId, canManage, nextStatus[\s\S]*setOrders\(cached\?\.orders \?\? \[\]\)[\s\S]*setLoading\(!cached\)[\s\S]*setStatusState\(nextStatus\)/);
});

test("confirmation status updates use the production audit fields without debug payload logging", () => {
  assert.match(service, /payload\.confirmation_source = ["']human["']/);
  assert.match(service, /payload\.confirmed_by_user_id = actorId \?\? null/);
  assert.doesNotMatch(service, /DEBUG Confirmation/);
});

test("confirmation agents can edit customer contact and delivery details atomically", () => {
  assert.match(drawer, /aria-label="Edit customer information"/);
  assert.match(drawer, /Add the customer's delivery address manually/);
  assert.match(service, /rpc\("update_confirmation_customer_profile"/);
  assert.match(customerMigration, /workspace_operational_access_v1\(p_workspace_id\)/);
  assert.match(customerMigration, /and o\."Order ID" = p_order_id/);
  assert.match(customerMigration, /address_source = 'confirmation_agent'/);
  assert.match(customerMigration, /revoke all on function public\.update_confirmation_customer_profile/);
  assert.match(drawer, /Type the delivery address/);
  assert.match(drawer, /Auto-saves as you type/);
  assert.match(drawer, /setTimeout\(\(\) => \{/);
  assert.match(drawer, /void persistAddress\(addressDraft\)/);
});

test("confirmation notes stay visible across a customer's orders", () => {
  assert.match(service, /customer_id\.eq\.\$\{order\.customerId\},order_id\.eq\.\$\{order\.id\}/);
  assert.match(drawer, /Note saved to the customer history/);
  assert.match(customerMigration, /confirmation_notes_customer_created_idx/);
  assert.match(customerMigration, /set customer_id = o\.customer_id/);
});

test("save and next uses one notification and clearly identifies the newly loaded order", () => {
  assert.doesNotMatch(drawer, /toast\.success\("Confirmation status saved\."\)/);
  assert.match(drawer, /statusFeedback === "saved"/);
  assert.match(drawer, /Next order/);
  assert.match(drawer, /Confirm & next order/);
  assert.match(drawer, /\{nextOrder\.orderNumber\}/);
  assert.match(drawer, /Confirm & finish queue/);
  assert.doesNotMatch(page, /setOrderSwitch\(\{ phase: "leaving"/);
  assert.match(page, /setOrderSwitch\(\{ phase: "entering"/);
  assert.match(page, /const serverNext = result\.nextOrderId/);
  assert.match(page, /anticipatedNext\?\.id === result\.nextOrderId/);
  assert.match(page, /: await crm\.findOrder\(result\.nextOrderId\)/);
  assert.match(page, /const target = serverNext \?\? fallbackNext/);
  assert.match(page, /setSelectedOrder\(target\)/);
});

test("the next order is identified with a non-blocking transition", () => {
  assert.match(page, /setSelectedOrder\(target\);[\s\S]*setOrderSwitch\(\{ phase: "entering"/);
  assert.match(page, /\}, 1800\)/);
  assert.match(drawer, /<aside key=\{order\.id\}/);
  assert.match(drawer, /isNextOrder \? "confirmation-next-enter"/);
  assert.match(drawer, /isNextOrder \? "Next order" : "Current order"/);
  assert.match(drawer, /orderHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(styles, /@keyframes confirmation-next-enter/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*confirmation-next-enter/);
});
