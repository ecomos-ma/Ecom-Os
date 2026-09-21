const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check what columns orders table uses vs. what we're inserting
  // Does it have 'external_order_id' and 'source'?
  const { data: sample, error: sampleError } = await client.rpc("get_shopify_connection_status_v1", { p_workspace_id: "03826be0-e050-42d7-a030-a7d5a8d4f920" });
  console.log("Workspace check:", JSON.stringify(sample));

  // Try inserting/selecting directly as service_role — check RLS
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("workspace_id", "03826be0-e050-42d7-a030-a7d5a8d4f920")
    .order("created_at", { ascending: false })
    .limit(3);
  
  console.log("Orders query error:", error?.message);
  console.log("Orders data:", JSON.stringify(data?.map(o => ({ id: o.id || o["Order ID"], customer_name: o.customer_name || o.Customer, phone: o.phone, source: o.source, created_at: o.created_at })), null, 2));
}

check();
