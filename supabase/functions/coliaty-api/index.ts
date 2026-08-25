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

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Accept action from path segment OR from ?action= query param
  const action = url.searchParams.get("action") || pathParts[pathParts.length - 1];

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Parse body ONCE — a Deno ReadableStream can only be consumed once.
    // Storing it here prevents the double req.json() bug where the second
    // call inside action handlers would return {} (empty), making all fields undefined.
    let requestBody: Record<string, any> = {};
    if (req.method === "POST") {
      requestBody = await req.json().catch(() => ({}));
    }

    // Get workspace_id from the already-parsed body (POST) or query params (GET)
    const workspace_id: string | null =
      (req.method === "POST" ? requestBody.workspace_id : null) ??
      url.searchParams.get("workspace_id");

    console.log(`[Coliaty API] action=${action} workspace_id=${workspace_id}`);

    // ── Resolve Coliaty credentials ─────────────────────────────────────────
    // Admin actions use env-level secrets (no workspace needed).
    // All other actions require workspace_id + per-workspace API keys.
    const ADMIN_ACTIONS = ["populate-cities", "analyze-city-mapping", "insert-city-mapping", "city-info"];
    const isAdmin = ADMIN_ACTIONS.includes(action);

    let authHeader: string;
    let COLIATY_BASE_URL: string = "https://customer-api-v1.coliaty.com";

    if (isAdmin) {
      const PUB = Deno.env.get("COLIATY_API_PUBLIC_KEY");
      const SEC = Deno.env.get("COLIATY_API_SECRET_KEY");
      if (!PUB || !SEC) throw new Error("COLIATY_API_PUBLIC_KEY / COLIATY_API_SECRET_KEY not set in env");
      authHeader = `Bearer ${PUB}:${SEC}`;
    } else {
      if (!workspace_id) {
        throw new Error("workspace_id manquant. Veuillez l'inclure dans le body (POST) ou en query param (GET).");
      }
      const { data: workspaceData } = await supabase
        .from("workspaces")
        .select("coliaty_public_key, coliaty_secret_key, coliaty_api_url, coliaty_enabled")
        .eq("id", workspace_id)
        .single();

      if (
        !workspaceData?.coliaty_enabled ||
        !workspaceData?.coliaty_public_key ||
        !workspaceData?.coliaty_secret_key
      ) {
        throw new Error(`Coliaty API key not configured for workspace ${workspace_id}. Please configure it in Settings > Integrations.`);
      }

      authHeader = `Bearer ${workspaceData.coliaty_public_key}:${workspaceData.coliaty_secret_key}`;
      COLIATY_BASE_URL = workspaceData.coliaty_api_url || COLIATY_BASE_URL;
      console.log(`[Coliaty API] Using key from workspace ${workspace_id} (first 8 chars): ${authHeader.substring(0, 15)}...`);
    }

    if (action === "create-parcel" && req.method === "POST") {
      // Use the already-parsed requestBody — DO NOT call req.json() again
      const { order_id, order_number, customer_name, phone, city, address, price } = requestBody;

      // Detailed field validation with specific error messages
      const missingFields = [];
      if (!workspace_id) missingFields.push("workspace_id");
      if (!order_number) missingFields.push("order_number");
      if (!customer_name) missingFields.push("customer_name");
      if (!phone) missingFields.push("phone");
      if (!city) missingFields.push("city");
      if (!address || address.trim() === "") missingFields.push("address");
      if (!price) missingFields.push("price");

      if (missingFields.length > 0) {
        throw new Error(`Champs manquants pour création colis Coliaty : ${missingFields.join(", ")}`);
      }

      // ── Idempotency guard: reject if a parcel already exists for this order ──
      // This prevents duplicate packages on Coliaty if the user clicks twice or retries.
      if (order_number) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("coliaty_parcel_code, tracking_number")
          .eq("order_number", order_number)
          .eq("workspace_id", workspace_id)
          .maybeSingle();

        if (existingOrder?.coliaty_parcel_code) {
          return new Response(JSON.stringify({
            success: false,
            code: "PARCEL_EXISTS",
            message: "Un colis Coliaty existe déjà pour cette commande.",
            parcel_code: existingOrder.coliaty_parcel_code,
          }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      console.log(`[Coliaty API] Creating parcel for order ${order_number}:`, {
        customer_name,
        phone,
        city,
        address: address || "NULL",
        price,
      });

      // Resolve city ID using city_arabic_names table (carrier='coliaty')
      const { data: cityMatch } = await supabase
        .from("city_arabic_names")
        .select("carrier_city_id")
        .eq("carrier", "coliaty")
        .eq("arabic_name", city.trim())
        .single();

      let cityId = cityMatch?.carrier_city_id;

      // Fallback: try to find a Coliaty city that is contained in the order city name
      // Priority: exact match first, then shortest partial match (avoids ambiguity)
      if (!cityId) {
        const { data: allCities } = await supabase
          .from("coliaty_cities")
          .select("id, name")
          .limit(1000);

        if (allCities) {
          const cityLower = city.trim().toLowerCase();

          // First, try exact match
          const exactMatch = allCities.find(c => c.name.toLowerCase() === cityLower);
          if (exactMatch) {
            cityId = exactMatch.id;
          } else {
            // Then, try partial matches and choose the shortest Coliaty city name
            const partialMatches = allCities.filter(c => cityLower.includes(c.name.toLowerCase()));
            if (partialMatches.length > 0) {
              // Sort by name length ascending (shortest = most likely main city)
              partialMatches.sort((a, b) => a.name.length - b.name.length);
              cityId = partialMatches[0].id;
            }
          }
        }
      }

      if (!cityId) {
        throw new Error(`Ville non résolue pour Coliaty : "${city}" — veuillez corriger la ville de la commande avant l'envoi`);
      }

      console.log(`[Coliaty API] City resolved: "${city}" -> cityId=${cityId}`);

      // Prepare Coliaty API payload
      const coliatyPayload = {
        package_content: "Commande",
        package_reciever: customer_name,
        package_phone: phone,
        package_price: Number(price),
        package_city: cityId,
        package_addresse: address,
      };

      console.log(`[Coliaty API] Sending payload to Coliaty:`, JSON.stringify(coliatyPayload, null, 2));

      // Create parcel via Coliaty API
      const parcelRes = await fetch(`${COLIATY_BASE_URL}/parcel/normal`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(coliatyPayload),
      });

      if (!parcelRes.ok) {
        const errorText = await parcelRes.text();
        throw new Error(`Coliaty API error: ${errorText}`);
      }

      const parcelData = await parcelRes.json();
      console.log("Coliaty API full response:", JSON.stringify(parcelData, null, 2));

      // The real tracking code is in data.package_code, not in the top-level "code" (which is HTTP status)
      const parcelCode = parcelData.data?.package_code || parcelData.parcel_code || parcelData.code || parcelData.tracking || parcelData.TRACKING;

      // Update order with coliaty_parcel_code AND standardized tracking fields
      const now = new Date().toISOString();
      await supabase
        .from("orders")
        .update({
          coliaty_parcel_code: parcelCode,
          tracking_number: parcelCode,
          shipping_provider: "coliaty",
          shipping_status: "NEW_PARCEL",
          delivery_status: "NEW_PARCEL",
          parcel_created_at: now,
          shipping_updated_at: now,
        })
        .eq("order_number", order_number)
        .eq("workspace_id", workspace_id);

      return new Response(JSON.stringify({
        success: true,
        parcel_code: parcelCode,
        coliaty_full_response: parcelData // Return full response for debugging
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "parcel-status" && req.method === "GET") {
      const parcel_code = url.searchParams.get("parcel_code");

      if (!parcel_code) {
        throw new Error("parcel_code query parameter is required");
      }

      // Get parcel status from Coliaty API
      const statusRes = await fetch(`${COLIATY_BASE_URL}/parcel/status/${parcel_code}`, {
        method: "GET",
        headers: {
          "Authorization": authHeader,
        },
      });

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        throw new Error(`Coliaty API error: ${errorText}`);
      }

      const statusData = await statusRes.json();

      return new Response(JSON.stringify({ success: true, data: statusData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "populate-cities") {
      // ── Fetch cities from Coliaty ────────────────────────────────────────────
      const citiesRes = await fetch(`${COLIATY_BASE_URL}/cities/getCities`, {
        method: "GET",
        headers: { "Authorization": authHeader },
      });

      const rawText = await citiesRes.text();

      if (!citiesRes.ok) {
        // Return the raw body so we can see if it's a Cloudflare page or a JSON error
        return new Response(JSON.stringify({
          success: false,
          http_status: citiesRes.status,
          http_status_text: citiesRes.statusText,
          raw_response: rawText.substring(0, 2000), // cap at 2 KB to stay readable
        }), {
          status: 200, // always 200 so the outer error handler doesn't swallow details
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const citiesData = JSON.parse(rawText);

      // Normalise: Coliaty may return an array, or { cities:[…] }, or { data:[…] }
      let raw: any[] = [];
      if (Array.isArray(citiesData)) {
        raw = citiesData;
      } else if (Array.isArray(citiesData?.cities)) {
        raw = citiesData.cities;
      } else if (Array.isArray(citiesData?.data)) {
        raw = citiesData.data;
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: "Unexpected Coliaty response structure",
          raw_response: rawText.substring(0, 2000),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const citiesToInsert = raw
        .map((c: any) => ({
          id: Number(c.id ?? c.city_id ?? c.ID),
          name: String(c.name ?? c.city_name ?? c.NAME ?? c.city ?? ""),
        }))
        .filter(c => c.id && c.name);

      // ── Upsert into coliaty_cities ──────────────────────────────────────────
      const { error: upsertError } = await supabase
        .from("coliaty_cities")
        .upsert(citiesToInsert, { onConflict: "id" });

      if (upsertError) {
        throw new Error(`DB upsert failed: ${upsertError.message}`);
      }

      // ── Sample ──────────────────────────────────────────────────────────────
      const { data: sample } = await supabase
        .from("coliaty_cities")
        .select("id, name")
        .order("id")
        .limit(15);

      return new Response(JSON.stringify({
        success: true,
        count: citiesToInsert.length,
        sample,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "analyze-city-mapping") {
      // ── 1. Load all distinct ozon rows (arabic_name + ozon city latin name) ─
      const { data: ozonRows, error: ozonErr } = await supabase
        .from("city_arabic_names")
        .select("id, arabic_name, ozon_city_id, ozon_cities(id, name)")
        .eq("carrier", "ozon");
      if (ozonErr) throw new Error(`ozon fetch: ${ozonErr.message}`);

      // ── 2. Load all coliaty cities ───────────────────────────────────────────
      const { data: coliatyCities, error: ccErr } = await supabase
        .from("coliaty_cities")
        .select("id, name");
      if (ccErr) throw new Error(`coliaty_cities fetch: ${ccErr.message}`);

      // Helpers
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

      const coliatyNorm = coliatyCities!.map((c: any) => ({
        ...c,
        norm: normalize(c.name),
      }));

      // Group ozon rows by ozon_city_id to work per city (not per alias)
      const byOzonCity = new Map<number, { ozonName: string; arabicNames: { id: number; arabic: string }[] }>();
      for (const row of ozonRows as any[]) {
        const ozonCityId = row.ozon_city_id;
        const ozonName = row.ozon_cities?.name ?? "";
        if (!byOzonCity.has(ozonCityId)) {
          byOzonCity.set(ozonCityId, { ozonName, arabicNames: [] });
        }
        byOzonCity.get(ozonCityId)!.arabicNames.push({ id: row.id, arabic: row.arabic_name });
      }

      // Cities the user flagged as requiring manual review
      const AMBIGUOUS_CITIES = [
        "casablanca", "nador", "mohammedia", "taza", "laayoune",
        "ouarzazate", "dakhla", "marrakech", "rabat", "fes", "fès",
        "tanger", "agadir",
      ];

      const ambiguous: any[] = [];
      const automatic: any[] = [];
      const notFound: any[] = [];

      for (const [ozonCityId, { ozonName, arabicNames }] of byOzonCity) {
        const searchToken = normalize(ozonName);

        // Check if this city is in the ambiguous list
        const isAmbiguous = AMBIGUOUS_CITIES.some(a => searchToken.includes(a) || a.includes(searchToken));

        // a) Exact match (normalised, case-insensitive)
        const exactMatch = coliatyNorm.find((c: any) => c.norm === searchToken);

        // b) ILIKE candidates — all names that contain the token (or token contains them)
        //    sorted by name length ASC → shortest first
        const ilikeCandidates = coliatyNorm
          .filter((c: any) => c.norm.includes(searchToken) || searchToken.includes(c.norm))
          .sort((a: any, b: any) => a.name.length - b.name.length);

        const bestAuto = exactMatch ?? ilikeCandidates[0] ?? null;

        if (isAmbiguous) {
          ambiguous.push({
            ozon_city_id: ozonCityId,
            ozon_name: ozonName,
            arabic_names: arabicNames.map(a => a.arabic),
            candidates: ilikeCandidates.map((c: any) => ({ id: c.id, name: c.name })),
            suggested: bestAuto ? { id: bestAuto.id, name: bestAuto.name } : null,
          });
        } else if (bestAuto) {
          automatic.push({
            ozon_city_id: ozonCityId,
            ozon_name: ozonName,
            coliaty_city_id: bestAuto.id,
            coliaty_name: bestAuto.name,
            match_type: exactMatch ? "exact" : "ilike_shortest",
            arabic_names: arabicNames.map(a => a.arabic),
            row_ids: arabicNames.map(a => a.id),
          });
        } else {
          notFound.push({
            ozon_city_id: ozonCityId,
            ozon_name: ozonName,
            arabic_names: arabicNames.map(a => a.arabic),
          });
        }
      }

      return new Response(JSON.stringify({
        summary: {
          automatic: automatic.length,
          ambiguous: ambiguous.length,
          not_found: notFound.length,
          total_ozon_cities: byOzonCity.size,
        },
        ambiguous,
        automatic,
        not_found: notFound,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "insert-city-mapping") {
      // Body: { mappings: [{ arabic_name_row_id, coliaty_city_id }] }
      // Each entry creates ONE new row in city_arabic_names with carrier='coliaty'
      // matching the arabic_name from the given ozon row.
      // NOTE: requestBody is pre-parsed at the top — do NOT call req.json() again.
      const mappings: { arabic_name_row_id: number; coliaty_city_id: number }[] = requestBody.mappings ?? [];

      if (!Array.isArray(mappings) || mappings.length === 0) {
        throw new Error("Body must contain a non-empty 'mappings' array");
      }

      // Fetch all referenced ozon rows in one query
      const rowIds = mappings.map(m => m.arabic_name_row_id);
      const { data: ozonRows, error: fetchErr } = await supabase
        .from("city_arabic_names")
        .select("id, arabic_name, ozon_city_id")
        .in("id", rowIds)
        .eq("carrier", "ozon");
      if (fetchErr) throw new Error(`ozon row fetch: ${fetchErr.message}`);

      const ozonById = new Map((ozonRows as any[]).map(r => [r.id, r]));

      const toInsert = mappings
        .map(m => {
          const ozon = ozonById.get(m.arabic_name_row_id);
          if (!ozon) return null;
          return {
            arabic_name: ozon.arabic_name,
            carrier: "coliaty",
            carrier_city_id: m.coliaty_city_id,
            // keep ozon_city_id nullable — this column belongs to legacy schema
            ozon_city_id: ozon.ozon_city_id, // required by NOT NULL constraint on legacy col
          };
        })
        .filter(Boolean);

      const { error: insertErr } = await supabase
        .from("city_arabic_names")
        .insert(toInsert);
      if (insertErr) throw new Error(`insert: ${insertErr.message}`);

      // Sample of what was inserted
      const { data: sample } = await supabase
        .from("city_arabic_names")
        .select("id, arabic_name, carrier, carrier_city_id")
        .eq("carrier", "coliaty")
        .order("id")
        .limit(20);

      return new Response(JSON.stringify({
        success: true,
        inserted: toInsert.length,
        sample,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "create-pickup-note" && req.method === "POST") {
      // Create an empty pickup note (bon de ramassage)
      // workspace_id already validated above, coliatyApiKey already loaded from correct workspace
      const pickupNoteRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/create`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!pickupNoteRes.ok) {
        const errorText = await pickupNoteRes.text();
        throw new Error(`Coliaty API error creating pickup note: ${errorText}`);
      }

      const pickupNoteData = await pickupNoteRes.json();
      const reference = pickupNoteData.data?.reference || pickupNoteData.reference || pickupNoteData.ref;

      if (!reference) {
        throw new Error("Coliaty API did not return a reference for the pickup note");
      }

      return new Response(JSON.stringify({
        success: true,
        reference,
        coliaty_full_response: pickupNoteData,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "add-parcels-to-pickup-note" && req.method === "POST") {
      // Add parcels to an existing pickup note
      // Use already-parsed requestBody — DO NOT call req.json() again
      const { reference, parcel_codes } = requestBody;

      if (!reference) {
        throw new Error("reference is required");
      }
      if (!parcel_codes || !Array.isArray(parcel_codes) || parcel_codes.length === 0) {
        throw new Error("parcel_codes is required and must be a non-empty array");
      }

      const addParcelsRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/add-parcels`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickup_note_reference: reference,
          parcel_codes,
        }),
      });

      const addParcelsText = await addParcelsRes.text();
      console.log("Coliaty API add-parcels response:", addParcelsText);

      if (!addParcelsRes.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `Coliaty API error adding parcels to pickup note: ${addParcelsText}`,
          coliaty_full_response: addParcelsText,
          request_body: JSON.stringify({ pickup_note_reference: reference, parcel_codes }),
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const addParcelsData = JSON.parse(addParcelsText);

      // Check for partial failures in error_parcels
      const errorParcels = addParcelsData.data?.error_parcels || {};
      const successParcels = addParcelsData.data?.success_parcels || [];

      if (Object.keys(errorParcels).length > 0) {
        return new Response(JSON.stringify({
          success: false,
          partial_success: successParcels.length > 0,
          error_parcels: errorParcels,
          success_parcels: successParcels,
          error: "Some parcels failed to be added to pickup note",
          coliaty_full_response: addParcelsData,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        success_parcels: successParcels,
        coliaty_full_response: addParcelsData,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "generate-pickup-note-labels" && req.method === "GET") {
      // Generate labels/PDF for a pickup note
      const reference = url.searchParams.get("reference");

      if (!reference) {
        throw new Error("reference query parameter is required");
      }

      const generateLabelsRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/${reference}/generate-labels`, {
        method: "GET",
        headers: {
          "Authorization": authHeader,
        },
      });

      if (!generateLabelsRes.ok) {
        const errorText = await generateLabelsRes.text();
        throw new Error(`Coliaty API error generating pickup note labels: ${errorText}`);
      }

      // The API returns the PDF directly (binary)
      const contentType = generateLabelsRes.headers.get("content-type") || "application/pdf";
      const pdfBuffer = await generateLabelsRes.arrayBuffer();

      // Return the PDF directly with proper headers
      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="pickup-note-${reference}.pdf"`,
        },
      });

    } else if (action === "city-info") {
      // Probe the Coliaty API for metadata on a specific city_id.
      // Tries several common endpoint patterns until one returns 200.
      const cityId = url.searchParams.get("city_id");
      if (!cityId) throw new Error("city_id query parameter is required");

      const candidates = [
        `${COLIATY_BASE_URL}/cities/getCity/${cityId}`,
        `${COLIATY_BASE_URL}/cities/${cityId}`,
        `${COLIATY_BASE_URL}/cities/info/${cityId}`,
        `${COLIATY_BASE_URL}/cities/getCityById/${cityId}`,
      ];

      const results: any[] = [];
      for (const endpoint of candidates) {
        const r = await fetch(endpoint, {
          method: "GET",
          headers: { "Authorization": authHeader },
        });
        const body = await r.text();
        results.push({
          endpoint,
          status: r.status,
          // Only include body if not a Cloudflare/HTML error page
          body: body.startsWith("<") ? `[HTML ${body.length} chars]` : body.substring(0, 1000),
        });
        if (r.ok) break; // stop at first success
      }

      // Also return the city row from our own coliaty_cities table for cross-reference
      const { data: dbRow } = await supabase
        .from("coliaty_cities")
        .select("id, name")
        .eq("id", cityId)
        .single();

      return new Response(JSON.stringify({ city_id: cityId, db_row: dbRow, api_probes: results }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    console.error("Coliaty API error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
