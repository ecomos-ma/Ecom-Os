const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await client
    .from("orders")
    .select("\"Order ID\", external_order_id, source, customer_name, phone, total, created_at")
    .eq("source", "shopify")
    .order("created_at", { ascending: false })
    .limit(5);
  
  if (error) {
    console.error("Query Error:", error.message);
  } else {
    console.log("Shopify Orders:", JSON.stringify(data, null, 2));
  }
}

check();
