import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deployAndTest() {
  console.log("=== DEPLOYING FUZZY MATCHING TRIGGER & RPC TO SUPABASE ===\n");

  const migrationSQL = readFileSync('./supabase/migrations/20260912000000_fuzzy_city_matching.sql', 'utf8');

  // Split and execute SQL statements
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt) {
      console.log(`Executing SQL statement ${i + 1}/${statements.length}...`);
      const { error } = await supabase.rpc('exec_sql', { query: stmt });
      if (error) {
        console.log(`Statement ${i + 1} info:`, error.message);
      } else {
        console.log(`✅ Statement ${i + 1} executed`);
      }
    }
  }

  console.log("\n=== TESTING AUTOMATIC CITY RESOLUTION ON ORDER IMPORT (YOUCAN / GOOGLE SHEETS / API) ===");

  // Test 1: Order with phonetic city "agadire" (Ozon carrier)
  const testWorkspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  const testOrderNumber = `TEST-YOUCAN-${Date.now()}`;

  console.log(`\n1. Inserting test order "${testOrderNumber}" with raw_city: "agadire" (Ozon carrier)...`);

  const { data: insertedOrder, error: insertErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: testWorkspaceId,
      order_number: testOrderNumber,
      source: 'youcan',
      youcan_order_id: `YC-${Date.now()}`,
      customer_name: 'Test YouCan Customer',
      phone: '212600000001',
      city: 'agadire',
      raw_city: 'agadire',
      shipping_provider: 'ozon',
      total: 250,
      status: 'pending'
    })
    .select('*')
    .single();

  if (insertErr) {
    console.error("❌ Error inserting test order:", insertErr.message);
  } else {
    console.log("✅ Order inserted successfully!");
    console.log(`  - Raw City: "${insertedOrder.raw_city}"`);
    console.log(`  - Resolved City Name: "${insertedOrder.city_name || insertedOrder.city}"`);
    console.log(`  - Resolved Ozon City ID: ${insertedOrder.ozon_city_id}`);
    console.log(`  - City Mapping Status: "${insertedOrder.city_mapping_status}"`);
    console.log(`  - Confidence Score: ${insertedOrder.city_mapping_confidence}`);

    // Cleanup test order
    await supabase.from('orders').delete().eq('id', insertedOrder.id);
    console.log(`\nCleaning up test order ID ${insertedOrder.id}... Done.`);
  }

  // Test 2: Sendit order with phonetic city "knitra"
  const testOrderSendit = `TEST-SENDIT-${Date.now()}`;
  console.log(`\n2. Inserting test order "${testOrderSendit}" with raw_city: "knitra" (Sendit carrier)...`);

  const { data: senditOrder, error: senditErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: testWorkspaceId,
      order_number: testOrderSendit,
      source: 'google_sheets',
      sync_key: `GS-${Date.now()}`,
      customer_name: 'Test Sheet Customer',
      phone: '212600000002',
      city: 'knitra',
      raw_city: 'knitra',
      shipping_provider: 'sendit',
      total: 300,
      status: 'pending'
    })
    .select('*')
    .single();

  if (senditErr) {
    console.error("❌ Error inserting Sendit test order:", senditErr.message);
  } else {
    console.log("✅ Sendit Order inserted successfully!");
    console.log(`  - Raw City: "${senditOrder.raw_city}"`);
    console.log(`  - Resolved City Name: "${senditOrder.city_name || senditOrder.city}"`);
    console.log(`  - Resolved Provider City ID: ${senditOrder.provider_city_id}`);
    console.log(`  - City Mapping Status: "${senditOrder.city_mapping_status}"`);

    await supabase.from('orders').delete().eq('id', senditOrder.id);
    console.log(`\nCleaning up test order ID ${senditOrder.id}... Done.`);
  }

  // Test 3: Ambiguous small village order "village micro 404"
  const testOrderAmbiguous = `TEST-UNRESOLVED-${Date.now()}`;
  console.log(`\n3. Inserting test order "${testOrderAmbiguous}" with raw_city: "village micro 404"...`);

  const { data: ambigOrder, error: ambigErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: testWorkspaceId,
      order_number: testOrderAmbiguous,
      source: 'youcan',
      youcan_order_id: `YC-AMBIG-${Date.now()}`,
      customer_name: 'Test Ambiguous Customer',
      phone: '212600000003',
      city: 'village micro 404',
      raw_city: 'village micro 404',
      shipping_provider: 'ozon',
      total: 150,
      status: 'pending'
    })
    .select('*')
    .single();

  if (ambigErr) {
    console.error("❌ Error inserting ambiguous test order:", ambigErr.message);
  } else {
    console.log("✅ Ambiguous Order inserted successfully!");
    console.log(`  - Raw City: "${ambigOrder.raw_city}"`);
    console.log(`  - Ozon City ID: ${ambigOrder.ozon_city_id} (Expected: null)`);
    console.log(`  - City Mapping Status: "${ambigOrder.city_mapping_status}" (Expected: unresolved -> displays "City to verify" badge)`);

    await supabase.from('orders').delete().eq('id', ambigOrder.id);
    console.log(`\nCleaning up test order ID ${ambigOrder.id}... Done.`);
  }
}

deployAndTest();
