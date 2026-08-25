// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANALYSIS_SCHEMA = {
    product_name: "",
    category: "",
    target_customer: "",
    primary_problem: "",
    primary_solution: "",
    benefits: [],
    features: [],
    use_cases: [],
    objections: [],
    marketing_opportunities: [],
    visual_description: "",
    confidence_score: 0,
};

function buildAnalysisPrompt(): string {
    return `You are an expert e-commerce product analyst and marketing strategist.

Analyze the product in the provided image and return a detailed JSON product analysis.

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "product_name": "clear product name",
  "category": "product category",
  "target_customer": "who this product is for",
  "primary_problem": "main pain point this product solves",
  "primary_solution": "how this product solves the problem",
  "benefits": ["benefit 1", "benefit 2", "benefit 3"],
  "features": ["feature 1", "feature 2"],
  "use_cases": ["use case 1", "use case 2"],
  "objections": ["common customer objection 1", "objection 2"],
  "marketing_opportunities": ["opportunity 1", "opportunity 2"],
  "visual_description": "detailed description of what you see in the image",
  "confidence_score": 0.85
}

Be specific and actionable. Focus on e-commerce selling potential. confidence_score is a number from 0 to 1.`;
}

function validateAnalysis(data: any): boolean {
    const required = ["product_name", "category", "target_customer", "primary_problem", "primary_solution", "benefits", "visual_description"];
    for (const key of required) {
        if (!data[key]) return false;
    }
    if (!Array.isArray(data.benefits) || data.benefits.length === 0) return false;
    return true;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const body = await req.json().catch(() => ({}));
        const { workspace_id, user_id, image_base64, image_mime_type = "image/jpeg" } = body;

        if (!workspace_id || !image_base64) {
            return new Response(JSON.stringify({ error: "workspace_id and image_base64 are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const prompt = buildAnalysisPrompt();

        // Call AI router with image
        const routerUrl = `${SUPABASE_URL}/functions/v1/ai-route`;

        async function callRouter(extraPrompt?: string) {
            const res = await fetch(routerUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                    task: "product_analysis",
                    prompt: extraPrompt || prompt,
                    image_base64,
                    image_mime_type,
                    workspace_id,
                    user_id,
                }),
            });
            return res.json();
        }

        let routerData = await callRouter();

        if (routerData.error) {
            return new Response(JSON.stringify({ error: routerData.error, code: routerData.code }), {
                status: 503,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Parse response
        let analysis: any;
        let parseAttempts = 0;

        while (parseAttempts < 2) {
            try {
                const cleaned = routerData.result
                    .replace(/```json\n?/gi, "")
                    .replace(/```\n?/gi, "")
                    .trim();
                analysis = JSON.parse(cleaned);
                if (validateAnalysis(analysis)) break;
                throw new Error("Invalid analysis structure");
            } catch {
                parseAttempts++;
                if (parseAttempts < 2) {
                    // Retry with stricter structured output instruction
                    const strictPrompt = prompt + "\n\nIMPORTANT: Return ONLY the JSON object. No explanation, no markdown. Start with { and end with }";
                    routerData = await callRouter(strictPrompt);
                } else {
                    // Return a fallback structure
                    analysis = {
                        ...ANALYSIS_SCHEMA,
                        product_name: "Product",
                        visual_description: routerData.result || "Product image analyzed",
                        confidence_score: 0.3,
                        _parse_failed: true,
                    };
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            analysis,
            provider: routerData.provider_used,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error("[ai-analyze-product] Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
