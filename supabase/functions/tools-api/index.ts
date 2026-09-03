// Central proxy for the Tools page. Provider credentials never cross this boundary.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tools-action",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const LANDING_TEMPLATE_BUCKET = "landing-page-template-assets";
const MAX_LANDING_REFERENCES = 3;
const MAX_REFERENCE_BYTES = 3 * 1024 * 1024;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type Provider = {
  id: string;
  provider: string;
  model: string;
  tool_scope: string;
  endpoint: string | null;
  credential_ciphertext: string | null;
  credential_iv: string | null;
};

const toBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const toBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function encryptionKey() {
  // A dedicated secret is preferred. The service key remains a server-only
  // secure fallback so this works immediately in existing Supabase projects.
  const material = Deno.env.get("TOOLS_API_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!material) throw new Error("Tools credential encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ecomos-tools:${material}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { credential_ciphertext: toBase64(new Uint8Array(cipher)), credential_iv: toBase64(iv) };
}

async function decryptCredential(provider: Provider) {
  if (!provider.credential_ciphertext || !provider.credential_iv) return "";
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBytes(provider.credential_iv) },
    await encryptionKey(),
    toBytes(provider.credential_ciphertext),
  );
  return new TextDecoder().decode(plain);
}

function clients(request: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = request.headers.get("Authorization") || "";
  return {
    userClient: createClient(url, anon, { global: { headers: { Authorization: authorization } } }),
    adminClient: createClient(url, service),
  };
}

async function getAuthenticatedUser(request: Request) {
  const { userClient } = clients(request);
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  return user;
}

async function getProviders(adminClient: ReturnType<typeof createClient>, provider: string, toolScope: string) {
  const { data, error } = await adminClient
    .from("tool_api_providers")
    .select("id, provider, model, tool_scope, endpoint, credential_ciphertext, credential_iv, health_status, cooldown_until")
    .eq("provider", provider)
    .eq("tool_scope", toolScope)
    .eq("enabled", true)
    .or("health_status.is.null,health_status.eq.unknown,health_status.eq.healthy")
    .or(`cooldown_until.is.null,cooldown_until.lte.${new Date().toISOString()}`)
    .order("priority", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  if (!data?.length) throw new Error(`No active ${provider} provider is configured`);
  return data as Provider[];
}

async function logResult(
  adminClient: ReturnType<typeof createClient>, providerId: string, userId: string, action: string,
  startedAt: number, success: boolean, errorMessage?: string,
) {
  const timestampField = success ? { last_success_at: new Date().toISOString(), failure_count: 0, health_status: "healthy", last_error: null, cooldown_until: null } : {
    last_failure_at: new Date().toISOString(),
    failure_count: 1,
    health_status: /429|quota|rate limit/i.test(errorMessage || "") ? "cooldown" : /401|403|invalid|revoked/i.test(errorMessage || "") ? "unhealthy" : "cooldown",
    cooldown_until: new Date(Date.now() + (/429|quota|rate limit/i.test(errorMessage || "") ? 15 : 2) * 60_000).toISOString(),
    last_error: (errorMessage || "Provider request failed").slice(0, 500),
  };
  await Promise.all([
    adminClient.from("tool_api_providers").update({ last_used_at: new Date().toISOString(), ...timestampField }).eq("id", providerId),
    adminClient.from("tool_api_usage_logs").insert({
      provider_id: providerId, user_id: userId, action, success,
      duration_ms: Date.now() - startedAt, error_message: errorMessage || null,
    }),
  ]);
}

async function addLandingPageReferences(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { data: templates, error } = await adminClient
    .from("landing_page_ai_templates")
    .select("id, name, style_instructions, fit_tags, asset_path, asset_mime_type")
    .eq("enabled", true)
    .order("quality_score", { ascending: false })
    .order("priority", { ascending: true })
    .limit(MAX_LANDING_REFERENCES);
  if (error) throw new Error(`Could not load Landing Page AI references: ${error.message}`);

  const enriched = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const contents = Array.isArray(enriched.contents) ? enriched.contents : [];
  const firstContent = contents.find((content) => content && typeof content === "object") as Record<string, unknown> | undefined;
  if (!firstContent) throw new Error("Landing Page AI request is missing content");
  const parts = Array.isArray(firstContent.parts) ? firstContent.parts : [];
  firstContent.parts = parts;

  const usedTemplateIds: string[] = [];
  const referenceSummary: string[] = [];
  for (const template of templates || []) {
    const { data: asset, error: assetError } = await adminClient.storage.from(LANDING_TEMPLATE_BUCKET).download(template.asset_path);
    if (assetError || !asset) continue;
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (!bytes.length || bytes.byteLength > MAX_REFERENCE_BYTES) continue;
    const tags = Array.isArray(template.fit_tags) && template.fit_tags.length ? ` Tags: ${template.fit_tags.join(", ")}.` : "";
    parts.push({ text: `VISUAL REFERENCE — ${template.name}: ${template.style_instructions}${tags} Use this only as original visual inspiration; never copy its brand, words, logo, or exact layout.` });
    parts.push({ inline_data: { mime_type: asset.type || template.asset_mime_type, data: bytesToBase64(bytes) } });
    usedTemplateIds.push(template.id);
    referenceSummary.push(`${template.name}${tags}`);
  }

  const originalSystemInstruction = enriched.systemInstruction && typeof enriched.systemInstruction === "object"
    ? enriched.systemInstruction as Record<string, unknown>
    : {};
  const systemParts = Array.isArray(originalSystemInstruction.parts) ? originalSystemInstruction.parts : [];
  systemParts.push({ text: [
    "You generate a single static, responsive product showcase webpage from the supplied product photo.",
    "The supplied product photo must be the dominant hero visual. Return only one complete HTML document with all CSS inline; do not use Markdown.",
    "NON-NEGOTIABLE: no cart, checkout, buy-now flow, payment, order form, shipping form, account/login, external purchase links, or embedded third-party assets.",
    "This is a visual product landing-page preview only. It may present product benefits and a non-purchasing visual callout, but it must never collect customer data or enable a transaction.",
    "First compare the visual references internally and use the most appropriate design language for the product. Create an original page, not a copy of a reference.",
    referenceSummary.length ? `Available reference styles: ${referenceSummary.join(" | ")}` : "No reference images are currently enabled; use a clean editorial product style.",
  ].join(" ") });
  enriched.systemInstruction = { ...originalSystemInstruction, parts: systemParts };

  if (usedTemplateIds.length) {
    await adminClient.from("landing_page_ai_templates").update({ last_used_at: new Date().toISOString() }).in("id", usedTemplateIds);
  }
  return enriched;
}

async function gemini(request: Request, userId: string, action = "gemini-generate") {
  const body = await request.json();
  const model = String(body.model || "gemini-2.0-flash");
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return json({ error: "Invalid model" }, 400);
  if (!body.payload || typeof body.payload !== "object") return json({ error: "Missing Gemini payload" }, 400);

  const { adminClient } = clients(request);
  const providers = await getProviders(adminClient, "gemini", action === "landing-page-generate" ? "landing_page_ai" : "whatsapp_ai");
  const payload = action === "landing-page-generate"
    ? await addLandingPageReferences(adminClient, body.payload as Record<string, unknown>)
    : body.payload;
  const errors: string[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const key = await decryptCredential(provider);
      if (!key) throw new Error("Provider is missing its API credential");
      const baseUrl = (provider.endpoint || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/models/${encodeURIComponent(provider.model === "default" ? model : provider.model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${responseText.slice(0, 240)}`);
      await logResult(adminClient, provider.id, userId, action, startedAt, true);
      return new Response(responseText, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini request failed";
      errors.push(message);
      await logResult(adminClient, provider.id, userId, action, startedAt, false, message);
    }
  }
  console.error("[tools-api] all eligible Gemini providers failed", { action, userId, failures: errors.length });
  return json({ error: "AI service temporarily unavailable" }, 503);
}

async function removeBackground(request: Request, userId: string) {
  const sourceForm = await request.formData();
  const image = sourceForm.get("image_file");
  if (!(image instanceof File)) return json({ error: "image_file is required" }, 400);

  const { adminClient } = clients(request);
  const providers = await getProviders(adminClient, "removebg", "background_removal");
  const errors: string[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const key = await decryptCredential(provider);
      if (!key) throw new Error("Provider is missing its API credential");
      const form = new FormData();
      form.append("image_file", image, image.name);
      form.append("size", String(sourceForm.get("size") || "auto"));
      const response = await fetch(provider.endpoint || "https://api.remove.bg/v1.0/removebg", {
        method: "POST", headers: { "X-Api-Key": key }, body: form,
      });
      if (!response.ok) throw new Error(`remove.bg returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
      await logResult(adminClient, provider.id, userId, "remove-background", startedAt, true);
      return new Response(await response.arrayBuffer(), {
        headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "image/png" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background removal failed";
      errors.push(message);
      await logResult(adminClient, provider.id, userId, "remove-background", startedAt, false, message);
    }
  }
  console.error("[tools-api] all eligible background-removal providers failed", { userId, failures: errors.length });
  return json({ error: "Background removal temporarily unavailable" }, 503);
}

async function resolveTikTok(request: Request, userId: string) {
  const requestedUrl = new URL(request.url).searchParams.get("url");
  if (!requestedUrl || !/^https?:\/\//i.test(requestedUrl)) return json({ error: "A valid TikTok URL is required" }, 400);
  const { adminClient } = clients(request);
  const providers = await getProviders(adminClient, "tiktok", "tiktok_resolver");
  const errors: string[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const endpoint = provider.endpoint || "https://www.tikwm.com/api/";
      const url = new URL(endpoint);
      url.searchParams.set("url", requestedUrl);
      url.searchParams.set("hd", "1");
      const credential = await decryptCredential(provider);
      if (credential) url.searchParams.set("api_key", credential);
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const responseText = await response.text();
      if (!response.ok) throw new Error(`TikTok provider returned ${response.status}`);
      await logResult(adminClient, provider.id, userId, "tiktok-resolve", startedAt, true);
      return new Response(responseText, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TikTok provider failed";
      errors.push(message);
      await logResult(adminClient, provider.id, userId, "tiktok-resolve", startedAt, false, message);
    }
  }
  console.error("[tools-api] all eligible TikTok providers failed", { userId, failures: errors.length });
  return json({ error: "Video resolver temporarily unavailable" }, 503);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await getAuthenticatedUser(request);
    const action = request.headers.get("x-tools-action") || new URL(request.url).searchParams.get("action");
    if ((action === "gemini-generate" || action === "landing-page-generate") && request.method === "POST") {
      return await gemini(request, user.id, action);
    }
    if (action === "removebg" && request.method === "POST") return await removeBackground(request, user.id);
    if (action === "tiktok-resolve") return await resolveTikTok(request, user.id);
    return json({ error: "Unsupported tools action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Tools API failed" }, 500);
  }
});
