import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rbac = readFileSync("src/lib/rbac.ts", "utf8");
const billing = readFileSync("src/pages/settings/billing/BillingCenter.tsx", "utf8");
const admin = readFileSync("src/lib/founderAdmin.ts", "utf8");

test("founder presentation follows the protected email after account recreation", () => {
  assert.match(rbac, /return email\?\.trim\(\)\.toLowerCase\(\) === FOUNDER_EMAIL/);
  assert.match(billing, /if \(isFounderAccount\)/);
  assert.match(billing, /name: "Founder"/);
  assert.match(billing, /status: "active"/);
  assert.match(billing, /payment_status: "waived"/);
});

test("admin pages fall back safely while the live database still has RPC overload 42725", () => {
  assert.match(admin, /isAmbiguousSubscriptionRpc/);
  assert.match(admin, /platformSubscriptionsWithFallback/);
  assert.match(admin, /platformUser360WithFallback/);
  assert.match(admin, /"platform_list_users_v1"/);
});
