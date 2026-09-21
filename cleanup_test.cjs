const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  const { error } = await client
    .from("orders")
    .delete()
    .eq("external_order_id", "TEST_SHOPIFY_12345")
    .eq("workspace_id", "03826be0-e050-42d7-a030-a7d5a8d4f920");
  console.log("Cleanup error:", error?.message ?? "none — test row deleted");
}

cleanup();
