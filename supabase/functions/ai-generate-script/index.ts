// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SAWTY_SYSTEM_PROMPT = `You are Sawty.ma — an expert Moroccan Darija copywriter specializing in viral e-commerce UGC scripts.

RULES:
- Write ONLY in natural, spoken Moroccan Darija (Moroccan Arabic dialect)
- Do NOT translate from French or Standard Arabic — write natively
- Avoid formal Arabic (فصحى) unless the user explicitly requests it
- Use words Moroccan TikTok/Instagram sellers actually use
- Keep it short, punchy, and energetic
- Structure: HOOK → BODY → CTA
- Return VALID JSON only, no markdown blocks

COMMON DARIJA WORDS TO USE:
- mzyan/mzyana = good/beautiful
- dir/diri = do it (m/f)
- zwina = beautiful
- khdam = it works
- machi = not
- kayn = there is
- bach = so that
- dyal = of/for
- hbbiti/hbbitu = you loved it
- bghiti = you want
- khas = must
- wlakin = but
- hit = because

OUTPUT FORMAT (strict JSON, no markdown):
{
  "hook": "...",
  "body": "...",
  "cta": "...",
  "full_script": "..."
}`;

function buildSawtyPrompt(params: {
    product: string;
    benefit: string;
    cta: string;
    tone: string;
    pacing: string;
    angle: string;
    custom_angle?: string;
    scene_description?: string;
}): string {
    const angleLabel = params.angle === "custom" && params.custom_angle
        ? params.custom_angle
        : params.angle.replace(/_/g, " ").toUpperCase();

    return `Generate a Moroccan Darija UGC e-commerce script.

PRODUCT: ${params.product}
MAIN BENEFIT: ${params.benefit}
CTA: ${params.cta}
TONE: ${params.tone}
PACING: ${params.pacing} (${params.pacing === "fast" ? "short sentences, quick energy" : params.pacing === "medium" ? "balanced flow" : "slow, emotional, storytelling"})
MARKETING ANGLE: ${angleLabel}
${params.scene_description ? `SCENE: ${params.scene_description}` : ""}

Write a HOOK (1-2 sentences max), BODY (2-4 sentences), CTA (1 sentence).
Total script should be 15-30 seconds when spoken aloud.
Return strict JSON: { "hook": "...", "body": "...", "cta": "...", "full_script": "..." }`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const body = await req.json().catch(() => ({}));
        const {
            workspace_id,
            user_id,
            product,
            benefit = "",
            cta = "",
            tone = "energetic",
            pacing = "fast",
            angle = "pain_point",
            custom_angle,
            scene_description,
        } = body;

        // Validate required fields
        if (!workspace_id || !product) {
            return new Response(JSON.stringify({ error: "workspace_id and product are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check workspace exists
        const { data: ws } = await supabase
            .from("workspaces")
            .select("id")
            .eq("id", workspace_id)
            .single();

        if (!ws) {
            return new Response(JSON.stringify({ error: "Invalid workspace" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Build prompt
        const fullPrompt = SAWTY_SYSTEM_PROMPT + "\n\n" + buildSawtyPrompt({
            product, benefit, cta, tone, pacing, angle, custom_angle, scene_description,
        });

        // Call AI router
        const routerUrl = `${SUPABASE_URL}/functions/v1/ai-route`;
        const routerRes = await fetch(routerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                task: "sawty_script",
                prompt: fullPrompt,
                workspace_id,
                user_id,
            }),
        });

        const routerData = await routerRes.json();

        if (!routerRes.ok || routerData.error) {
            return new Response(JSON.stringify({ error: routerData.error || "AI generation failed", code: routerData.code }), {
                status: routerRes.ok ? 500 : routerRes.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Parse AI response
        let scriptData: any;
        try {
            // Strip markdown code blocks if present
            const cleaned = routerData.result
                .replace(/```json\n?/gi, "")
                .replace(/```\n?/gi, "")
                .trim();
            scriptData = JSON.parse(cleaned);
        } catch {
            // If JSON parse fails, return raw as full_script
            scriptData = {
                hook: "",
                body: routerData.result,
                cta: cta,
                full_script: routerData.result,
            };
        }

        // Save to sawty_scripts table
        const { data: savedScript, error: saveError } = await supabase
            .from("sawty_scripts")
            .insert({
                workspace_id,
                user_id,
                product,
                benefit,
                cta,
                tone,
                pacing,
                angle,
                custom_angle,
                scene_description,
                hook: scriptData.hook || "",
                body: scriptData.body || "",
                script_cta: scriptData.cta || cta,
                full_script: scriptData.full_script || `${scriptData.hook}\n\n${scriptData.body}\n\n${scriptData.cta}`,
                model_used: routerData.model_used,
            })
            .select("id")
            .single();

        if (saveError) {
            console.error("[ai-generate-script] Save error:", saveError);
        }

        return new Response(JSON.stringify({
            success: true,
            script: {
                id: savedScript?.id,
                hook: scriptData.hook || "",
                body: scriptData.body || "",
                cta: scriptData.cta || cta,
                full_script: scriptData.full_script || `${scriptData.hook}\n\n${scriptData.body}\n\n${scriptData.cta}`,
            },
            provider: routerData.provider_used,
            model: routerData.model_used,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error("[ai-generate-script] Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
