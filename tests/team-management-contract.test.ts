import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("team invitations support authenticated email delivery and copyable links", () => {
  const edge = read("supabase/functions/send-team-invitation/index.ts");
  const team = read("src/pages/Team.tsx");

  assert.match(edge, /authenticatedAdmin\(request\)/);
  assert.match(edge, /userClient\.rpc\("can_manage_workspace_team"/);
  assert.doesNotMatch(edge, /!\["owner", "supervisor"\]\.includes\(profile\.role\)/);
  assert.match(edge, /if \(existingProfile && existingProfile\.is_active !== false\)/);
  assert.match(edge, /body\.delivery === "link"/);
  assert.match(edge, /invite_url: inviteUrl/);
  assert.match(team, /handleInvite\("email"\)/);
  assert.match(team, /handleInvite\("link"\)/);
  assert.match(team, /Create & copy link/);
});

test("a valid invitation signup joins the owner workspace without a payment detour", () => {
  const login = read("src/pages/Login.tsx");
  const auth = read("src/hooks/useAuth.tsx");
  const migration = read("supabase/migrations/20260910104248_team_management_presence_and_permissions.sql");
  const autoAcceptance = read("supabase/migrations/20260910174306_automatic_team_invitation_acceptance.sql");

  assert.match(login, /isTeamInvite && safeReturnTo/);
  assert.match(login, /team_invitation_id: teamInvitationId/);
  assert.match(login, /!isTeamInvite && !workspaceName\.trim\(\)/);
  assert.match(migration, /invitation\.status = 'pending'/);
  assert.match(migration, /lower\(invitation\.email\) = lower\(new\.email\)/);
  assert.match(migration, /values \(new\.id, v_full_name, lower\(new\.email\), 'agent', null, true/);
  assert.match(auth, /rpc\("accept_pending_workspace_invitation"\)/);
  assert.match(autoAcceptance, /create or replace function public\.accept_pending_workspace_invitation\(\)/);
  assert.match(autoAcceptance, /lower\(invitation\.email\) = lower\(new\.email\)/);
  assert.match(autoAcceptance, /membership\.is_owner/);
});

test("team mutations and live activity are tenant scoped", () => {
  const migration = read("supabase/migrations/20260910104248_team_management_presence_and_permissions.sql");
  const hook = read("src/hooks/useTeamData.ts");
  const tracker = read("src/components/ActivityTracker.tsx");

  assert.match(migration, /can_manage_workspace_team\(p_workspace_id\)/);
  assert.match(migration, /profile_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /manage_workspace_team_member/);
  assert.match(migration, /CANNOT_CHANGE_OWN_MEMBERSHIP/);
  assert.match(hook, /supabase\.rpc\("manage_workspace_team_member"/);
  assert.match(tracker, /current_path: pathname/);
  assert.match(tracker, /action: "page_view"/);
  assert.match(tracker, /MIN_HEARTBEAT_MS = 60_000/);
});

test("microphone activity remains explicit and consented", () => {
  const recorder = read("src/pages/confirmation/CallRecorder.tsx");
  const team = read("src/pages/Team.tsx");

  const permission = recorder.indexOf("navigator.mediaDevices.getUserMedia");
  const announce = recorder.indexOf("announceCallStatus(true)");
  assert.ok(permission >= 0 && announce > permission);
  assert.match(team, /Microphone audio is never opened silently/);
  assert.match(team, /Open consented call recordings/);
});
