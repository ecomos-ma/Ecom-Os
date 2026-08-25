// deno run --allow-net --allow-env scripts/populate-coliaty-cities.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://wxfialbmyfkafobtkrde.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const COLIATY_PUBLIC_KEY = Deno.env.get("COLIATY_API_PUBLIC_KEY");
const COLIATY_SECRET_KEY = Deno.env.get("COLIATY_API_SECRET_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY || !COLIATY_PUBLIC_KEY || !COLIATY_SECRET_KEY) {
  console.error("Missing required environment variables");
  Deno.exit(1);
}

const COLIATY_BASE_URL = "https://customer-api-v1.coliaty.com";

async function main() {
  console.log("Fetching cities from Coliaty API...");
  
  const authHeader = `Bearer ${COLIATY_PUBLIC_KEY}:${COLIATY_SECRET_KEY}`;
  
  const citiesRes = await fetch(`${COLIATY_BASE_URL}/cities/getCities`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
    },
  });

  console.log(`HTTP Status: ${citiesRes.status} ${citiesRes.statusText}`);

  if (!citiesRes.ok) {
    const errorText = await citiesRes.text();
    console.error(`Coliaty API error: ${errorText}`);
    Deno.exit(1);
  }

  const citiesData = await citiesRes.json();
  console.log("Coliaty API response structure:", JSON.stringify(citiesData, null, 2).substring(0, 500));

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
    console.error("Unexpected Coliaty API response structure");
    Deno.exit(1);
  }

  citiesToInsert = citiesToInsert.filter(c => c.id && c.name);
  console.log(`Parsed ${citiesToInsert.length} cities from Coliaty API`);

  // Clear existing data
  console.log("Clearing existing coliaty_cities...");
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/coliaty_cities`, {
    method: "DELETE",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  console.log(`Delete status: ${deleteRes.status}`);

  // Insert cities in batches
  const batchSize = 100;
  let insertedCount = 0;

  for (let i = 0; i < citiesToInsert.length; i += batchSize) {
    const batch = citiesToInsert.slice(i, i + batchSize);
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/coliaty_cities`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(batch),
    });
    
    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      console.error(`Failed to insert batch ${i / batchSize}: ${errorText}`);
    } else {
      insertedCount += batch.length;
      console.log(`Inserted batch ${i / batchSize + 1} (${insertedCount}/${citiesToInsert.length})`);
    }
  }

  console.log(`\nTotal inserted: ${insertedCount} cities`);

  // Get sample
  const sampleRes = await fetch(`${SUPABASE_URL}/rest/v1/coliaty_cities?select=id,name&limit=20&order=id`, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const sample = await sampleRes.json();
  console.log("\nSample cities:");
  console.table(sample);
}

main();
