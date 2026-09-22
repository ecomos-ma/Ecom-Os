import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auth = readFileSync("src/hooks/useAuth.tsx", "utf8");
const protectedRoute = readFileSync("src/components/ProtectedRoute.tsx", "utf8");
const login = readFileSync("src/pages/Login.tsx", "utf8");
const payment = readFileSync("src/pages/Payment.tsx", "utf8");
const waiting = readFileSync("src/pages/WaitingForVerification.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260922005255_enforce_protected_founder_entitlement.sql",
  "utf8",
);

test("founder bypass is resolved before workspace billing RPCs", () => {
  const founderCheck = auth.indexOf("const founderBypass = isFounder(localProfile.role, userEmail)");
  const accessRpc = auth.indexOf('supabase.rpc("resolve_workspace_access_v1"');
  assert.ok(founderCheck > 0 && accessRpc > founderCheck);
  assert.match(auth, /if \(founderBypass\) \{[\s\S]*?setOperationalAccess\(true\)[\s\S]*?setDefaultRoute\("\/dashboard"\)/);
});

test("every public billing gate recognizes the protected founder identity", () => {
  assert.match(protectedRoute, /!founderAccess && operationalAccess !== true/);
  assert.match(login, /if \(founderAccess\) \{\s*route = "\/dashboard"/);
  assert.match(payment, /if \(founderAccess && !previewMode\) return <Navigate to="\/dashboard"/);
  assert.match(waiting, /if \(founderAccess && !previewMode\) return <Navigate to="\/dashboard"/);
});

test("database migration creates a permanent hidden waived founder entitlement", () => {
  assert.match(migration, /'amineelaaouamecom@gmail\.com'/);
  assert.match(migration, /where not exists \([\s\S]*code = 'founder'/);
  assert.doesNotMatch(migration, /on conflict \(code\)/);
  assert.match(migration, /'active', 'waived'/);
  assert.match(migration, /create trigger zz_ensure_protected_founder_entitlement/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /create or replace function public\.resolve_workspace_access_v1/);
  assert.match(migration, /effective := public\.get_effective_subscription_v1\(owner_id\)/);
  assert.doesNotMatch(migration, /get_effective_subscription_v1\(owner_id,\s*true\)/);
});
