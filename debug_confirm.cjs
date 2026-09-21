const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // orders table uses "Order ID" not "id" based on earlier column dump
  const { data, error } = await client
    .from("orders")
    .select("external_order_id, customer_name, phone, total, source, created_at")
    .eq("external_order_id", "TEST_SHOPIFY_12345")
    .maybeSingle();
  console.log("Test row in DB:", JSON.stringify(data, null, 2));
  console.log("Error:", error?.message);
}

check();
