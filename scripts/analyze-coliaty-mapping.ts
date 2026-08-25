// deno run --allow-net --allow-env scripts/analyze-coliaty-mapping.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://wxfialbmyfkafobtkrde.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

async function main() {
  console.log("Calling coliaty-api analyze-city-mapping...");
  
  const res = await fetch(`${SUPABASE_URL}/functions/v1/coliaty-api?action=analyze-city-mapping`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  console.log(`HTTP Status: ${res.status} ${res.statusText}`);
  
  if (!res.ok) {
    console.error(`Error: ${text}`);
    Deno.exit(1);
  }

  const data = JSON.parse(text);
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(data.summary, null, 2));
  
  console.log("\n=== AMBIGUOUS CITIES (sample) ===");
  console.log(JSON.stringify(data.ambiguous.slice(0, 5), null, 2));
  
  console.log("\n=== AUTOMATIC MAPPINGS (sample) ===");
  console.log(JSON.stringify(data.automatic.slice(0, 5), null, 2));
  
  console.log("\n=== NOT FOUND (sample) ===");
  console.log(JSON.stringify(data.not_found.slice(0, 5), null, 2));
  
  console.log(`\nTotal: ${data.summary.total_ozon_cities} Ozon cities`);
  console.log(`Automatic: ${data.summary.automatic}`);
  console.log(`Ambiguous: ${data.summary.ambiguous}`);
  console.log(`Not found: ${data.summary.not_found}`);
}

main();
