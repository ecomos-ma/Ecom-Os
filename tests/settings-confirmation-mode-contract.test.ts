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

test("changing a status tab clears the stale focused order before loading the matching queue", () => {
  assert.match(page, /const changeStatusTab[\s\S]*setSelectedOrder\(null\)[\s\S]*crm\.setStatus\(nextStatus\)/);
  assert.match(hook, /const setStatus = useCallback[\s\S]*setOrders\(\[\]\)[\s\S]*setLoading\(true\)[\s\S]*setStatusState\(nextStatus\)/);
});

test("confirmation status updates use the production audit fields without debug payload logging", () => {
  assert.match(service, /payload\.confirmation_source = 'human'/);
  assert.match(service, /payload\.confirmed_by_user_id = confirmedByUserId/);
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
