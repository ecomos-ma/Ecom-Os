// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
    // ── Token verification (FIRST step) ───────────────────────────────────────
    const COLIATY_WEBHOOK_TOKEN = Deno.env.get("COLIATY_WEBHOOK_TOKEN");
    if (!COLIATY_WEBHOOK_TOKEN) {
      console.error("COLIATY_WEBHOOK_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Timing-safe comparison to prevent timing attacks
    if (!token || token.length !== COLIATY_WEBHOOK_TOKEN.length ||
      !timingSafeEqual(token, COLIATY_WEBHOOK_TOKEN)) {
      console.error("Invalid webhook token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // ── Log webhook event ───────────────────────────────────────────────────────
    await supabase.from("webhook_logs").insert({
      provider: "coliaty",
      event_type: payload.EVENT || "unknown",
      payload: payload,
      status: "received",
      created_at: new Date().toISOString(),
    });

    // ── Parse Coliaty webhook payload ────────────────────────────────────────────
    const eventType = payload.EVENT;
    const tracking = payload.TRACKING;

    if (!tracking) {
      console.error("Coliaty webhook: Missing TRACKING field");
      return new Response(JSON.stringify({ error: "Missing TRACKING field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let mappedStatus = null;

    if (eventType === "PARCEL_STATUS_CHANGED") {
      const status = payload.STATUS;
      mappedStatus = mapColiatyStatus(status);
    } else if (eventType === "PARCEL_SITUATION_CHANGED") {
      const status = payload.STATUS;
      const situation = payload.SITUATION;
      // For SITUATION events, STATUS indicates final state (DELIVERED/REFUSE)
      if (status === "DELIVERED") {
        mappedStatus = "delivered";
      } else if (status === "REFUSE") {
        mappedStatus = "refused";
      } else {
        mappedStatus = mapColiatyStatus(status);
      }
    } else {
      console.log(`Coliaty webhook: Unknown event type ${eventType}`);
      return new Response(JSON.stringify({ success: true, message: "Unknown event type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Update order status ─────────────────────────────────────────────────────
    if (mappedStatus) {
      const { data: orderData, error: findError } = await supabase
        .from("orders")
        .select("order_number")
        .eq("coliaty_parcel_code", tracking)
        .maybeSingle();

      if (findError) {
        console.error(`Coliaty webhook: Failed to find order ${tracking}:`, findError);
        await supabase.from("webhook_logs").update({
          status: "error",
          error_message: `Failed to find order: ${findError.message}`
        }).eq("provider", "coliaty").order("created_at", { ascending: false }).limit(1);
      } else if (!orderData) {
        console.log(`Coliaty webhook: Order with tracking ${tracking} not found (skipped - normal for test webhooks)`);
        await supabase.from("webhook_logs").update({
          status: "skipped",
          error_message: `Order with tracking ${tracking} not found`
        }).eq("provider", "coliaty").order("created_at", { ascending: false }).limit(1);
      } else {
        const canonicalStatus = mapColiatyStatusToCanonical(mappedStatus);
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            shipping_status: canonicalStatus,
            delivery_status: canonicalStatus,
            shipping_status_raw: payload.STATUS || mappedStatus,
            last_tracking_sync: new Date().toISOString(),
            shipping_updated_at: new Date().toISOString(),
          })
          .eq("coliaty_parcel_code", tracking);

        if (updateError) {
          console.error(`Coliaty webhook: Failed to update order ${tracking}:`, updateError);
          await supabase.from("webhook_logs").update({
            status: "error",
            error_message: `Failed to update order: ${updateError.message}`
          }).eq("provider", "coliaty").order("created_at", { ascending: false }).limit(1);
        } else {
          console.log(`Coliaty webhook: Updated order ${tracking} shipping_status to ${canonicalStatus}`);
          await supabase.from("webhook_logs").update({
            status: "success",
            processed_at: new Date().toISOString()
          }).eq("provider", "coliaty").order("created_at", { ascending: false }).limit(1);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Coliaty webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Coliaty status mapping ───────────────────────────────────────────────────────
function mapColiatyStatus(coliatyStatus: string): string | null {
  if (!coliatyStatus) return null;

  const status = coliatyStatus.toLowerCase();

  const statusMap: Record<string, string> = {
    "pending": "pending",
    "awaiting_pickup": "awaiting pickup",
    "picked_up": "picked up",
    "in_transit": "in transit",
    "out_for_delivery": "out for delivery",
    "delivered": "delivered",
    "no_answer": "no answer",
    "refused": "refused",
    "returned": "returned",
    "cancelled": "cancelled",
    "canceled": "cancelled",
  };

  return statusMap[status] || null;
}

// ── Map status to canonical EcomOS shipping status ───────────────────────────────
function mapColiatyStatusToCanonical(status: string): string {
  const map: Record<string, string> = {
    "pending": "NEW_PARCEL",
    "awaiting pickup": "WAITING_PICKUP",
    "picked up": "PICKED_UP",
    "in transit": "IN_TRANSIT",
    "out for delivery": "OUT_FOR_DELIVERY",
    "delivered": "DELIVERED",
    "no answer": "NO_ANSWER",
    "refused": "REFUSED",
    "returned": "RETURNED_TO_SENDER",
    "cancelled": "CANCELED",
  };
  return map[status.toLowerCase()] || status.toUpperCase();
}
