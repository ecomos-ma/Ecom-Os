import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/pages/Confirmation.tsx");
const hook = read("src/hooks/useConfirmationCRM.ts");
const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");
const service = read("src/services/confirmationCrmService.ts");

test("Pending is the default and appears before All", () => {
  assert.match(hook, /useState<"all" \| CanonicalStatus>\("pending"\)/);
  assert.ok(page.indexOf('id === "pending"') < page.indexOf('crm.setStatus("all")'));
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
