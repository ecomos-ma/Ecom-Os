// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Compute HMAC SHA-256 signature
async function computeHMACSHA256(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return signatureHex;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const STATE_SIGNING_SECRET = Deno.env.get("STATE_SIGNING_SECRET");
    if (!STATE_SIGNING_SECRET) {
      throw new Error("STATE_SIGNING_SECRET not configured");
    }

    const { workspace_id, shop_domain } = await req.json();
    if (!workspace_id) {
      throw new Error("workspace_id is required");
    }
    if (!shop_domain) {
      throw new Error("shop_domain is required (e.g., 'my-store.myshopify.com')");
    }

    const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID");
    if (!SHOPIFY_CLIENT_ID) {
      throw new Error("SHOPIFY_CLIENT_ID not configured in Supabase secrets");
    }

    // Normalize shop domain (ensure it ends with .myshopify.com if not provided)
    let normalizedShopDomain = shop_domain.trim();
    if (!normalizedShopDomain.endsWith('.myshopify.com')) {
      normalizedShopDomain = `${normalizedShopDomain}.myshopify.com`;
    }

    // Generate signed state with timestamp, workspace_id, and shop_domain
    const timestamp = Date.now();
    const payload = `${timestamp}:${workspace_id}:${normalizedShopDomain}`;
    const signature = await computeHMACSHA256(payload, STATE_SIGNING_SECRET);
    const state = `${payload}:${signature}`;

    // Store shop_domain in workspaces table before redirect (for security)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ shopify_shop_domain: normalizedShopDomain })
      .eq("id", workspace_id);

    if (updateError) {
      console.error("Failed to store shop_domain:", updateError);
      throw new Error("Failed to store shop_domain in workspace");
    }

    // Generate Shopify OAuth authorize URL
    const scopes = "read_orders,read_customers,read_products";
    const redirectUri = "https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/shopify-oauth-callback";
    const authorizeUrl = `https://${normalizedShopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return new Response(JSON.stringify({ state, authorize_url: authorizeUrl, shop_domain: normalizedShopDomain }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Shopify generate state error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
