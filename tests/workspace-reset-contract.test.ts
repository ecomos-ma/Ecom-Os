import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260830012934_full_workspace_reset_v2.sql", "utf8");
const deleteGuardMigration = readFileSync("supabase/migrations/20260830013932_fix_delete_guard_for_workspace_reset.sql", "utf8");
const secureDeleteGuardMigration = readFileSync("supabase/migrations/20260830014216_secure_workspace_delete_guard.sql", "utf8");
const auditIndexMigration = readFileSync("supabase/migrations/20260830014307_index_workspace_reset_audit_actor.sql", "utf8");
const edgeFunction = readFileSync("supabase/functions/reset-workspace/index.ts", "utf8");
const edgeSecurity = readFileSync("supabase/functions/_shared/security.ts", "utf8");
const settings = readFileSync("src/pages/Settings.tsx", "utf8");
const dangerZone = readFileSync("src/pages/settings/components/WorkspaceDangerZone.tsx", "utf8");

test("workspace page renders the full reset danger zone", () => {
  assert.match(settings, /<WorkspaceDangerZone\s*\/>/);
  assert.match(dangerZone, /reset-workspace/);
  assert.match(dangerZone, /RESET \$\{workspace\?\.name/);
});

test("reset dialog is adaptive and celebrates verified completion", () => {
  assert.match(dangerZone, /min-h-\[100dvh\]/);
  assert.match(dangerZone, /width: "min\(600px, calc\(100vw - 24px\)\)"/);
  assert.match(dangerZone, /max-w-\[600px\]/);
  assert.match(dangerZone, /safe-area-inset-top/);
  assert.match(dangerZone, /safe-area-inset-bottom/);
  assert.match(dangerZone, /createPortal/);
  assert.match(dangerZone, /document\.body/);
  assert.match(dangerZone, /useReducedMotion/);
  assert.match(dangerZone, /CONFETTI/);
  assert.match(dangerZone, /Workspace reset complete/);
});

test("database reset is service-only, owner-confirmed, dynamic and verified", () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /membership\.is_owner is true/);
  assert.match(migration, /WORKSPACE_RESET_CONFIRMATION_MISMATCH/);
  assert.match(migration, /information_schema\.columns/);
  assert.match(migration, /WORKSPACE_RESET_VERIFICATION_FAILED/);
  assert.match(migration, /revoke all on function public\.reset_workspace_data_v2[\s\S]*authenticated/i);
  assert.match(migration, /grant execute on function public\.reset_workspace_data_v2[\s\S]*service_role/i);
});

test("reset preserves identity and commercial access", () => {
  for (const table of ["workspaces", "profiles", "profile_workspaces", "workspace_subscriptions", "workspace_subscription_owners"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /owner_preserved/);
  assert.match(migration, /subscription_preserved/);
  assert.match(auditIndexMigration, /workspace_reset_audit_log \(actor_id\)/);
});

test("storage objects are removed through the Storage API, never SQL", () => {
  assert.match(edgeFunction, /client\.storage\.from\(bucket\)\.remove/);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  for (const bucket of ["product-images", "call-recordings", "whatsapp-audio", "profile-images"]) {
    assert.match(edgeFunction, new RegExp(bucket));
  }
});

test("browser preflight uses the canonical Supabase CORS headers", () => {
  assert.match(edgeSecurity, /@supabase\/supabase-js@2\.111\.0\/cors/);
  assert.match(edgeSecurity, /\.\.\.canonicalCorsHeaders/);
  assert.match(edgeSecurity, /https:\/\/ecomscale\.vercel\.app/);
  assert.match(edgeSecurity, /\.\.\.configuredOrigins/);
  assert.match(edgeSecurity, /allowedOrigins\.has\(origin\)/);
  assert.match(edgeFunction, /req\.method === "OPTIONS"/);
});

test("guarded workspace tables allow real deletes outside impersonation mode", () => {
  assert.match(deleteGuardMigration, /if tg_op = 'DELETE' then return old; end if;/i);
  assert.doesNotMatch(deleteGuardMigration, /if not public\.is_founder_internal_user\(\) then\s+return new;/i);
  assert.match(deleteGuardMigration, /set search_path = ''/i);
  assert.match(secureDeleteGuardMigration, /revoke all on function public\.block_impersonation_writes\(\) from public, anon, authenticated/i);
});
