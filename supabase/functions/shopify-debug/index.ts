import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { decryptShopifySecret } from "../_shared/shopify.ts";

serve(async (req) => {
  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    const { data: creds } = await client
      .from("shopify_credentials")
      .select("shop_domain, access_token_encrypted")
      .eq("shop_domain", "ecom-scale-test.myshopify.com")
      .maybeSingle();
      
    if (!creds) return new Response("No creds", { status: 400 });
    
    const accessToken = await decryptShopifySecret(creds.access_token_encrypted);
    
    const res = await fetch(`https://${creds.shop_domain}/admin/api/2024-01/webhooks.json`, {
      headers: { "X-Shopify-Access-Token": accessToken }
    });
    
    const json = await res.json();
    return new Response(JSON.stringify(json, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
});
