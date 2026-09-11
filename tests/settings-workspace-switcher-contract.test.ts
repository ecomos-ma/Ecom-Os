import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(new URL("../src/components/EnhancedHeader.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/hooks/useAuth.tsx", import.meta.url), "utf8");

test("Founder customer workspaces open through audited Support Mode", () => {
  assert.match(header, /useSupportMode\(\)/);
  assert.match(header, /founderAdmin\.platformWorkspaces\(\{ pageSize: 100 \}\)/);
  assert.match(header, /platformWorkspace\?\.owner_profile_id/);
  assert.match(header, /await supportMode\.start\(/);
  assert.match(header, /Opened from Founder workspace switcher/);
  assert.match(header, /secure read-only mode/);
});

test("regular member switching keeps the membership-checked RPC path", () => {
  assert.match(header, /const switched = await switchWorkspace\(targetWorkspace\.id\)/);
  assert.match(auth, /supabase\.rpc\("switch_profile_workspace", \{ new_workspace_id: workspaceId \}\)/);
});

test("workspace clicks expose progress and cannot double submit", () => {
  assert.match(header, /switchingWorkspaceId/);
  assert.match(header, /disabled=\{Boolean\(switchingWorkspaceId\)\}/);
  assert.match(header, /animate-spin text-pink-600/);
});


