import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== COMPARING ANON KEY vs SERVICE ROLE KEY ===\n");

// Mask the API key for security
const maskKey = (key) => {
  if (!key) return "NOT SET";
  if (key.length < 8) return "***TOO SHORT***";
  return key.substring(0, 4) + "..." + key.substring(key.length - 4);
};

console.log("1. API KEYS (MASKED):");
console.log("   ANON_KEY:", maskKey(ANON_KEY));
console.log("   SERVICE_ROLE_KEY:", maskKey(SERVICE_ROLE_KEY));
console.log();

console.log("2. PROJECT URL:");
console.log("   URL:", SUPABASE_URL);
console.log();

const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function testWithKey(key, keyName) {
  console.log(`=== TESTING WITH ${keyName} ===`);
  const supabase = createClient(SUPABASE_URL, key);

  // Test 1: COUNT workspaces
  console.log("1. COUNT workspaces:");
  const { data: wsData, error: wsError } = await supabase
    .from('workspaces')
    .select('*', { count: 'exact', head: true });
  
  if (wsError) {
    console.log("   ❌ ERROR:", wsError.message);
  } else {
    console.log("   ✅ COUNT workspaces:", wsData?.count || 0);
  }

  // Test 2: COUNT orders for workspace Nura
  console.log("2. COUNT orders for workspace Nura:");
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', NURA_WORKSPACE_ID);
  
  if (orderError) {
    console.log("   ❌ ERROR:", orderError.message);
  } else {
    console.log("   ✅ COUNT orders:", orderData?.count || 0);
  }

  // Test 3: Exact frontend query (from OrdersContext.tsx)
  console.log("3. EXACT FRONTEND QUERY (from OrdersContext):");
  const { data: frontendData, error: frontendError } = await supabase
    .from("orders")
    .select(`
      "Order ID",
      order_number,
      customer_id,
      customer_name,
      city,
      city_name,
      address,
      total,
      status,
      delivery_status,
      shipping_status,
      phone,
      sku,
      product_variant,
      tracking_number,
      campaign_id,
      created_at,
      ozon_city_id,
      coliaty_city_id,
      source,
      customers(id, name, phone, city),
      ozon_cities(id, name, delivered_price, returned_price, refused_price)
    `)
    .eq("workspace_id", NURA_WORKSPACE_ID)
    .order("created_at", { ascending: false })
    .limit(5);

  if (frontendError) {
    console.log("   ❌ ERROR:", frontendError.message);
  } else {
    console.log("   ✅ RESULTS:", frontendData?.length || 0, "orders");
  }

  // Test 4: List all workspaces (to see what exists)
  console.log("4. LIST ALL WORKSPACES:");
  const { data: allWs, error: allWsError } = await supabase
    .from('workspaces')
    .select('id, name')
    .limit(10);

  if (allWsError) {
    console.log("   ❌ ERROR:", allWsError.message);
  } else {
    console.log("   ✅ Workspaces found:", allWs?.length || 0);
    if (allWs && allWs.length > 0) {
      allWs.forEach(ws => {
        console.log(`      - ${ws.name} (${ws.id})`);
      });
    }
  }

  console.log();
}

async function run() {
  try {
    await testWithKey(ANON_KEY, "ANON KEY");
    await testWithKey(SERVICE_ROLE_KEY, "SERVICE ROLE KEY");
  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();