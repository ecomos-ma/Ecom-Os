// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      throw new Error("workspace_id is required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch workspace with Shopify credentials
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, shopify_shop_domain, shopify_refresh_token")
      .eq("id", workspace_id)
      .single();

    if (workspaceError || !workspace) {
      throw new Error(`Workspace not found: ${workspace_id}`);
    }

    if (!workspace.shopify_shop_domain) {
      throw new Error("Shopify shop domain not found for this workspace");
    }

    if (!workspace.shopify_refresh_token) {
      throw new Error("Shopify refresh token not found - user needs to re-authenticate");
    }

    const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID");
    const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET");

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
      throw new Error("SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET not configured in Supabase secrets");
    }

    // Refresh the access token using the refresh token
    const refreshRes = await fetch(`https://${workspace.shopify_shop_domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        refresh_token: workspace.shopify_refresh_token,
        expiring: 1, // Request expiring token with refresh capability
      }),
    });

    const responseText = await refreshRes.text();
    console.log(`[Shopify Refresh] Token refresh status: ${refreshRes.status}, body: ${responseText.substring(0, 500)}`);

    if (!refreshRes.ok) {
      throw new Error(`Shopify API error (${refreshRes.status}): ${responseText}`);
    }

    let token: any;
    try {
      token = JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON from Shopify (${refreshRes.status}): ${responseText.substring(0, 500)}`);
    }

    if (!token.access_token) {
      throw new Error("No access_token in Shopify response");
    }

    // Calculate new expiration time
    const expiresIn = token.expires_in || 3600; // Default to 60 minutes
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update workspace with new tokens
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
        shopify_access_token: token.access_token,
        shopify_refresh_token: token.refresh_token || workspace.shopify_refresh_token,
        shopify_expires_at: expiresAt,
      })
      .eq("id", workspace_id);

    if (updateError) {
      throw new Error(`Failed to update Shopify tokens: ${updateError.message}`);
    }

    console.log(`[Shopify Refresh] Successfully refreshed token for workspace ${workspace_id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      access_token: token.access_token,
      expires_at: expiresAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[Shopify Refresh] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
