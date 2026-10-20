import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shipping = readFileSync(new URL("../src/pages/Shipping.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../src/pages/Orders.tsx", import.meta.url), "utf8");
const selector = readFileSync(new URL("../src/components/ShippingStatusSelect.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../src/components/DashboardAnalytics.tsx", import.meta.url), "utf8");
const globalAnalytics = readFileSync(new URL("../src/pages/admin/GlobalAnalytics.tsx", import.meta.url), "utf8");
const inventoryScanner = readFileSync(new URL("../src/components/inventory/InventoryQRScanner.tsx", import.meta.url), "utf8");

test("shipping offers only delivery phases and saves without changing confirmation", () => {
  assert.match(selector, /getAllShippingStatuses\(\)/);
  assert.match(selector, /getShippingStatusLabel\(status, language\)/);
  assert.match(shipping, /<ShippingStatusSelect/);
  assert.doesNotMatch(shipping, /<StatusSelect/);
  assert.match(shipping, /shipping_status: normalizedStatus/);
  assert.match(shipping, /delivery_status: normalizedStatus \?\? "pending"/);
  assert.doesNotMatch(shipping, /status: normalizeStatus\(/);
  assert.match(shipping, /normalizeShippingStatus\(o\.shipping_status\)/);
});

test("order editor keeps confirmation and delivery controls independent", () => {
  assert.match(orders, /<ShippingStatusSelect[\s\S]*?value=\{deliveryStatus\}/);
  assert.match(orders, /<StatusSelect[\s\S]*?value=\{status\}/);
  assert.match(orders, /if \(!hasProviderTracking && deliveryStatus !== initialDeliveryStatus\)/);
  assert.match(orders, /updatePayload\.shipping_status = nextDeliveryStatus/);
  assert.match(orders, /status: normalizeStatus\(status\)/);
});

test("delivery analytics use the delivery phase instead of confirmation status", () => {
  assert.match(analytics, /normalizeShippingStatus\(o\.shipping_status\) \|\| normalizeShippingStatus\(o\.delivery_status\)/);
  assert.doesNotMatch(analytics, /isDeliv\(o\.status\)|isShip\(o\.status\)|isRet\(o\.status\)/);
  assert.match(globalAnalytics, /normalizeShippingStatus\(order\.shipping_status\) \|\| normalizeShippingStatus\(order\.delivery_status\)/);
  assert.doesNotMatch(globalAnalytics, /getEffectiveStatus\(order\)/);
  assert.match(inventoryScanner, /order\.shipping_status \|\| order\.delivery_status/);
});
