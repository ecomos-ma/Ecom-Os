import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const functionIndex = pathSegments.indexOf("ozon-api");
        const targetPath = pathSegments.slice(functionIndex + 1).join("/");

        if (!targetPath) {
            return new Response("Bad request: no target path", { status: 400, headers: corsHeaders });
        }

        // ── Idempotency Guard for Parcel Creation ──
        if (targetPath.includes("add-parcel")) {
            const ecomosOrderId = req.headers.get("x-ecomos-order-id") || req.headers.get("X-Ecomos-Order-Id");
            if (ecomosOrderId) {
                // We need a supabase client using the anon key (or a service key ideally)
                // We can extract authorization header which should be the user's bearer token requested by the frontend
                const authHeader = req.headers.get("authorization");
                if (authHeader) {
                    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
                    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
                    if (supabaseUrl && supabaseAnonKey) {
                        try {
                            const supabase = createClient(supabaseUrl, supabaseAnonKey, {
                                global: { headers: { Authorization: authHeader } }
                            });
                            const { data: existingOrd } = await supabase
                                .from("orders")
                                .select("tracking_number, ozon_raw_response")
                                .eq("id", ecomosOrderId)
                                .maybeSingle();

                            if (existingOrd?.tracking_number) {
                                console.log(`[Ozon Idempotency] Order ${ecomosOrderId} already has tracking ${existingOrd.tracking_number}, returning mock success.`);
                                // Return a simulated Ozon Express "ADD-PARCEL" success payload matching the tracking_number
                                const mockData: any = { "ADD-PARCEL": { "NEW-PARCEL": { "TRACKING-NUMBER": existingOrd.tracking_number } }, "TRACKING-NUMBER": existingOrd.tracking_number };
                                return new Response(JSON.stringify(existingOrd.ozon_raw_response || mockData), {
                                    status: 200,
                                    headers: { ...corsHeaders, "content-type": "application/json" }
                                });
                            }
                        } catch (e) {
                            console.error("[Ozon Idempotency Check Error]", e);
                        }
                    }
                }
            }
        }

        const ozonUrl = `https://api.ozonexpress.ma/${targetPath}`;

        const headers = new Headers();
        const contentType = req.headers.get("content-type");
        if (contentType) {
            headers.set("content-type", contentType);
        }

        const fetchOptions: RequestInit = {
            method: req.method,
            headers,
        };

        if (req.method !== "GET" && req.method !== "HEAD") {
            fetchOptions.body = await req.clone().arrayBuffer();
        }

        const response = await fetch(ozonUrl, fetchOptions);
        const responseText = await response.text();

        return new Response(responseText, {
            status: response.status,
            headers: {
                ...corsHeaders,
                "content-type": response.headers.get("content-type") || "application/json",
            },
        });

    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err.message }),
            { headers: { ...corsHeaders, "content-type": "application/json" }, status: 500 }
        );
    }
});
