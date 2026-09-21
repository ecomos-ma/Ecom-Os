const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check if orders table has a column called "provider_payload_updated_at"
  // and what columns we're attempting to upsert that might not exist
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("workspace_id", "03826be0-e050-42d7-a030-a7d5a8d4f920")
    .limit(1);

  if (data && data[0]) {
    const cols = Object.keys(data[0]);
    // Check for columns we're trying to write
    const checkCols = ["external_order_id", "source", "raw_city", "ozon_city_id", "provider_city_id", "shipping_status", "provider_payload_updated_at"];
    console.log("Column presence check:");
    for (const col of checkCols) {
      console.log(`  ${col}: ${cols.includes(col) ? "EXISTS" : "MISSING"}`);
    }
  }
}

check();
