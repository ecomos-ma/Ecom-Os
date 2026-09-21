import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { 
  corsHeaders, 
  authorizeOperationalWorkspace, 
  authenticate, 
  serviceClient,
  HttpError 
} from "../_shared/security.ts";
import { decryptShopifySecret } from "../_shared/shopify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) throw new HttpError("Missing workspace_id", 400);

    const client = serviceClient();
    
    // Auth check
    const user = await authenticate(req, client);
    await authorizeOperationalWorkspace(client, user.id, workspace_id);

    // Get credentials (FIX: querying for "active", not "connected")
    const { data: creds, error: credsError } = await client
      .from("shopify_credentials")
      .select("shop_domain, access_token_encrypted")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .maybeSingle();

    if (credsError || !creds) {
      throw new HttpError("Shopify not connected", 400); // Human readable error string, unchanged
    }

    const accessToken = await decryptShopifySecret(creds.access_token_encrypted);
    
    const webhookUrl = "https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/shopify-webhook";
    
    const topics = ['orders/create', 'orders/updated', 'app/uninstalled'];
    const results = [];

    for (const topic of topics) {
      const payload = {
        webhook: { topic, address: webhookUrl, format: "json" }
      };

      const res = await fetch(`https://${creds.shop_domain}/admin/api/2024-01/webhooks.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      
      if (res.ok && json.webhook?.id) {
        await client.from("shopify_webhook_subscriptions").upsert({
          workspace_id,
          shop_domain: creds.shop_domain,
          topic,
          provider_webhook_id: String(json.webhook.id),
          status: 'active',
          updated_at: new Date().toISOString()
        }, { onConflict: 'workspace_id,topic' });
        results.push({ topic, status: 'active', id: json.webhook.id });
      } else {
        await client.from("shopify_webhook_subscriptions").upsert({
          workspace_id,
          shop_domain: creds.shop_domain,
          topic,
          status: res.status === 422 ? 'active' : 'failed',
          last_error: JSON.stringify(json.errors || 'Unknown error'),
          updated_at: new Date().toISOString()
        }, { onConflict: 'workspace_id,topic' });
        results.push({ topic, status: res.status === 422 ? 'active' : 'failed', error: json.errors });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: corsHeaders(req)
    });

  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    return new Response(JSON.stringify({ error: err.message }), { 
      status, 
      headers: corsHeaders(req) 
    });
  }
});
