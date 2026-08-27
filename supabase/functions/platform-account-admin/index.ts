import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  HttpError,
  assertOnlyKeys,
  authenticate,
  corsHeaders,
  errorResponse,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";

type AccountAction = "ban" | "unban" | "force_logout" | "hard_delete";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const admin = serviceClient();
    const actor = await authenticate(req, admin);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["action", "target_profile_id", "reason", "ban_duration"]);
    const action = String(body.action ?? "").trim().toLowerCase() as AccountAction;
    const targetId = requireUuid(body.target_profile_id, "target_profile_id");
    const reason = String(body.reason ?? "").trim();
    if (!["ban", "unban", "force_logout", "hard_delete"].includes(action)) throw new HttpError("Unsupported account action", 400);
    if (reason.length < 8) throw new HttpError("An audit reason of at least 8 characters is required", 400);
    if (targetId === actor.id) throw new HttpError("You cannot apply this action to your own account", 403);

    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: authorization, error: authorizationError } = await userClient.rpc("platform_get_my_authorization_v1");
    if (authorizationError || !authorization?.authorized) throw new HttpError("Platform Admin authorization required", 403);
    const requiredPermission = action === "ban" || action === "unban" ? "users.ban" : action === "hard_delete" ? "users.delete" : "users.manage";
    if (!authorization.permissions?.includes(requiredPermission)) throw new HttpError(`${requiredPermission} permission required`, 403);

    const { data: protectedAssignment, error: assignmentError } = await admin
      .from("platform_admin_assignments")
      .select("profile_id")
      .eq("profile_id", targetId)
      .eq("role_key", "root_founder")
      .eq("status", "active")
      .maybeSingle();
    if (assignmentError) throw new HttpError("Root protection check failed", 500);
    if (protectedAssignment) throw new HttpError("The root Founder account is protected", 403);

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(targetId);
    if (targetError || !targetResult.user) throw new HttpError("Target Auth user was not found", 404);

    if (action === "hard_delete") {
      const [{ count: ownedCount, error: ownedError }, { count: ownerMembershipCount, error: membershipError }] = await Promise.all([
        admin.from("workspace_subscription_owners").select("workspace_id", { count: "exact", head: true }).eq("owner_user_id", targetId),
        admin.from("profile_workspaces").select("workspace_id", { count: "exact", head: true }).eq("profile_id", targetId).eq("is_owner", true),
      ]);
      if (ownedError || membershipError) throw new HttpError("Account dependency check failed", 500);
      if ((ownedCount ?? 0) > 0 || (ownerMembershipCount ?? 0) > 0) {
        throw new HttpError("This user owns a business. Transfer every workspace before hard deletion.", 409);
      }
    }

    if (action === "ban") {
      const duration = typeof body.ban_duration === "string" && /^\d+(s|m|h|d)$/.test(body.ban_duration)
        ? body.ban_duration
        : "876000h";
      const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: duration });
      if (error) throw new HttpError(`Auth ban failed: ${error.message}`, 502);
    } else if (action === "unban") {
      const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      if (error) throw new HttpError(`Auth unban failed: ${error.message}`, 502);
    }

    const { error: controlError } = await admin.rpc("platform_record_auth_action_internal_v1", {
      p_actor_id: actor.id,
      p_target_profile_id: targetId,
      p_action: action,
      p_reason: reason,
      p_metadata: { source: "platform-account-admin", target_email: targetResult.user.email ?? null },
    });
    if (controlError) throw new HttpError(`Application access update failed: ${controlError.message}`, 500);

    if (action === "hard_delete") {
      const { error } = await admin.auth.admin.deleteUser(targetId, false);
      if (error) throw new HttpError(`Auth deletion failed: ${error.message}`, 502);
    }

    return json(req, { ok: true, action, target_profile_id: targetId });
  } catch (error) {
    console.error("[platform-account-admin]", error instanceof Error ? error.message : error);
    return errorResponse(req, error);
  }
});
