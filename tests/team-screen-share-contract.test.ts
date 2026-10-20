import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(new URL(path, `file:///${root.replace(/\\/g, "/")}`), "utf8");

test("Watch Live requires agent consent and a verified Ecom OS browser tab", () => {
  const ui = read("src/components/TeamScreenShare.tsx");
  const team = read("src/pages/Team.tsx");
  assert.match(team, /Request Watch Live/);
  assert.match(ui, /getDisplayMedia/);
  assert.match(ui, /getCaptureHandle/);
  assert.match(ui, /verifiedEcomOSTab\(track, workspace\.id\)/);
  assert.match(ui, /Decline/);
  assert.match(ui, /Stop Sharing/);
  assert.match(ui, /forbiddenDuringCapture/);
  assert.doesNotMatch(ui, /MediaRecorder|recordedChunks/);
});

test("screen share signaling is participant scoped and revoked on stop", () => {
  const sql = read("supabase/migrations/20261020133501_consented_team_screen_share.sql");
  const binding = read("supabase/migrations/20261020134654_screen_share_session_binding.sql");
  const realtime = read("supabase/migrations/20261020135047_screen_share_realtime_publication.sql");
  const ui = read("src/components/TeamScreenShare.tsx");
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /screen_share_signals_read/);
  assert.match(sql, /s\.status = 'accepted' and s\.expires_at > now\(\)/);
  assert.match(sql, /public\.can_manage_workspace_team\(p_workspace_id\)/);
  assert.match(sql, /TOO_MANY_SCREEN_SHARE_REQUESTS/);
  assert.match(sql, /status = 'stopped'.*expires_at = now\(\)/);
  assert.doesNotMatch(sql, /grant (all|update|delete) on public\.team_screen_share_sessions to authenticated/i);
  assert.match(binding, /viewer_auth_session_id/);
  assert.match(binding, /agent_auth_session_id/);
  assert.match(binding, /SCREEN_SHARE_AGENT_SESSION_MISMATCH/);
  assert.match(binding, /auth\.jwt\(\)/);
  assert.match(realtime, /alter publication supabase_realtime add table public\.team_screen_share_signals/);
  assert.match(ui, /team_screen_share_signals", filter: `session_id=eq\.\$\{sessionId\}`/);
});
