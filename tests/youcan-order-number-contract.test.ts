import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260909213901_canonical_source_order_numbers.sql");
const youcan = read("supabase/functions/_shared/youcan.ts");
const sheetsWebhook = read("supabase/functions/google-sheets-webhook/index.ts");
const sheetsFast = read("supabase/functions/sync-google-sheets-fast/index.ts");
const sheetsFull = read("supabase/functions/sync-google-sheets-orders/index.ts");

test("seller order numbers are sequential per workspace and source", () => {
  assert.match(migration, /PARTITION BY o\.workspace_id, public\.canonical_order_source_v1/);
  assert.match(migration, /WHEN 'youcan' THEN 'YC'/);
  assert.match(migration, /WHEN 'google_sheets' THEN 'GS'/);
  assert.match(migration, /WHEN 'shopify' THEN 'SF'/);
  assert.match(migration, /NEW\.order_number := v_display_id/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS orders_workspace_display_order_id_idx/);
});

test("provider identifiers never overwrite the canonical display number", () => {
  assert.doesNotMatch(youcan, /order_number:\s*`#YC-/);
  assert.doesNotMatch(sheetsWebhook, /order_number:\s*mapped\.order_number/);
  assert.doesNotMatch(sheetsFast, /orderPayload\.order_number\s*=/);
  assert.doesNotMatch(sheetsFull, /orderPayload\.order_number\s*=/);
  assert.match(sheetsWebhook, /external_order_id:/);
  assert.match(sheetsWebhook, /onConflict: "workspace_id,sync_key"/);
});

test("the sequence allocator is not executable by sellers", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.next_order_display_sequence_v1\(uuid, text\) FROM PUBLIC, anon, authenticated/);
});
