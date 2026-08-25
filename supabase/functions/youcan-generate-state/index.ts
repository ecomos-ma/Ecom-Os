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

    const { workspace_id } = await req.json();
    if (!workspace_id) {
      throw new Error("workspace_id is required");
    }

    const YOUCAN_CLIENT_ID = Deno.env.get("YOUCAN_CLIENT_ID");
    if (!YOUCAN_CLIENT_ID) {
      throw new Error("YOUCAN_CLIENT_ID not configured in Supabase secrets");
    }

    // Generate signed state with timestamp
    const timestamp = Date.now();
    const payload = `${timestamp}:${workspace_id}`;
    const signature = await computeHMACSHA256(payload, STATE_SIGNING_SECRET);
    const state = `${payload}:${signature}`;

    return new Response(JSON.stringify({ state, client_id: YOUCAN_CLIENT_ID }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("YouCan generate state error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
