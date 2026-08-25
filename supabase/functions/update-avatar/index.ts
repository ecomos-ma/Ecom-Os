// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Validate environment
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, reason: "missing_env" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse body
    const body = req.method === "POST" && req.headers.get("content-type")?.includes("json") ? await req.json().catch(() => ({})) : {};
    const { user_id: userId, avatar_url: avatarUrl } = body as { user_id?: string; avatar_url?: string };

    if (!userId || !avatarUrl) {
      return new Response(JSON.stringify({ success: false, reason: "invalid_payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create admin client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate JWT from Authorization header (optional) to ensure caller is authenticated
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ success: false, reason: "missing_jwt" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ success: false, reason: "invalid_jwt", details: authError?.message }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only allow updating the authenticated user's profile (protects misuse)
    if (authData.user.id !== userId) {
      return new Response(JSON.stringify({ success: false, reason: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Perform the profile update with service role client (bypass RLS safely)
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ success: false, reason: "db_error", details: updateError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("update-avatar function error:", err);
    return new Response(JSON.stringify({ success: false, reason: "internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
