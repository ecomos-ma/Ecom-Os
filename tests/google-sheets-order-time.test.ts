import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { legacySheetSyncTime, parseSheetOrderTime } from "../supabase/functions/_shared/sheet-order-time.ts";

const fullSync = readFileSync("supabase/functions/sync-google-sheets-orders/index.ts", "utf8");
const fastSync = readFileSync("supabase/functions/sync-google-sheets-fast/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/google-sheets-webhook/index.ts", "utf8");
const analytics = readFileSync("supabase/migrations/20260924105124_google_sheet_order_hour_analytics.sql", "utf8");

test("Morocco sheet wall time becomes the matching UTC instant", () => {
  assert.equal(parseSheetOrderTime("2026-09-23 01:40:23"), "2026-09-23T00:40:23.000Z");
  assert.equal(parseSheetOrderTime("2026-09-23 23:50:48"), "2026-09-23T22:50:48.000Z");
  assert.equal(parseSheetOrderTime("2026-09-23T00:40:23Z"), "2026-09-23T00:40:23.000Z");
  assert.equal(parseSheetOrderTime("2026-09-23T01:40:23+01:00"), "2026-09-23T00:40:23.000Z");
  assert.equal(parseSheetOrderTime("2026-02-30 12:00:00"), null);
});

test("historical sync key stays stable when timestamp is corrected", () => {
  const raw = "2026-09-23 01:40:23";
  assert.equal(legacySheetSyncTime(raw, parseSheetOrderTime(raw)), "2026-09-23T01:40:23.000Z");
});

test("all sheet paths store original order time and chart is tenant-scoped", () => {
  for (const source of [fullSync, fastSync]) {
    assert.match(source, /result\.created_at = result\.order_date/);
    assert.match(source, /result\.order_received_at = result\.order_date/);
    assert.match(source, /legacySheetSyncTime/);
  }
  assert.match(webhook, /order_received_at: orderTime/);
  assert.match(analytics, /where o\.workspace_id = p_workspace_id/);
  assert.match(analytics, /at time zone 'Africa\/Casablanca'/);
  assert.match(analytics, /security invoker/);
});
