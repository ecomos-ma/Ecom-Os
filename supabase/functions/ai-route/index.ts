// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── AI Provider Router ────────────────────────────────────────────────────────
// This edge function is the ONLY place that:
//   1. Reads AI provider credentials from the database
//   2. Calls the Gemini API
//   3. Returns results to EcomOS frontend
//
// API keys NEVER reach the browser. Ever.

async function getActiveProvider(supabase: any): Promise<any | null> {
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("enabled", true)
    .not("status", "in", '("DISABLED","FAILED")')
    .or("cooldown_until.is.null,cooldown_until.lt." + new Date().toISOString())
    .order("priority", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return null;

  // Find first non-error provider
  const active = data.find((p: any) => p.status !== "FAILED") || data[0];
  return active;
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64?: string,
  mimeType?: string
): Promise<any> {
  const parts: any[] = [];

  if (imageBase64 && mimeType) {
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: imageBase64,
      },
    });
  }

  parts.push({ text: prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function logUsage(
  supabase: any,
  providerId: string | null,
  workspaceId: string | null,
  userId: string | null,
  task: string,
  success: boolean,
  errorMessage?: string,
  durationMs?: number
) {
  try {
    await supabase.from("ai_usage_logs").insert({
      provider_id: providerId,
      workspace_id: workspaceId,
      user_id: userId,
      task,
      success,
      error_message: errorMessage,
      duration_ms: durationMs,
    });
  } catch (_) {
    // Non-fatal — don't break the main flow
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const { task, prompt, image_base64, image_mime_type, workspace_id, user_id } = body;

    if (!task || !prompt) {
      return new Response(JSON.stringify({ error: "task and prompt are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Get active AI provider ────────────────────────────────────────────────
    const provider = await getActiveProvider(supabase);

    if (!provider) {
      await logUsage(supabase, null, workspace_id, user_id, task, false, "No active AI provider", Date.now() - startedAt);
      return new Response(JSON.stringify({
        error: "No active AI provider configured. Please add a Gemini API key in Super Admin → AI Infrastructure → Providers.",
        code: "NO_PROVIDER",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Decrypt credential ────────────────────────────────────────────────────
    // Reads from credential_encrypted (canonical column added in migration 088).
    // Falls back to encrypted_credential (migration 085 column name).
    const rawKey: string = provider.credential_encrypted || provider.encrypted_credential || "";
    if (!rawKey) {
      await logUsage(supabase, provider.id, workspace_id, user_id, task, false, "Provider has no API key set", Date.now() - startedAt);
      return new Response(JSON.stringify({
        error: "Provider has no API key configured.",
        code: "NO_CREDENTIAL",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let apiKey: string;
    try {
      // Try base64 decode first; if invalid, use as-is (plain text key)
      const decoded = atob(rawKey);
      // Valid base64 decode should give back a key-looking string
      apiKey = decoded.length > 10 ? decoded : rawKey;
    } catch {
      apiKey = rawKey; // stored as plain text
    }

    // model_id is the canonical column; model is the compat alias
    const model = provider.model_id || provider.model || "gemini-1.5-flash";
    const fallbackModel = provider.fallback_model;

    // ── Call Gemini ───────────────────────────────────────────────────────────
    let result: string;
    try {
      result = await callGemini(apiKey, model, prompt, image_base64, image_mime_type);
    } catch (geminiErr: any) {
      const newFailureCount = (provider.failure_count || 0) + 1;

      // Update provider failure stats
      await supabase
        .from("ai_providers")
        .update({
          failure_count: newFailureCount,
          last_failure: new Date().toISOString(),
          status: "FAILED",
          // Cooldown for 5 minutes after 3+ failures
          cooldown_until: newFailureCount >= 3
            ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
            : null,
        })
        .eq("id", provider.id);

      await logUsage(
        supabase,
        provider.id,
        workspace_id,
        user_id,
        task,
        false,
        geminiErr.message,
        Date.now() - startedAt
      );

      // Try fallback model if configured
      if (fallbackModel && fallbackModel !== model) {
        try {
          result = await callGemini(apiKey, fallbackModel, prompt, image_base64, image_mime_type);
        } catch {
          throw geminiErr;
        }
      } else {
        throw geminiErr;
      }
    }

    // ── Update provider success stats ─────────────────────────────────────────
    await supabase
      .from("ai_providers")
      .update({
        last_success: new Date().toISOString(),
        request_count: (provider.request_count || 0) + 1,
        failure_count: 0,
        status: "HEALTHY",
        cooldown_until: null,
      })
      .eq("id", provider.id);

    await logUsage(supabase, provider.id, workspace_id, user_id, task, true, undefined, Date.now() - startedAt);

    return new Response(JSON.stringify({
      result,
      provider_used: provider.name,
      model_used: model,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[ai-route] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
