const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check the orders table schema — does it have external_order_id and source?
  const { data: sample, error } = await client
    .from("orders")
    .select("*")
    .limit(1);
  
  if (error) {
    console.log("Error querying orders:", error.message);
    return;
  }
  
  if (sample && sample.length > 0) {
    console.log("Orders table columns:", Object.keys(sample[0]));
  } else {
    console.log("Orders table is empty or no rows returned");
  }

  // Check total order count
  const { count } = await client
    .from("orders")
    .select("id", { count: "exact", head: true });
  console.log("Total orders count:", count);

  // Check the most recent 3 orders regardless of source
  const { data: recent } = await client
    .from("orders")
    .select("id, customer_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("Most recent 3 orders:", JSON.stringify(recent, null, 2));
}

check();
