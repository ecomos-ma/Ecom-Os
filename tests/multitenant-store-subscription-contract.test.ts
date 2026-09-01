import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("YouCan imports resolve the canonical active integration", () => {
  const webhook = read("supabase/functions/youcan-webhook/index.ts");
  const sync = read("supabase/functions/youcan-sync-orders/index.ts");
  assert.match(webhook, /integration_id/);
  assert.match(webhook, /integration\.status !== "active"/);
  assert.match(webhook, /source_integration_id/);
  assert.doesNotMatch(webhook, /searchParams\.get\("workspace_id"\)/);
  assert.match(sync, /eq\("provider", "youcan"\)/);
  assert.match(sync, /integration\.status !== "active"/);
});

test("disconnect revokes every local import path", () => {
  const disconnect = read("supabase/functions/youcan-disconnect/index.ts");
  const migration = read("supabase/migrations/20260901093000_fix_legacy_youcan_disconnect.sql");
  assert.match(disconnect, /status: "revoked"/);
  assert.match(disconnect, /enabled: false/);
  assert.match(disconnect, /youcan_webhook_id: null/);
  assert.match(migration, /update public\.integrations set status = 'revoked'/);
});

test("workspace order cache cannot publish a stale response", () => {
  const orders = read("src/contexts/OrdersContext.tsx");
  assert.match(orders, /orders:\$\{requestedWorkspaceId\}:list/);
  assert.match(orders, /activeWorkspaceRef\.current === requestedWorkspaceId/);
  assert.match(orders, /setGlobalOrders\(\[\]\)/);
  assert.match(orders, /filter: `workspace_id=eq\.\$\{workspace\.id\}`/);
});

test("tenant writes and owner-wide limits are database enforced", () => {
  const tenantMigration = read("supabase/migrations/20260901090000_multitenant_store_subscription_repair.sql");
  const capacityMigration = read("supabase/migrations/20260901094000_fix_atomic_order_capacity.sql");
  const workspaceLimitMigration = read("supabase/migrations/015_workspace_limits.sql");
  assert.match(tenantMigration, /workspace_operational_access_v1/);
  assert.match(tenantMigration, /orders_active_source_integration/);
  assert.match(tenantMigration, /product_images_workspace_insert/);
  assert.match(workspaceLimitMigration, /WORKSPACE_LIMIT_REACHED/);
  assert.match(capacityMigration, /counter\.order_count < v_order_limit/);
  assert.match(capacityMigration, /returning counter\.order_count into v_new_count/);
});

test("OAuth state is authenticated, signed, expiring, and store-bound", () => {
  const state = read("supabase/functions/youcan-generate-state/index.ts");
  const callback = read("supabase/functions/youcan-oauth-callback/index.ts");
  const oauth = read("src/lib/oauth.ts");
  assert.match(state, /authenticate\(req, client\)/);
  assert.match(state, /authorizeOperationalWorkspace/);
  assert.match(callback, /constantTimeEqual/);
  assert.match(callback, /10 \* 60 \* 1000/);
  assert.match(callback, /https:\/\/api\.youcan\.shop\/me/);
  assert.match(oauth, /view-store-info/);
});
