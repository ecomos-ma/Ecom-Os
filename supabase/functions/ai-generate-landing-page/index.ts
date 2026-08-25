// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── DETERMINISTIC PRICE CALCULATIONS ─────────────────────────────────────────
// AI MUST NEVER do math. All pricing is calculated here in deterministic TS code.

function calculateOffer(config: {
    cost_price: number;
    selling_price: number;
    shipping_cost: number;
    currency: string;
    max_discount: number;
}) {
    const { cost_price, selling_price, shipping_cost, currency, max_discount } = config;

    const originalPrice = selling_price;
    const discountAmount = Math.min(max_discount, selling_price * 0.4); // cap at 40%
    const salePrice = Math.max(selling_price - discountAmount, cost_price + 5); // never below cost + 5
    const discountPercent = originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0;
    const savings = originalPrice - salePrice;
    const profit = salePrice - cost_price - shipping_cost;
    const margin = salePrice > 0 ? Math.round((profit / salePrice) * 100) : 0;

    return {
        original_price: originalPrice,
        sale_price: salePrice,
        discount_amount: discountAmount,
        discount_percent: discountPercent,
        savings,
        profit,
        margin_percent: margin,
        shipping_cost,
        currency,
        // Bundle pricing (deterministic)
        buy_2_price: salePrice * 2 * 0.9, // 10% off for buy 2
        buy_3_price: salePrice * 3 * 0.8, // 20% off for buy 3
    };
}

// ─── Angle Definitions ────────────────────────────────────────────────────────
const ANGLE_DETAILS: Record<string, { name: string; hook_template: string; emotion: string }> = {
    pain_point: { name: "Pain Point", hook_template: "Problem-first hook highlighting pain", emotion: "frustration → relief" },
    before_after: { name: "Before / After", hook_template: "Transformation story", emotion: "hope" },
    social_proof: { name: "Social Proof", hook_template: "Customer testimonial or review count", emotion: "trust" },
    scarcity: { name: "Scarcity / FOMO", hook_template: "Limited time or stock urgency", emotion: "urgency" },
    curiosity: { name: "Curiosity", hook_template: "Question or surprising fact", emotion: "intrigue" },
    results: { name: "Results / Numbers", hook_template: "Specific numbers and outcomes", emotion: "excitement" },
    value: { name: "Price / Value", hook_template: "Price anchoring or ROI focus", emotion: "satisfaction" },
    authority: { name: "Authority", hook_template: "Expert endorsement or certification", emotion: "confidence" },
    lifestyle: { name: "Lifestyle", hook_template: "Aspirational life scenario", emotion: "desire" },
    comparison: { name: "Comparison", hook_template: "Us vs them positioning", emotion: "clarity" },
    relatable: { name: "Relatable", hook_template: "Everyday struggle scenario", emotion: "recognition" },
    convenience: { name: "Convenience", hook_template: "Time/effort savings focus", emotion: "relief" },
};

function buildLandingPagePrompt(params: {
    analysis: any;
    market: string;
    language: string;
    angle: string;
    offer: any;
}): string {
    const { analysis, market, language, angle, offer } = params;
    const angleInfo = ANGLE_DETAILS[angle] || { name: angle, hook_template: "compelling hook", emotion: "desire" };

    return `You are an expert e-commerce landing page copywriter specializing in COD (Cash on Delivery) markets.

PRODUCT ANALYSIS:
${JSON.stringify(analysis, null, 2)}

MARKET: ${market}
LANGUAGE: ${language} (write naturally, not as a translation)
MARKETING ANGLE: ${angleInfo.name} — ${angleInfo.hook_template}
TARGET EMOTION: ${angleInfo.emotion}

OFFER (DO NOT CHANGE THESE NUMBERS — they are calculated by the system):
- Sale Price: ${offer.sale_price} ${offer.currency}
- Original Price: ${offer.original_price} ${offer.currency}
- Discount: ${offer.discount_percent}%
- Savings: ${offer.savings} ${offer.currency}

Generate landing page content as JSON. Return ONLY valid JSON, no markdown.

{
  "page_title": "...",
  "page_meta_description": "...",
  "hero": {
    "headline": "...",
    "subheadline": "...",
    "badge": "...",
    "cta_text": "..."
  },
  "problem": {
    "headline": "...",
    "points": ["...", "...", "..."]
  },
  "solution": {
    "headline": "...",
    "description": "..."
  },
  "benefits": [
    { "icon": "✓", "title": "...", "description": "..." }
  ],
  "how_it_works": {
    "headline": "...",
    "steps": [
      { "number": "01", "title": "...", "description": "..." }
    ]
  },
  "social_proof": {
    "headline": "...",
    "stats": [
      { "value": "...", "label": "..." }
    ],
    "reviews": [
      { "name": "...", "location": "...", "rating": 5, "text": "..." }
    ]
  },
  "offer": {
    "headline": "...",
    "urgency_text": "...",
    "badge": "..."
  },
  "guarantee": {
    "headline": "...",
    "description": "..."
  },
  "faq": [
    { "question": "...", "answer": "..." }
  ],
  "cod_form": {
    "headline": "...",
    "subheadline": "...",
    "cta_button": "..."
  },
  "final_cta": {
    "headline": "...",
    "cta_text": "..."
  }
}

Make all copy conversion-focused, direct, and natural in ${language}. Use the ${angleInfo.name} angle throughout.`;
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
            product_analysis,
            market = "morocco",
            language = "darija",
            marketing_angle = "pain_point",
            cost_price = 0,
            selling_price = 99,
            shipping_cost = 0,
            currency = "MAD",
            max_discount = 0,
            landing_page_id,
        } = body;

        if (!workspace_id || !product_analysis) {
            return new Response(JSON.stringify({ error: "workspace_id and product_analysis are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // DETERMINISTIC pricing — never from AI
        const offerCalc = calculateOffer({
            cost_price: Number(cost_price),
            selling_price: Number(selling_price),
            shipping_cost: Number(shipping_cost),
            currency,
            max_discount: Number(max_discount),
        });

        const prompt = buildLandingPagePrompt({
            analysis: product_analysis,
            market,
            language,
            angle: marketing_angle,
            offer: offerCalc,
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
                task: "landing_page",
                prompt,
                workspace_id,
                user_id,
            }),
        });

        const routerData = await routerRes.json();

        if (routerData.error) {
            return new Response(JSON.stringify({ error: routerData.error, code: routerData.code }), {
                status: 503,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Parse landing page JSON
        let contentJson: any;
        try {
            const cleaned = routerData.result
                .replace(/```json\n?/gi, "")
                .replace(/```\n?/gi, "")
                .trim();
            contentJson = JSON.parse(cleaned);
        } catch {
            return new Response(JSON.stringify({ error: "AI returned malformed content. Please try again." }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ─── Conversion QA (deterministic) ────────────────────────────────────────
        const qaIssues: string[] = [];
        const qaRecommendations: string[] = [];

        if (!contentJson.hero?.headline) qaIssues.push("Missing hero headline");
        if (!contentJson.benefits || contentJson.benefits.length < 3) qaIssues.push("Add at least 3 benefits");
        if (!contentJson.faq || contentJson.faq.length < 3) qaIssues.push("Add at least 3 FAQ items");
        if (!contentJson.guarantee) qaIssues.push("Missing satisfaction guarantee");
        if (!contentJson.social_proof?.reviews?.length) qaRecommendations.push("Add customer reviews for social proof");
        if (!contentJson.offer?.urgency_text) qaRecommendations.push("Add urgency text to the offer section");

        const conversionScore = Math.max(50, 100 - qaIssues.length * 10 - qaRecommendations.length * 5);
        const styleScore = 95; // Style DNA is enforced by components, not AI

        // Save or update landing page
        const pageData = {
            workspace_id,
            user_id,
            product_analysis,
            market,
            language,
            marketing_angle,
            angle_details: ANGLE_DETAILS[marketing_angle] || {},
            cost_price,
            selling_price,
            shipping_cost,
            currency,
            max_discount,
            offer_config: offerCalc,
            content_json: contentJson,
            conversion_score: conversionScore,
            style_score: styleScore,
            qa_issues: qaIssues,
            qa_recommendations: qaRecommendations,
        };

        let savedId = landing_page_id;
        if (landing_page_id) {
            await supabase.from("landing_pages").update(pageData).eq("id", landing_page_id);
        } else {
            const { data: saved } = await supabase
                .from("landing_pages")
                .insert({ ...pageData, name: contentJson.page_title || "Landing Page" })
                .select("id")
                .single();
            savedId = saved?.id;
        }

        return new Response(JSON.stringify({
            success: true,
            landing_page_id: savedId,
            content: contentJson,
            offer: offerCalc,
            conversion_score: conversionScore,
            style_score: styleScore,
            qa_issues: qaIssues,
            qa_recommendations: qaRecommendations,
            provider: routerData.provider_used,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error("[ai-generate-landing-page] Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
