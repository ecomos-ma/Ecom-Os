import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildBlockedGuardScript, buildCustomerGuardScript } from "../supabase/functions/anti-fake-orders/guard-script.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Anti-Fake Orders is reachable from the workspace app and sidebar", () => {
  const app = read("src/App.tsx");
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(app, /path="\/anti-fake-orders"/);
  assert.match(app, /<AntiFakeOrders\s*\/>/);
  assert.match(sidebar, /to:\s*"\/anti-fake-orders"/);
  assert.match(sidebar, /labelKey:\s*"navigation\.antiFakeOrders"/);
});

test("the generated YouCan installer is asynchronous and never hides normal visitors", () => {
  const service = read("src/services/antiFakeOrdersService.ts");
  assert.match(service, /https:\/\/www\.ecomos\.ma\/api\/anti-fake-orders/);
  assert.doesNotMatch(service, /supabase\.co\/functions\/v1\/anti-fake-orders/);
  assert.match(service, /<!-- EcomOS Anti-Fake Orders/);
  assert.match(service, /href="\$\{escapedOrigin\}"/);
  assert.match(service, /src="\$\{escapedSource\}"/);
  assert.doesNotMatch(service, /document\.createElement\(|document\.write/);
});

test("YouCan installation URLs escape ampersands without double escaping and preserve params", () => {
  const source = "https://demo.supabase.co/functions/v1/anti-fake-orders?site_key=site_key_123&host=demo-store.youcan.store";
  const escaped = source.replace(/&(?!(?:amp|lt|gt|quot|#39);)/g, "&amp;");

  assert.equal(escaped, "https://demo.supabase.co/functions/v1/anti-fake-orders?site_key=site_key_123&amp;host=demo-store.youcan.store");
  assert.doesNotMatch(escaped, /&amp;amp;/);
  assert.match(escaped, /site_key=site_key_123&amp;host=demo-store\.youcan\.store/);
  assert.match(escaped, /^https:\/\/demo\.supabase\.co\/functions\/v1\/anti-fake-orders\?site_key=site_key_123&amp;host=demo-store\.youcan\.store$/);
});

test("public decisions use proxy IP headers, validate the store host, and fail open", () => {
  const edge = read("supabase/functions/anti-fake-orders/index.ts");
  const service = read("src/services/antiFakeOrdersService.ts");
  const proxy = read("api/anti-fake-orders.ts");
  assert.match(edge, /PUBLIC_ANTI_FAKE_ENDPOINT/);
  assert.match(edge, /"x-ecomos-client-ip", "x-forwarded-for"/);
  assert.match(proxy, /x-ecomos-client-ip/);
  assert.match(proxy, /SUPABASE_FUNCTION_URL/);
  assert.match(proxy, /Cache-Control/);
  assert.match(edge, /searchParams\.get\("host"\)/);
  assert.match(edge, /req\.headers\.get\("x-forwarded-host"\)/);
  assert.match(edge, /req\.headers\.get\("host"\)/);
  assert.match(edge, /hostMatches\(store\.hostname, requestHost\)/);
  assert.match(edge, /Public bootstrap failed open/);
  assert.match(edge, /return publicJson\(\{ blocked: false \}\)/);
  assert.match(service, /host=\$\{encodeURIComponent\(store\.hostname\)\}/);
  assert.doesNotMatch(edge, /body\.ip/);
  assert.doesNotMatch(edge, /ip:\s*ip/);
});

test("customer matching is POST-only, bounded, and does not expose the blacklist", () => {
  const edge = read("supabase/functions/anti-fake-orders/index.ts");
  const guardScript = read("supabase/functions/anti-fake-orders/guard-script.ts");
  assert.match(guardScript, /action:'customer_check'/);
  assert.match(guardScript, /method:'POST'/);
  assert.match(guardScript, /new AbortController\(\)/);
  assert.match(guardScript, /setTimeout\(function\(\)\{controller\.abort\(\)\},1200\)/);
  assert.doesNotMatch(edge, /customer-guard\?/);
});

test("the cyber prank remains a harmless visual and makes no device-compromise claims", () => {
  const page = read("src/pages/AntiFakeOrders.tsx");
  const blockedScript = buildBlockedGuardScript("cyber_prank", `Blocked </script> "visitor"`);
  const customerScript = buildCustomerGuardScript("https://example.supabase.co/functions/v1/anti-fake-orders", "a".repeat(48));
  assert.doesNotThrow(() => new Function(blockedScript));
  assert.doesNotThrow(() => new Function(customerScript));
  assert.match(blockedScript, /BROWSER SECURITY CONSOLE/);
  assert.match(blockedScript, /SIMULATION \/\/ NO DEVICE ACCESS/);
  assert.match(blockedScript, /fake-terminal:\/\/blocked-session/);
  assert.match(page, /Hack prank \(visual only\)/);
  assert.doesNotMatch(blockedScript, /webcam|microphone|fully compromised|C&C server/i);
  assert.ok(customerScript.length < 8_000, "customer guard should stay small enough for fast delivery");
});

test("database tables are tenant-bound and unavailable to browser roles", () => {
  const migration = read("supabase/migrations/20260921095612_anti_fake_orders_ip_protection.sql");
  assert.match(migration, /foreign key \(store_id, workspace_id\)/i);
  assert.match(migration, /ip_address inet/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.anti_fake_order_stores from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.anti_fake_order_rules from public, anon, authenticated/i);
});
