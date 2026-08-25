// Founder-only credential management for the shared Tools providers.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FOUNDER_EMAIL = "amineelaaouamecom@gmail.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const toBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));

async function encryptCredential(value: string) {
  const material = Deno.env.get("TOOLS_API_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!material) throw new Error("Tools credential encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ecomos-tools:${material}`));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { credential_ciphertext: toBase64(new Uint8Array(cipher)), credential_iv: toBase64(iv) };
}

async function authenticatedAdmin(request: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = request.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required");

  const adminClient = createClient(url, service);
  const { data: profile, error: profileError } = await adminClient
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (profileError || profile?.role !== "founder" || profile.email?.trim().toLowerCase() !== FOUNDER_EMAIL) {
    throw new Error("Founder access required");
  }
  return { user, adminClient };
}

function validateProvider(input: Record<string, unknown>) {
  const provider = String(input.provider || "").trim().toLowerCase();
  const name = String(input.name || "").trim();
  if (!/^[a-z0-9_-]+$/.test(provider)) throw new Error("Provider must contain only lowercase letters, numbers, _ or -");
  if (!name) throw new Error("Provider name is required");
  const endpoint = String(input.endpoint || "").trim();
  if (endpoint && !/^https:\/\//i.test(endpoint)) throw new Error("Endpoint must begin with https://");
  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 0) throw new Error("Priority must be a positive whole number");
  return { provider, name, endpoint: endpoint || null, priority, enabled: input.enabled !== false };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await authenticatedAdmin(request);
    const body = await request.json();

    if (body.action === "list") {
      const { data, error } = await adminClient
        .from("tool_api_providers")
        .select("id, provider, name, endpoint, priority, enabled, failure_count, last_used_at, last_success_at, last_failure_at, created_at, updated_at")
        .order("provider").order("priority");
      if (error) throw error;
      return json({ providers: data || [] });
    }

    if (body.action === "delete") {
      const { error } = await adminClient.from("tool_api_providers").delete().eq("id", body.id);
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "save") {
      const details = validateProvider(body);
      const credential = typeof body.credential === "string" ? body.credential.trim() : "";
      const values: Record<string, unknown> = { ...details };
      if (credential) Object.assign(values, await encryptCredential(credential));

      if (body.id) {
        const { data: existing, error: existingError } = await adminClient
          .from("tool_api_providers").select("id, provider").eq("id", body.id).single();
        if (existingError || !existing) throw new Error("Provider not found");
        if (!credential && details.provider !== "tiktok") {
          const { data: configured } = await adminClient
            .from("tool_api_providers").select("id").eq("id", body.id).not("credential_ciphertext", "is", null).maybeSingle();
          if (!configured) throw new Error("An API key is required for this provider");
        }
        const { data, error } = await adminClient.from("tool_api_providers").update(values).eq("id", body.id)
          .select("id, provider, name, endpoint, priority, enabled, failure_count, last_used_at, last_success_at, last_failure_at, created_at, updated_at").single();
        if (error) throw error;
        return json({ provider: data });
      }

      if (!credential && details.provider !== "tiktok") throw new Error("An API key is required for this provider");
      const { data, error } = await adminClient.from("tool_api_providers").insert({ ...values, created_by: user.id })
        .select("id, provider, name, endpoint, priority, enabled, failure_count, last_used_at, last_success_at, last_failure_at, created_at, updated_at").single();
      if (error) throw error;
      return json({ provider: data });
    }

    return json({ error: "Unsupported admin action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Provider management failed" }, 403);
  }
});
