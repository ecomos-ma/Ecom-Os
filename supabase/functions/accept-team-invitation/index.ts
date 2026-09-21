import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responseHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = new Set([
    "https://www.ecomos.ma",
    "https://ecomos.ma",
    "http://localhost:5173",
    "http://localhost:8080",
  ]);
  return {
    ...baseHeaders,
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

function publicMessage(message: string) {
  if (message.includes("INVITATION_NOT_FOUND")) return "This invitation link is invalid.";
  if (message.includes("INVITATION_EMAIL_MISMATCH")) return "Sign in with the email address that received this invitation.";
  if (message.includes("INVITATION_EXPIRED")) return "This invitation has expired. Ask the workspace owner for a new link.";
  if (message.includes("INVITATION_REVOKED") || message.includes("INVITATION_NOT_AVAILABLE")) return "This invitation is no longer available.";
  if (message.includes("TEAM_MEMBER_LIMIT_REACHED")) return "This workspace has reached its team member limit.";
  if (message.includes("INVITER_NO_LONGER_AUTHORIZED") || message.includes("WORKSPACE_NOT_AVAILABLE")) return "This workspace can no longer accept the invitation.";
  return "The invitation could not be accepted. Please try again or ask the workspace owner for a new link.";
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(request) });
  if (request.method !== "POST") return json(request, { success: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const invitationId = String(body?.token || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
      return json(request, { success: false, error: "This invitation link is invalid." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey) throw new Error("Invitation service is not configured");
    if (!authorization.startsWith("Bearer ")) return json(request, { success: false, error: "Sign in to accept this invitation." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json(request, { success: false, error: "Your session has expired. Sign in again." }, 401);

    const { error } = await userClient.rpc("accept_workspace_invitation", { p_invitation_id: invitationId });
    if (error) {
      console.error("accept_workspace_invitation failed", { code: error.code, message: error.message });
      return json(request, { success: false, error: publicMessage(error.message || "") }, 400);
    }

    return json(request, { success: true, message: "Invitation accepted.", invitation_id: invitationId });
  } catch (error) {
    console.error("accept-team-invitation failed", error instanceof Error ? error.message : error);
    return json(request, { success: false, error: "The invitation service is temporarily unavailable." }, 500);
  }
});
