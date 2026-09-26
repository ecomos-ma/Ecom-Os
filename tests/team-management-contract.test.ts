import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("team invitations support authenticated email delivery and copyable links", () => {
  const edge = read("supabase/functions/send-team-invitation/index.ts");
  const team = read("src/pages/Team.tsx");
  const invite = read("src/pages/Invite.tsx");

  assert.match(edge, /authenticatedAdmin\(request\)/);
  assert.match(edge, /userClient\.rpc\("can_manage_workspace_team"/);
  assert.doesNotMatch(edge, /!\["owner", "supervisor"\]\.includes\(profile\.role\)/);
  assert.match(edge, /if \(existingProfile && existingProfile\.is_active !== false\)/);
  assert.match(edge, /body\.delivery === "link"/);
  assert.match(edge, /invite_url: inviteUrl/);
  assert.match(edge, /action === "delete"/);
  assert.match(edge, /action === "delete_all"/);
  assert.match(edge, /action: "invitations_deleted"/);
  assert.match(edge, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(team, /handleInvite\("email"\)/);
  assert.match(team, /handleInvite\("link"\)/);
  assert.match(team, /Create & copy link/);
  assert.match(team, /Generated invitation link/);
  assert.match(team, /id: "invitations"/);
  assert.match(team, /handleDeleteInvitation/);
  assert.match(team, /handleDeleteAllInvitations/);
  assert.match(team, /directDelete = await supabase/);
  assert.match(team, /await reload\(\)/);
  assert.match(invite, /supabase\.rpc\("accept_workspace_invitation"/);
  assert.match(invite, /function deployment propagates/);
});

test("invitation reloads cannot restore rows deleted by a newer request", () => {
  const hook = read("src/hooks/useTeamData.ts");

  assert.match(hook, /loadVersionRef/);
  assert.match(hook, /loadVersion !== loadVersionRef\.current/);
});

test("a valid invitation signup joins the owner workspace without a payment detour", () => {
  const login = read("src/pages/Login.tsx");
  const auth = read("src/hooks/useAuth.tsx");
  const migration = read("supabase/migrations/20260910104248_team_management_presence_and_permissions.sql");
  const autoAcceptance = read("supabase/migrations/20260910174306_automatic_team_invitation_acceptance.sql");
  const hardenedAcceptance = read("supabase/migrations/20260921142914_harden_team_invitation_acceptance.sql");
  const reliableAcceptance = read("supabase/migrations/20260921154500_reliable_team_invitation_acceptance.sql");
  const arrayTypeFix = read("supabase/migrations/20260921172000_fix_invitation_allowed_sections_array.sql");
  const acceptEdge = read("supabase/functions/accept-team-invitation/index.ts");

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
  assert.match(hardenedAcceptance, /for update/);
  assert.match(hardenedAcceptance, /TEAM_MEMBER_LIMIT_REACHED/);
  assert.match(hardenedAcceptance, /invitation_row\.role = 'supervisor'/);
  assert.doesNotMatch(reliableAcceptance, /workspace_subscription_owners/);
  assert.match(reliableAcceptance, /create or replace function public\.accept_pending_workspace_invitation\(\)/);
  assert.match(arrayTypeFix, /allowed_sections = normalized_sections/);
  assert.match(arrayTypeFix, /to_jsonb\(invitation_row\.allowed_sections\)/);
  assert.match(arrayTypeFix, /normalized_sections text\[\]/);
  assert.match(acceptEdge, /userClient\.rpc\("accept_workspace_invitation"/);
  assert.doesNotMatch(acceptEdge, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("invited signup keeps auth provisioning independent from billing records", () => {
  const migration = read("supabase/migrations/20260921172000_fix_invitation_allowed_sections_array.sql");

  assert.match(migration, /create or replace function public\.handle_new_user\(\)/);
  assert.match(migration, /team_invitation_id/);
  assert.match(migration, /v_has_invite boolean/);
  assert.match(migration, /invitation\.id = v_invitation_id/);
  assert.match(migration, /insert into public\.profiles \(\s*id, full_name, email, role, workspace_id, is_active, allowed_sections/);
  assert.match(migration, /values \(\s*new\.id, v_full_name, lower\(new\.email\), 'agent', null, true, array\[\]::text\[\]/);
  assert.doesNotMatch(migration, /allowed_sections = '\[\]'::jsonb/);

  const invitedBranchStart = migration.indexOf("if not v_is_founder and v_has_invite then");
  const invitedBranchEnd = migration.indexOf("return new;", invitedBranchStart);
  assert.ok(invitedBranchStart >= 0 && invitedBranchEnd > invitedBranchStart);
  assert.doesNotMatch(
    migration.slice(invitedBranchStart, invitedBranchEnd),
    /workspace_limits|workspace_subscriptions|user_subscriptions/
  );
});

test("subscription lookup remains unambiguous during invited-user provisioning", () => {
  const migration = read("supabase/migrations/20260921173000_remove_ambiguous_subscription_function_overload.sql");

  assert.match(migration, /drop function if exists public\.get_effective_subscription_v1\(uuid, boolean\)/);
  assert.match(
    migration,
    /drop function if exists public\.get_effective_subscription_v1\(uuid, boolean\);\s*$/m
  );
});

test("invited members never become workspace billing owners", () => {
  const migration = read("supabase/migrations/20260921180000_fix_invited_member_workspace_membership.sql");
  const billingInheritance = read("supabase/migrations/20260922011843_make_team_members_inherit_workspace_subscription.sql");
  const auth = read("src/hooks/useAuth.tsx");
  const payment = read("src/pages/Payment.tsx");

  assert.match(migration, /lower\(coalesce\(new\.role, ''\)\) in \('agent', 'supervisor'\)/);
  assert.match(migration, /values \(\s*new\.id, new\.workspace_id, false, normalized_member_role, 'active'/);
  assert.match(migration, /insert into public\.team_member_profiles \(profile_id, workspace_id\)/);
  assert.match(migration, /v_member_role := case/);
  assert.doesNotMatch(
    migration.slice(0, migration.indexOf("if not exists (")),
    /user_subscriptions|workspace_subscription_owners/
  );
  assert.match(billingInheritance, /from public\.workspace_subscription_owners billing_owner/);
  assert.match(billingInheritance, /get_effective_subscription_v1\(owner_id\)/);
  assert.doesNotMatch(billingInheritance, /get_effective_subscription_v1\(owner_id,\s*(true|false)\)/);
  assert.match(billingInheritance, /'team_member_workspace_access'/);
  assert.match(billingInheritance, /member_role = any \(array\['agent', 'supervisor'\]::text\[\]\)/);
  assert.match(auth, /isLegacyWorkspaceBillingResolverError/);
  assert.match(auth, /const hasActiveTeamMembership/);
  assert.match(auth, /membershipResult\.data\.is_owner === false/);
  assert.match(payment, /const isTeamMember = \["agent", "supervisor"\]/);
  assert.match(payment, /isTeamMember && !previewMode && !isRenewalIntent/);
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
  assert.match(hook, /Membership is the source of truth/);
  assert.match(hook, /profilesQuery\.in\("id", memberProfileIds\)/);
  assert.match(tracker, /current_path: pathname/);
  assert.match(tracker, /action: "page_view"/);
  assert.match(tracker, /MIN_HEARTBEAT_MS = 60_000/);
});

test("agent navigation is limited to the exact sections selected by the owner", () => {
  const rbac = read("src/lib/rbac.ts");
  const sidebar = read("src/components/Sidebar.tsx");
  const mobile = read("src/components/MobileAppChrome.tsx");
  const guard = read("src/components/PermissionGuard.tsx");

  assert.match(rbac, /const AGENT_ROUTE_SECTIONS/);
  assert.match(rbac, /"\/live-view": null/);
  assert.match(rbac, /"\/whatsapp": null/);
  assert.match(rbac, /"\/delivering": null/);
  assert.match(rbac, /export function canAgentAccessRoute/);
  assert.match(sidebar, /Team members see only the exact sections selected by their owner/);
  assert.match(sidebar, /section: "Orders"/);
  assert.match(sidebar, /section: "Confirmation"/);
  assert.match(sidebar, /section: "Shipping"/);
  assert.match(sidebar, /!link\.section \|\| !selectedSections\.has\(link\.section\)/);
  assert.match(sidebar, /return !hasFullNavigationAccess \|\| workspace\?\.show_shipping_column === true/);
  assert.match(mobile, /section: "Orders"/);
  assert.match(mobile, /section: "Confirmation"/);
  assert.match(mobile, /section: "Shipping"/);
  assert.match(mobile, /return can\(p\.perm, p\.section\)/);
  assert.match(guard, /canAgentAccessRoute\(profile\.allowed_sections, location\.pathname\)/);
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

test("team metrics, assignment, upsells and audit events use persisted workflow data", () => {
  const migration = read("supabase/migrations/20260922091324_team_real_agent_metrics.sql");
  const confirmationUpdateMigration = read("supabase/migrations/20260922102000_confirmation_agent_order_updates.sql");
  const hook = read("src/hooks/useTeamData.ts");
  const team = read("src/pages/Team.tsx");
  const crm = read("src/services/confirmationCrmService.ts");
  const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");
  const orders = read("src/pages/Orders.tsx");

  assert.match(migration, /with latest_assignment as/);
  assert.match(migration, /sync_order_assignment_for_team/);
  assert.match(migration, /assign_team_orders_v1/);
  assert.match(migration, /auto_assign_confirmation_orders_v1/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /p_per_agent_limit integer default 20/);
  assert.match(migration, /log_team_order_change/);
  assert.match(migration, /upsell_by_user_id/);
  assert.match(migration, /revoke all on function public\.assign_team_orders_v1/);
  assert.match(hook, /confirmation_activities/);
  assert.match(hook, /avg_response_seconds/);
  assert.match(hook, /autoAssignConfirmationOrders/);
  assert.match(hook, /assign_team_orders_v1/);
  assert.match(team, /Assign up to 20 \/ agent/);
  assert.match(team, /Avg\. first response/);
  assert.match(team, /metricView === "confirmation"/);
  assert.match(team, /visibleActivityLog/);
  assert.match(team, /\["today", "yesterday"\]/);
  assert.match(crm, /markConfirmationOrderUpsell/);
  assert.match(crm, /save_confirmation_order_v1/);
  assert.match(confirmationUpdateMigration, /ORDER_NOT_ASSIGNED_TO_AGENT/);
  assert.match(confirmationUpdateMigration, /CONFIRMATION_PERMISSION_REQUIRED/);
  assert.match(confirmationUpdateMigration, /UPSELL_TOTAL_REQUIRED/);
  assert.match(drawer, /Mark upsell/);
  assert.match(drawer, /type="checkbox"/);
  assert.match(drawer, /Adjusted order total/);
  assert.match(drawer, /Save upsell & price/);
  assert.match(orders, /Mark this order as an upsell/);
});
