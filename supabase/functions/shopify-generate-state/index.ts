import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { authenticate, authorizeOperationalWorkspace, corsHeaders, errorResponse, json, requireUuid, serviceClient } from "../_shared/security.ts";
import { shopifyOAuthConfig } from "../_shared/shopify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const supabase = serviceClient();
    const user = await authenticate(req, supabase);
    const body = await req.json();
    
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const shopDomain = String(body.shop_domain || "").trim().toLowerCase();
    
    if (!shopDomain.endsWith(".myshopify.com")) {
      return json(req, { error: "Invalid shop domain. Must end in .myshopify.com" }, 400);
    }

    // Verify user has admin/operational access to this workspace.
    await authorizeOperationalWorkspace(supabase, user.id, workspaceId);

    // Generate cryptographically secure state
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(); // 15 mins

    // Optional: cleanup expired states for this user to keep table lean (matching YouCan)
    await supabase.from("shopify_oauth_states")
      .delete()
      .eq("user_id", user.id)
      .lt("expires_at", new Date().toISOString());

    const { error } = await supabase.from("shopify_oauth_states").insert({
      state,
      user_id: user.id,
      workspace_id: workspaceId,
      shop_domain: shopDomain,
      expires_at: expiresAt
    });

    if (error) throw new Error("Failed to generate OAuth state");

    const config = shopifyOAuthConfig();
    
    // Explicitly restricted scopes as requested
    const scopes = "read_orders,read_customers,read_products";
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${config.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`;

    return json(req, { url: authUrl });
  } catch (err) {
    return errorResponse(req, err);
  }
});
