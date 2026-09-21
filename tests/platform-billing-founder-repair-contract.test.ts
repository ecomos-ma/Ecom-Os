import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260921092802_fix_subscription_rpc_ambiguity_and_founder_entitlement.sql",
  "utf8",
);

test("removes the subscription overload that made one-argument RPC calls ambiguous", () => {
  assert.match(
    migration,
    /drop function if exists public\.get_effective_subscription_v1\(uuid, boolean\)/,
  );
});

test("founder re-registration receives a hidden unlimited active entitlement", () => {
  assert.match(migration, /'amineelaaouamecom@gmail\.com'/);
  assert.match(migration, /'Founder', 'Internal founder entitlement/);
  assert.match(migration, /is_public = false/);
  assert.match(migration, /'active', 'waived'/);
  assert.match(migration, /case when v_is_founder then 'founder' else 'owner' end/);
});

test("platform campaign reporting includes Legacy Meta campaigns", () => {
  assert.match(migration, /from public\.meta_legacy_campaigns legacy/);
  assert.match(migration, /join public\.meta_legacy_connections connection/);
});
