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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // The public URL of our youcan-webhook edge function
    // e.g. https://<project>.supabase.co/functions/v1/youcan-webhook
    const SUPABASE_PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_REF") || "";

    const { workspace_id } = await req.json();
    if (!workspace_id) throw new Error("workspace_id is required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Load workspace credentials & existing webhook ID ──
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select(
        "youcan_access_token, youcan_webhook_id"
      )
      .eq("id", workspace_id)
      .single();

    if (wsError || !workspace) throw new Error("Workspace not found");
    if (!workspace.youcan_access_token) {
      throw new Error("YouCan not connected. Complete OAuth flow first.");
    }

    const accessToken = workspace.youcan_access_token;

    // ── 2. Build the webhook target URL ──
    // Include workspace_id as a query param so the webhook endpoint knows which workspace to use
    let webhookUrl: string;
    if (SUPABASE_PROJECT_REF) {
      webhookUrl = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/youcan-webhook?workspace_id=${workspace_id}`;
    } else {
      // Derive from SUPABASE_URL  (https://<ref>.supabase.co)
      const baseUrl = SUPABASE_URL.replace(/\/$/, "");
      webhookUrl = `${baseUrl}/functions/v1/youcan-webhook?workspace_id=${workspace_id}`;
    }

    // ── 3. Unsubscribe existing webhook if present ──
    if (workspace.youcan_webhook_id) {
      try {
        const deleteRes = await fetch(
          `https://api.youcan.shop/resthooks/${workspace.youcan_webhook_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          }
        );
        console.log(
          `[YouCan Register Webhook] Unsubscribed old webhook ${workspace.youcan_webhook_id}: ${deleteRes.status}`
        );
      } catch (err) {
        // Non-fatal: old webhook may already be gone
        console.warn("[YouCan Register Webhook] Failed to delete old webhook:", err);
      }
    }

    // ── 4. Register new webhook for order.created ──
    const subscribeRes = await fetch("https://api.youcan.shop/resthooks/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        target_url: webhookUrl,
        event: "order.created",
      }),
    });

    const responseText = await subscribeRes.text();
    let subscribeData: any;
    try {
      subscribeData = JSON.parse(responseText);
    } catch {
      subscribeData = { raw: responseText };
    }

    if (!subscribeRes.ok) {
      throw new Error(
        `YouCan webhook subscription failed (${subscribeRes.status}): ${responseText}`
      );
    }

    const webhookId =
      subscribeData.id ||
      subscribeData.hook_id ||
      subscribeData.webhook_id ||
      subscribeData.data?.id;

    console.log(
      `[YouCan Register Webhook] Subscribed successfully. Webhook ID: ${webhookId}, URL: ${webhookUrl}`
    );

    // ── 5. Persist webhook ID in workspaces ──
    if (webhookId) {
      await supabase
        .from("workspaces")
        .update({ youcan_webhook_id: String(webhookId) })
        .eq("id", workspace_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        webhook_id: webhookId,
        target_url: webhookUrl,
        event: "order.created",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[YouCan Register Webhook] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
