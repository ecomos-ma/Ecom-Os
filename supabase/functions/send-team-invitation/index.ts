import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function headers(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set(["https://www.ecomos.ma", "https://ecomos.ma", "http://localhost:5173", "http://localhost:8080"]);
  return { ...corsHeaders, ...(allowed.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Vary": "Origin", "Content-Type": "application/json" };
}
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(request) });

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}
function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("Enter a valid email address");
  return email;
}
function normalizeSections(value: unknown, role: string) {
  const allowed = ["Dashboard", "Orders", "Confirmation", "Shipping", "Customers", "Products", "Inventory", "Ads Manager", "TikTok Ads", "Expenses", "COD Scenarios", "Analytics", "Team", "Settings"];
  if (role === "supervisor") return allowed;
  if (!Array.isArray(value)) return ["Dashboard"];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.includes(item)))];
}
async function authenticatedAdmin(request: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) throw new Error("Invitation service is not configured");
  const authorization = request.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  return { user, userClient, adminClient: createClient(url, service) };
}
async function getAuthority(userClient: any, adminClient: any, userId: string, workspaceId: string) {
  const { data: canManage, error: permissionError } = await userClient.rpc("can_manage_workspace_team", { p_workspace_id: workspaceId });
  if (permissionError || canManage !== true) throw new Error("You do not have permission to manage this workspace team");
  const { data: profile, error } = await adminClient.from("profiles").select("id,is_active,deleted_at,full_name,email").eq("id", userId).maybeSingle();
  if (error || !profile || profile.is_active === false || profile.deleted_at) throw new Error("You do not have permission to manage this workspace team");
  return profile;
}
async function sendEmail(apiKey: string, inviteUrl: string, email: string, name: string, inviter: string, role: string) {
  const safeName = escapeHtml(name || "there");
  const safeInviter = escapeHtml(inviter || "Your workspace owner");
  const safeRole = escapeHtml(role.replace(/_/g, " "));
  const safeUrl = escapeHtml(inviteUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ecom OS <no-reply@ecomos.ma>",
      to: email,
      subject: `${safeInviter} invited you to Ecom OS`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#321421;padding:32px"><img src="https://www.ecomos.ma/ecomos_logo_137x32.png" alt="Ecom OS" style="height:32px"><h1>Join Ecom OS</h1><p>Hi ${safeName},</p><p>${safeInviter} invited you to join their Ecom OS workspace as a <strong>${safeRole}</strong>.</p><p><a href="${safeUrl}" style="display:inline-block;background:#e73773;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Accept invitation</a></p><p>This invitation expires in 7 days. If you were not expecting it, you can ignore this email.</p></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    let providerMessage = "Resend rejected the email";
    try { providerMessage = String(JSON.parse(detail)?.message || providerMessage); } catch { /* provider returned non-JSON */ }
    throw new Error(`${providerMessage} (status ${response.status})`);
  }
  return (await response.json())?.id || null;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const { user, userClient, adminClient } = await authenticatedAdmin(request);
    const body = await request.json();
    const action = String(body.action || "create");
    const workspaceId = String(body.workspace_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error("Workspace is required");
    const inviter = await getAuthority(userClient, adminClient, user.id, workspaceId);

    if (action === "revoke") {
      const { data, error } = await adminClient.from("workspace_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", body.invitation_id).eq("workspace_id", workspaceId).eq("status", "pending").select("id,email").maybeSingle();
      if (error || !data) throw new Error("Invitation is no longer pending");
      await adminClient.from("team_audit_log").insert({ workspace_id: workspaceId, actor_id: user.id, actor_email: inviter.email, action: "invitation_revoked", target_type: "invitation", target_id: data.id, target_email: data.email });
      return json(request, { success: true, status: "revoked" });
    }

    const { data: owner } = await adminClient.from("workspace_subscription_owners").select("owner_user_id").eq("workspace_id", workspaceId).maybeSingle();
    const { data: subscription } = owner?.owner_user_id
      ? await adminClient.from("user_subscriptions").select("plan_id").eq("owner_user_id", owner.owner_user_id).maybeSingle()
      : { data: null };
    const { data: plan } = subscription?.plan_id
      ? await adminClient.from("subscription_plans").select("team_member_limit").eq("id", subscription.plan_id).maybeSingle()
      : { data: null };
    const email = normalizeEmail(body.email);
    const delivery = body.delivery === "link" ? "link" : "email";
    const role = body.role === "supervisor" ? "supervisor" : "agent";
    const allowedSections = normalizeSections(body.allowed_sections, role);
    const { data: existingProfile } = await adminClient.from("profiles").select("id,is_active").ilike("email", email).maybeSingle();
    if (existingProfile && existingProfile.is_active !== false) {
      const { data: existingMembership } = await adminClient.from("profile_workspaces").select("id").eq("profile_id", existingProfile.id).eq("workspace_id", workspaceId).eq("status", "active").maybeSingle();
      if (existingMembership) throw new Error("This person is already an active member");
    }

    const { data: currentInvite } = await adminClient.from("workspace_invitations").select("*").eq("workspace_id", workspaceId).ilike("email", email).eq("status", "pending").maybeSingle();
    const { count: activeMemberCount } = await adminClient.from("profile_workspaces").select("profile_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active");
    const { count: pendingInviteCount } = await adminClient.from("workspace_invitations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "pending");
    const teamMemberLimit = Number(plan?.team_member_limit ?? 10000);
    const otherPendingCount = Number(pendingInviteCount || 0) - (currentInvite ? 1 : 0);
    if (Number(activeMemberCount || 0) + otherPendingCount >= teamMemberLimit) throw new Error("This workspace has reached its team member limit");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let invitation;
    const invitationValues = { full_name: String(body.full_name || "").trim() || null, role, allowed_sections: allowedSections, agent_settings: body.agent_settings && typeof body.agent_settings === "object" ? body.agent_settings : {}, expires_at: expiresAt, last_sent_at: new Date().toISOString(), revoked_at: null };
    if (currentInvite) {
      const { data, error } = await adminClient.from("workspace_invitations").update(invitationValues).eq("id", currentInvite.id).select("*").single();
      if (error) throw error;
      invitation = data;
    } else {
      const inserted = await adminClient.from("workspace_invitations").insert({ workspace_id: workspaceId, email, invited_by: user.id, status: "pending", ...invitationValues }).select("*").single();
      if (!inserted.error) {
        invitation = inserted.data;
      } else if (inserted.error.code === "23505") {
        const { data: racedInvite, error: racedLookupError } = await adminClient.from("workspace_invitations").select("*").eq("workspace_id", workspaceId).ilike("email", email).eq("status", "pending").maybeSingle();
        if (racedLookupError || !racedInvite) throw new Error("A pending invitation already exists for this email");
        const { data: updatedInvite, error: updateError } = await adminClient.from("workspace_invitations").update(invitationValues).eq("id", racedInvite.id).eq("status", "pending").select("*").single();
        if (updateError || !updatedInvite) throw new Error("The pending invitation could not be updated");
        invitation = updatedInvite;
      } else {
        throw inserted.error;
      }
    }

    const appUrl = (Deno.env.get("APP_URL") || "https://www.ecomos.ma").replace(/\/+$/, "");
    const inviteUrl = `${appUrl}/invite?token=${encodeURIComponent(invitation.id)}`;
    if (delivery === "email") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) throw new Error("Email service is not configured. Create and copy an invitation link instead.");
      await sendEmail(resendApiKey, inviteUrl, email, invitation.full_name, inviter.full_name || inviter.email, role);
    }
    await adminClient.from("team_audit_log").insert({ workspace_id: workspaceId, actor_id: user.id, actor_email: inviter.email, action: delivery === "link" ? "invitation_link_created" : currentInvite ? "invitation_resent" : "invitation_created", target_type: "invitation", target_id: invitation.id, target_email: email, changes: { role, allowed_sections: allowedSections, delivery } });
    return json(request, {
      success: true,
      invitation: { id: invitation.id, email, role, status: "pending", expires_at: expiresAt, resent: Boolean(currentInvite) },
      invite_url: inviteUrl,
      delivery,
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Invitation failed" }, 400);
  }
});
