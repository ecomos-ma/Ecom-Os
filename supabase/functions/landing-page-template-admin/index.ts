// Private landing-page visual-reference management for the founder console.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FOUNDER_EMAIL = "amineelaaouamecom@gmail.com";
const BUCKET = "landing-page-template-assets";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

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

function safeName(value: unknown) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) throw new Error("Template name must be between 1 and 100 characters");
  return name;
}

function tags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item && item.length <= 40))].slice(0, 20);
}

function validateTemplate(input: Record<string, unknown>) {
  const styleInstructions = String(input.style_instructions || "").trim();
  if (!styleInstructions || styleInstructions.length > 4_000) {
    throw new Error("Style instructions must be between 1 and 4,000 characters");
  }
  const assetPath = String(input.asset_path || "").trim();
  if (!/^templates\/[a-f0-9-]+\.(?:jpe?g|png|webp)$/i.test(assetPath)) {
    throw new Error("Invalid template asset");
  }
  const assetMimeType = String(input.asset_mime_type || "").toLowerCase();
  if (!IMAGE_TYPES.has(assetMimeType)) throw new Error("Only JPG, PNG, and WebP references are supported");
  const qualityScore = Number(input.quality_score);
  const priority = Number(input.priority);
  if (!Number.isInteger(qualityScore) || qualityScore < 1 || qualityScore > 100) throw new Error("Quality score must be between 1 and 100");
  if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) throw new Error("Priority must be between 0 and 10,000");
  return {
    name: safeName(input.name), style_instructions: styleInstructions, fit_tags: tags(input.fit_tags),
    asset_path: assetPath, asset_mime_type: assetMimeType, quality_score: qualityScore,
    priority, enabled: input.enabled !== false,
  };
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await authenticatedAdmin(request);
    const body = await request.json();

    if (body.action === "list") {
      const { data, error } = await adminClient
        .from("landing_page_ai_templates")
        .select("id, name, style_instructions, fit_tags, asset_path, asset_mime_type, quality_score, priority, enabled, last_used_at, created_at, updated_at")
        .order("quality_score", { ascending: false })
        .order("priority", { ascending: true });
      if (error) throw error;
      const templates = await Promise.all((data || []).map(async (template) => {
        const { data: signed, error: signedError } = await adminClient.storage.from(BUCKET)
          .createSignedUrl(template.asset_path, 60 * 60);
        if (signedError) throw signedError;
        return { ...template, preview_url: signed.signedUrl };
      }));
      return json({ templates });
    }

    if (body.action === "create-upload") {
      const mimeType = String(body.mime_type || "").toLowerCase();
      const size = Number(body.size || 0);
      if (!IMAGE_TYPES.has(mimeType)) throw new Error("Upload a JPG, PNG, or WebP image");
      if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) throw new Error("Template image must be smaller than 3 MB");
      const path = `templates/${crypto.randomUUID()}.${extensionFor(mimeType)}`;
      const { data, error } = await adminClient.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return json({ path: data.path, token: data.token, signed_url: data.signedUrl });
    }

    if (body.action === "save") {
      const values = validateTemplate(body);
      if (body.id) {
        const { data: existing, error: existingError } = await adminClient
          .from("landing_page_ai_templates").select("id, asset_path").eq("id", body.id).single();
        if (existingError || !existing) throw new Error("Template not found");
        const { data, error } = await adminClient.from("landing_page_ai_templates")
          .update(values).eq("id", existing.id)
          .select("id, name, style_instructions, fit_tags, asset_path, asset_mime_type, quality_score, priority, enabled, last_used_at, created_at, updated_at").single();
        if (error) throw error;
        if (existing.asset_path !== values.asset_path) {
          await adminClient.storage.from(BUCKET).remove([existing.asset_path]);
        }
        return json({ template: data });
      }

      const { data, error } = await adminClient.from("landing_page_ai_templates")
        .insert({ ...values, created_by: user.id })
        .select("id, name, style_instructions, fit_tags, asset_path, asset_mime_type, quality_score, priority, enabled, last_used_at, created_at, updated_at").single();
      if (error) throw error;
      return json({ template: data });
    }

    if (body.action === "delete") {
      const { data: existing, error: existingError } = await adminClient
        .from("landing_page_ai_templates").select("asset_path").eq("id", body.id).single();
      if (existingError || !existing) throw new Error("Template not found");
      const { error } = await adminClient.from("landing_page_ai_templates").delete().eq("id", body.id);
      if (error) throw error;
      await adminClient.storage.from(BUCKET).remove([existing.asset_path]);
      return json({ success: true });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Template management failed" }, 403);
  }
});
