import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("workspace activation repair keeps status and authorization flag synchronized", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260825170407_sync_workspace_activation_state.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /set is_active = \(status = 'active'\)/);
  assert.match(migration, /status = p_status,\s+is_active = \(p_status = 'active'\)/);
  assert.match(migration, /set search_path = ''/);
});
