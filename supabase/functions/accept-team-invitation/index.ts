import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the invitation by token
    const { data: invitation, error: inviteError } = await supabase
      .from("workspace_invitations")
      .select("*")
      .eq("id", token)
      .single();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invitation" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invitation.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Invitation already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the authorization header to identify the accepting user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenUser = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!tokenUser.data.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = tokenUser.data.user.id;
    const userEmail = tokenUser.data.user.email;

    // Check if the email matches the invitation email
    if (userEmail?.toLowerCase() !== invitation.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Email does not match invitation" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already has a profile for this workspace
    const { data: existingMembership } = await supabase
      .from("profile_workspaces")
      .select("*")
      .eq("profile_id", userId)
      .eq("workspace_id", invitation.workspace_id)
      .single();

    if (existingMembership) {
      return new Response(
        JSON.stringify({ error: "Already a member of this workspace" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile_workspaces entry
    const { error: membershipError } = await supabase
      .from("profile_workspaces")
      .insert({
        profile_id: userId,
        workspace_id: invitation.workspace_id,
        is_owner: false, // Invited members are never owners
        role: invitation.role,
        status: "active",
      });

    if (membershipError) {
      console.error("Error creating membership:", membershipError);
      return new Response(
        JSON.stringify({ error: "Failed to create workspace membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update user profile with workspace info and permissions
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        workspace_id: invitation.workspace_id,
        role: invitation.role,
        allowed_sections: invitation.allowed_sections,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Don't fail completely if profile update fails, membership is created
    }

    // Mark invitation as accepted
    const { error: updateError } = await supabase
      .from("workspace_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq("id", token);

    if (updateError) {
      console.error("Error updating invitation status:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation accepted successfully",
        workspaceId: invitation.workspace_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});