import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { serviceClient } from "../_shared/security.ts";
import { shopifyOAuthConfig, encryptShopifySecret } from "../_shared/shopify.ts";
import { frontendAppUrl } from "../_shared/app-url.ts";

function redirectToSettings(success: boolean, errorMsg?: string) {
  const baseUrl = frontendAppUrl();
  const url = new URL(`${baseUrl}/settings`);
  url.searchParams.set("integration", "shopify");
  url.searchParams.set("status", success ? "success" : "error");
  if (errorMsg) url.searchParams.set("error_message", errorMsg);
  
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() }
  });
}

// Minimal Shopify HMAC validation for the callback
async function verifyShopifyHmac(url: URL, clientSecret: string): Promise<boolean> {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;
  
  // Shopify requires removing the hmac itself, sorting, and verifying
  const params = new URLSearchParams(url.search);
  params.delete("hmac");
  params.sort();
  const message = params.toString();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return signatureHex === hmac;
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const state = url.searchParams.get("state");

  if (!code || !shop || !state) {
    return redirectToSettings(false, "Missing parameters from Shopify");
  }

  try {
    const config = shopifyOAuthConfig();
    const supabase = serviceClient();

    // 1. Verify HMAC
    const isValid = await verifyShopifyHmac(url, config.clientSecret);
    if (!isValid) return redirectToSettings(false, "Invalid Shopify signature");

    // 2. Validate and consume OAuth state
    const now = new Date().toISOString();
    const { data: stateRecord, error: stateError } = await supabase
      .from("shopify_oauth_states")
      .update({ consumed_at: now })
      .eq("state", state)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select()
      .maybeSingle();

    if (stateError || !stateRecord) {
      return redirectToSettings(false, "OAuth state invalid, expired, or already consumed");
    }

    if (stateRecord.shop_domain !== shop) {
      return redirectToSettings(false, "Shop domain mismatch");
    }

    // 3. Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      return redirectToSettings(false, "Failed to retrieve access token from Shopify");
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return redirectToSettings(false, "Invalid token response from Shopify");
    }

    // 4. Encrypt the token
    const encryptedToken = await encryptShopifySecret(tokenData.access_token);
    const scopesArray = (tokenData.scope || "").split(",").map((s: string) => s.trim());

    // 5. Upsert into credentials table securely
    const { error: upsertError } = await supabase.from("shopify_credentials").upsert({
      workspace_id: stateRecord.workspace_id,
      shop_domain: shop,
      access_token_encrypted: encryptedToken,
      token_encryption_version: 1,
      scopes: scopesArray,
      status: "active",
      updated_at: now
    }, { onConflict: "workspace_id,shop_domain" });

    if (upsertError) throw upsertError;

    return redirectToSettings(true);
  } catch (err) {
    console.error("Shopify Callback Error:", err);
    return redirectToSettings(false, "Internal server error during connection");
  }
});
