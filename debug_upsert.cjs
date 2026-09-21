const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check if there's a NOT NULL constraint or other required field we're missing
  // Try doing the exact same upsert the webhook would do, with a fake payload
  const { data, error } = await client.from("orders").upsert({
    workspace_id: "03826be0-e050-42d7-a030-a7d5a8d4f920",
    external_order_id: "TEST_SHOPIFY_12345",
    order_date: new Date().toISOString(),
    customer_name: "Test Customer",
    phone: "212675725365",
    raw_city: "Casablanca",
    city: "casablanca",
    ozon_city_id: null,
    provider_city_id: null,
    province: null,
    country: "Morocco",
    total: "699.95",
    currency: "USD",
    product_name: "The Complete Snowboard",
    product_variant: null,
    quantity: 1,
    unit_price: "699.95",
    status: "pending",
    shipping_status: "unfulfilled",
    notes: "Shopify #PH0Q10QGP",
    source: "shopify"
  }, {
    onConflict: "workspace_id,external_order_id",
    ignoreDuplicates: true
  });
  
  console.log("Test upsert error:", JSON.stringify(error, null, 2));
  console.log("Test upsert data:", JSON.stringify(data, null, 2));
}

check();
