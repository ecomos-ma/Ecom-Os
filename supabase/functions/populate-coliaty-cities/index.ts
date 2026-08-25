// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COLIATY_BASE_URL = "https://customer-api-v1.coliaty.com";

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get workspace_id from request body
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      throw new Error("workspace_id is required");
    }

    // Get Coliaty API credentials from workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("coliaty_public_key, coliaty_secret_key, coliaty_api_url, coliaty_enabled")
      .eq("id", workspace_id)
      .single();

    if (!workspace?.coliaty_enabled || !workspace?.coliaty_public_key || !workspace?.coliaty_secret_key) {
      throw new Error("Coliaty n'est pas configuré. Veuillez définir la clé publique et secrète dans les paramètres.");
    }

    const COLIATY_BASE_URL = workspace.coliaty_api_url || "https://customer-api-v1.coliaty.com";
    const authHeader = `Bearer ${workspace.coliaty_public_key}:${workspace.coliaty_secret_key}`;

    console.log("Calling Coliaty API: GET /cities/getCities");
    const citiesRes = await fetch(`${COLIATY_BASE_URL}/cities/getCities`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
      },
    });

    const httpStatus = citiesRes.status;
    const httpStatusText = citiesRes.statusText;

    if (!citiesRes.ok) {
      const errorText = await citiesRes.text();
      throw new Error(`Coliaty API error: HTTP ${httpStatus} ${httpStatusText} - ${errorText}`);
    }

    const citiesData = await citiesRes.json();
    console.log("Coliaty API response:", JSON.stringify(citiesData, null, 2));

    // Parse cities data - adjust based on actual response structure
    let citiesToInsert: { id: number; name: string }[] = [];

    if (Array.isArray(citiesData)) {
      citiesToInsert = citiesData.map((c: any) => ({
        id: c.id || c.city_id || c.ID,
        name: c.name || c.city_name || c.NAME || c.city,
      }));
    } else if (citiesData.cities && Array.isArray(citiesData.cities)) {
      citiesToInsert = citiesData.cities.map((c: any) => ({
        id: c.id || c.city_id || c.ID,
        name: c.name || c.city_name || c.NAME || c.city,
      }));
    } else if (citiesData.data && Array.isArray(citiesData.data)) {
      citiesToInsert = citiesData.data.map((c: any) => ({
        id: c.id || c.city_id || c.ID,
        name: c.name || c.city_name || c.NAME || c.city,
      }));
    } else {
      throw new Error("Unexpected Coliaty API response structure");
    }

    // Filter out invalid entries
    citiesToInsert = citiesToInsert.filter(c => c.id && c.name);

    console.log(`Parsed ${citiesToInsert.length} cities from Coliaty API`);

    // Clear existing data
    await supabase.from("coliaty_cities").delete().neq("id", 0);

    // Insert cities in batches
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < citiesToInsert.length; i += batchSize) {
      const batch = citiesToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from("coliaty_cities").insert(batch);
      if (error) {
        throw new Error(`Failed to insert batch ${i / batchSize}: ${error.message}`);
      }
      insertedCount += batch.length;
    }

    // Get sample of inserted cities
    const { data: sampleCities } = await supabase
      .from("coliaty_cities")
      .select("id, name")
      .limit(20)
      .order("id", { ascending: true });

    return new Response(JSON.stringify({
      success: true,
      httpStatus,
      httpStatusText,
      totalInserted: insertedCount,
      sample: sampleCities,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Populate Coliaty cities error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
