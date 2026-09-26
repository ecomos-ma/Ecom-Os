import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260924140000_google_sheets_mapping_first_sync_gate.sql", "utf8");
const card = readFileSync("src/pages/settings/components/GoogleSheetsIntegrationCard.tsx", "utf8");
const mappingModal = readFileSync("src/pages/settings/components/GoogleSheetsMappingModal.tsx", "utf8");
const fastSync = readFileSync("supabase/functions/sync-google-sheets-fast/index.ts", "utf8");
const fullSync = readFileSync("supabase/functions/sync-google-sheets-orders/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/google-sheets-webhook/index.ts", "utf8");

test("new and changed Sheet connections cannot enter scheduled sync before approval", () => {
  assert.match(migration, /sync_enabled boolean not null default false/);
  assert.match(migration, /new\.sync_enabled := false/);
  assert.match(migration, /new\.mapping_saved_at := null/);
  assert.match(migration, /where gsc\.sync_enabled/);
  assert.match(migration, /gsc\.mapping_saved_at is not null/);
});

test("saving a mapping pauses imports and the first manual Sync starts them", () => {
  assert.match(mappingModal, /mapping_saved_at: new Date\(\)\.toISOString\(\)/);
  assert.match(mappingModal, /sync_enabled: false/);
  assert.match(card, /!credentials\?\.mapping_saved_at/);
  assert.match(card, /start_sync: true/);
  assert.match(fastSync, /!hasSavedMapping \|\| !validateFieldMappings\(fieldMappings\)/);
  assert.match(fastSync, /!credentials\.sync_enabled && !allowInitialSync/);
  assert.match(fastSync, /body\.start_sync === true && result\.errors === 0/);
});

test("legacy and webhook importers also respect the saved-mapping gate", () => {
  for (const source of [fullSync, webhook]) {
    assert.match(source, /!credentials\.mapping_saved_at \|\| !credentials\.sync_enabled/);
  }
});
