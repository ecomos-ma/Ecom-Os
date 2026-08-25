// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Encrypt using AES-256-CBC with random IV
async function encryptSecret(plaintext: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  // Decode hex key to 32 bytes
  const keyData = new Uint8Array(key.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
  if (keyData.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  const iv = crypto.getRandomValues(new Uint8Array(16)); // Random IV
  const plaintextData = encoder.encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    plaintextData
  );

  const encryptedArray = Array.from(new Uint8Array(encrypted));
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = encryptedArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${ivHex}:${encryptedHex}`;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");

    if (!ENCRYPTION_KEY) {
      throw new Error("ENCRYPTION_KEY not configured");
    }

    const { workspace_id, client_id, client_secret } = await req.json();
    
    if (!workspace_id || !client_id || !client_secret) {
      throw new Error("workspace_id, client_id, and client_secret are required");
    }

    // Get user from auth header to verify workspace access
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Authorization header required");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user has access to this workspace
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (profileError || !profile || profile.workspace_id !== workspace_id) {
      throw new Error("Unauthorized access to workspace");
    }

    // Encrypt client_secret
    const encryptedSecret = await encryptSecret(client_secret, ENCRYPTION_KEY);

    // Upsert credentials
    const { error: upsertError } = await supabase
      .from("youcan_credentials")
      .upsert({
        workspace_id,
        client_id,
        client_secret_encrypted: encryptedSecret,
      });

    if (upsertError) {
      throw new Error(`Failed to save credentials: ${upsertError.message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Save YouCan credentials error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
