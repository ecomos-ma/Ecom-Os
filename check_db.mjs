import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Copied utility functions from edge function for accurate extraction
const clean = (value) => String(value ?? "").trim();
const numberOrNull = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function extractForceLogCities(input) {
  const queue = [input];
  const visited = new Set();
  while (queue.length) {
    let candidate = queue.shift();
    if (typeof candidate === "string") {
      try { candidate = JSON.parse(candidate); } catch { continue; }
    }
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.some((city) => city && typeof city === "object" && (city.CODE || city.code || city.NAME || city.name || city.CITY_NAME || city.city_name))) {
        return candidate.map((city, index) => [String(city?.ID ?? city?.id ?? city?.CITY_ID ?? city?.city_id ?? index), city]);
      }
      queue.push(...candidate);
      continue;
    }
    const entries = Object.entries(candidate);
    if (entries.some(([, city]) => city && typeof city === "object" && (city.CODE || city.code || city.NAME || city.name || city.CITY_NAME || city.city_name))) {
      return entries;
    }
    queue.push(...entries.map(([, value]) => value));
  }
  return [];
}

async function run() {
  console.log("=== 1. Fetching Workspace Integration ===");
  const { data: integrations, error: intError } = await supabase
    .from('workspace_forcelog_integrations')
    .select('*')
    .eq('enabled', true);

  if (intError) {
    console.error("Error fetching integrations:", intError);
    return;
  }
  
  if (!integrations || integrations.length === 0) {
    console.log("No enabled Forcelog integrations found in database.");
    return;
  }

  const integration = integrations[0];
  const workspaceId = integration.workspace_id;
  const apiKey = integration.api_key;
  
  console.log(`Found workspace_id: ${workspaceId}`);
  
  console.log("\n=== 2. Fetching Cities from Forcelog.ma ===");
  let rawRes;
  try {
    rawRes = await fetch("https://api.forcelog.ma/customer/Cities", {
      headers: { "X-API-Key": apiKey }
    });
  } catch (err) {
    console.error("Raw fetch failed:", err.message);
    return;
  }
  
  const data = await rawRes.json();
  const cityEntries = extractForceLogCities(data);
  console.log(`Extracted ${cityEntries.length} cities from payload.`);
  
  const rows = cityEntries.map(([id, city]) => ({
    workspace_id: workspaceId,
    provider_city_id: Number(city?.ID ?? city?.id ?? city?.CITY_ID ?? city?.city_id ?? id),
    code: clean(city?.CODE ?? city?.code ?? city?.CITY_CODE ?? city?.city_code),
    name: clean(city?.NAME ?? city?.name ?? city?.CITY_NAME ?? city?.city_name),
    delivered_price: numberOrNull(city?.D_FEES ?? city?.d_fees ?? city?.DELIVERY_FEES),
    same_city_price: numberOrNull(city?.D_FEES_SAME_CITY ?? city?.d_fees_same_city ?? city?.SAME_CITY_FEES),
    raw_data: { CODE: city?.CODE ?? city?.code ?? null, NAME: city?.NAME ?? city?.name ?? null, D_FEES: city?.D_FEES ?? city?.d_fees ?? null, D_FEES_SAME_CITY: city?.D_FEES_SAME_CITY ?? city?.d_fees_same_city ?? null },
    updated_at: new Date().toISOString(),
  })).filter(row => Number.isFinite(row.provider_city_id) && row.code && row.name);
  
  console.log(`Validated ${rows.length} cities to insert.`);
  
  if (rows.length === 0) {
      console.log("No valid rows to insert.");
      return;
  }
  
  console.log("\n=== 3. Upserting to Database ===");
  const { error: upsertError } = await supabase
    .from("forcelog_cities")
    .upsert(rows, { onConflict: "workspace_id,provider_city_id" });
    
  if (upsertError) {
      console.error("Failed to upsert cities:", upsertError);
  } else {
      console.log("Successfully upserted cities.");
  }

  console.log("\n=== 4. Counting Cities in DB ===");
  const { count, error: countError } = await supabase
    .from('forcelog_cities')
    .select('provider_city_id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  if (countError) {
    console.error("Error counting cities:", countError);
  } else {
    console.log(`Total cities for this workspace in DB: ${count}`);
  }
}

run();
