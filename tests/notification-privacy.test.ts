import test from "node:test";
import assert from "node:assert/strict";
import { privatePreview, safeNotificationActionUrl, sanitizeNotificationPayload } from "../src/notifications/privacy.ts";

test("sensitive payload fields are removed", () => {
  const sanitized = sanitizeNotificationPayload({ order_id: "abc", customer_phone: "+212600000000", full_address: "secret", api_key: "secret", notes: "secret", product: "Shoes", nested: { address: "secret", sku: "SKU-1" } });
  assert.deepEqual(sanitized, { order_id: "abc", product: "Shoes", nested: { sku: "SKU-1" } });
});

test("notification text cannot retain HTML", () => {
  assert.deepEqual(sanitizeNotificationPayload({ message: "<b>Hello</b><script>alert(1)</script>" }), { message: "Helloalert(1)" });
});

test("action URL accepts internal routes and rejects external or protocol-relative routes", () => {
  assert.equal(safeNotificationActionUrl("/orders?id=1"), "/orders?id=1");
  assert.equal(safeNotificationActionUrl("https://attacker.example"), "/notifications");
  assert.equal(safeNotificationActionUrl("//attacker.example"), "/notifications");
});

test("private preview contains no supplied business data", () => {
  assert.deepEqual(privatePreview("orders"), { title: "Ecom OS", message: "You have a new orders notification in Ecom OS." });
});
