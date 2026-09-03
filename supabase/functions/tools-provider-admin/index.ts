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
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function credentialKey(usages: KeyUsage[]) {
  const material = Deno.env.get("TOOLS_API_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!material) throw new Error("Tools credential encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ecomos-tools:${material}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

async function encryptCredential(value: string) {
  const key = await credentialKey(["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { credential_ciphertext: toBase64(new Uint8Array(cipher)), credential_iv: toBase64(iv) };
}

async function decryptCredential(ciphertext: string, iv: string) {
  const key = await credentialKey(["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
  return new TextDecoder().decode(plain);
}

class ProviderTestError extends Error {
  reason: string;
  status?: number;
  constructor(reason: string, message: string, status?: number) {
    super(message);
    this.name = "ProviderTestError";
    this.reason = reason;
    this.status = status;
  }
}

function parseStructuredResponse(text: string) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    if (start < 0) throw new ProviderTestError("invalid_response", "Gemini returned an invalid structured response");
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, index + 1)); }
          catch { break; }
        }
      }
    }
    throw new ProviderTestError("invalid_response", "Gemini returned an invalid structured response");
  }
}

async function testGemini(endpoint: string | null, apiKey: string, model = "gemini-3.6-flash", clientSignal?: AbortSignal) {
  const base = (endpoint || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  const abortFromClient = () => controller.abort();
  clientSignal?.addEventListener("abort", abortFromClient, { once: true });
  try {
    if (clientSignal?.aborted) throw new ProviderTestError("client_abort", "Client cancelled provider test");
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: 'Reply with JSON only: {"intent":"question","confidence":0.9,"parameters":{},"needs_clarification":false,"reply_text":"salam"}' }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512, temperature: 0.1 } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      const reason = response.status === 429 ? "quota_exceeded" : response.status === 401 || response.status === 403 ? "provider_unauthorized" : response.status === 404 ? "invalid_model" : response.status >= 500 ? "provider_5xx" : "provider_http_error";
      throw new ProviderTestError(reason, `Gemini returned ${response.status}${body ? `: ${body}` : ""}`, response.status);
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
    const decision = parseStructuredResponse(text);
    if (!decision || typeof decision !== "object") throw new ProviderTestError("invalid_response", "Gemini returned an invalid structured response");
    return { status: response.status, decision };
  } catch (error) {
    if (error instanceof ProviderTestError) throw error;
    if (clientSignal?.aborted) throw new ProviderTestError("client_abort", "Client cancelled provider test");
    if (timedOut || (error instanceof DOMException && error.name === "AbortError")) throw new ProviderTestError("provider_timeout", "Gemini provider request timed out");
    throw new ProviderTestError("provider_network_error", "Gemini provider request failed");
  } finally {
    clearTimeout(timeout);
    clientSignal?.removeEventListener("abort", abortFromClient);
  }
}

async function testOpenAiCompatible(endpoint: string, apiKey: string, model: string, provider: string) {
  const response = await fetch(`${endpoint.replace(/\/+$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with only OK" }], max_tokens: 8, temperature: 0 }) });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function testCloudflare(endpoint: string, apiToken: string, model: string) {
  const url = endpoint.includes("/ai/run/") ? endpoint.replace(/\/+$/, "") : `${endpoint.replace(/\/+$/, "")}/ai/run/${model}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` }, body: JSON.stringify({ messages: [{ role: "user", content: "Reply with only OK" }] }) });
  if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
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
  let endpoint = String(input.endpoint || "").trim();
  if (endpoint && !/^https:\/\//i.test(endpoint)) throw new Error("Endpoint must begin with https://");
  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 0) throw new Error("Priority must be a positive whole number");
  const toolScope = String(input.tool_scope || "whatsapp_ai").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(toolScope)) throw new Error("Tool scope is invalid");
  const suppliedModel = String(input.model || "").trim();
  const providerDefaults: Record<string, string> = {
    gemini: "gemini-3.6-flash",
    groq: "openai/gpt-oss-20b",
    cloudflare_workers_ai: "@cf/meta/llama-3.1-8b-instruct",
  };
  const model = !suppliedModel || suppliedModel === "default" ? providerDefaults[provider] || "default" : suppliedModel;
  if (["gemini", "groq", "cloudflare_workers_ai"].includes(provider) && model === "default") throw new Error("A real AI model is required for this provider");
  if (!/^[a-zA-Z0-9._:@/-]{1,120}$/.test(model)) throw new Error("Model is invalid");
  const accountId = String(input.accountId || "").trim();
  if (provider === "cloudflare_workers_ai") {
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(accountId)) throw new Error("A valid Cloudflare Account ID is required");
    endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`;
  }
  return { provider, name, endpoint: endpoint || null, priority, enabled: input.enabled !== false, tool_scope: toolScope, model };
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
        .select("id, provider, name, endpoint, tool_scope, model, credential_last4, priority, enabled, failure_count, health_status, last_error, cooldown_until, last_used_at, last_success_at, last_failure_at, created_at, updated_at")
        .order("provider").order("priority");
      if (error) throw error;
      return json({ providers: data || [] });
    }

    if (body.action === "delete") {
      const { error } = await adminClient.from("tool_api_providers").delete().eq("id", body.id);
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "test") {
      const { data: provider, error } = await adminClient.from("tool_api_providers")
        .select("id, provider, endpoint, model, credential_ciphertext, credential_iv, failure_count")
        .eq("id", body.id).single();
      if (error || !provider) throw new Error("Provider not found");
      if (!provider.credential_ciphertext || !provider.credential_iv) throw new Error("This provider has no saved credential");
      const testedAt = new Date().toISOString();
      try {
        const credential = await decryptCredential(provider.credential_ciphertext, provider.credential_iv);
        if (provider.provider === "gemini") await testGemini(provider.endpoint, credential, provider.model && provider.model !== "default" ? provider.model : "gemini-3.6-flash", request.signal);
        else if (provider.provider === "groq") await testOpenAiCompatible(provider.endpoint || "https://api.groq.com/openai/v1", credential, provider.model || "openai/gpt-oss-20b", "Groq");
        else if (provider.provider === "cloudflare_workers_ai") await testCloudflare(provider.endpoint || "", credential, provider.model || "@cf/meta/llama-3.1-8b-instruct");
        else throw new Error("Connection testing is not available for this service");
        await adminClient.from("tool_api_providers").update({ health_status: "healthy", last_error: null, cooldown_until: null, last_success_at: testedAt, failure_count: 0 }).eq("id", provider.id);
        return json({ success: true, health_status: "healthy" });
      } catch (testError) {
        const typed = testError instanceof ProviderTestError ? testError : new ProviderTestError("provider_network_error", "Provider test failed");
        if (typed.reason !== "client_abort") {
          const cooldown = typed.reason === "quota_exceeded" ? 300 : typed.reason === "provider_timeout" || typed.reason === "provider_5xx" || typed.reason === "provider_network_error" ? 30 : 0;
          await adminClient.from("tool_api_providers").update({
            health_status: cooldown > 0 ? "cooldown" : "unhealthy",
            last_error: typed.reason,
            cooldown_until: cooldown > 0 ? new Date(Date.now() + cooldown * 1000).toISOString() : null,
            last_failure_at: testedAt,
            failure_count: Number(provider.failure_count || 0) + 1,
          }).eq("id", provider.id);
        }
        return json({ success: false, reason: typed.reason, ...(typed.status ? { status: typed.status } : {}) });
      }
    }

    if (body.action === "save") {
      const details = validateProvider(body);
      const credential = typeof body.credential === "string" ? body.credential.trim() : "";
      const values: Record<string, unknown> = { ...details };
      if (credential) Object.assign(values, await encryptCredential(credential), {
        credential_last4: credential.slice(-4), health_status: "unknown", last_error: null, cooldown_until: null,
      });

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
          .select("id, provider, name, endpoint, tool_scope, model, credential_last4, priority, enabled, failure_count, health_status, last_error, cooldown_until, last_used_at, last_success_at, last_failure_at, created_at, updated_at").single();
        if (error) throw error;
        return json({ provider: data });
      }

      if (!credential && details.provider !== "tiktok") throw new Error("An API key is required for this provider");
      const { data, error } = await adminClient.from("tool_api_providers").insert({ ...values, created_by: user.id })
        .select("id, provider, name, endpoint, tool_scope, model, credential_last4, priority, enabled, failure_count, health_status, last_error, cooldown_until, last_used_at, last_success_at, last_failure_at, created_at, updated_at").single();
      if (error) throw error;
      return json({ provider: data });
    }

    return json({ error: "Unsupported admin action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Provider management failed" }, 403);
  }
});
