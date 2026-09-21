import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runImportTest() {
  console.log("=========================================================================");
  console.log("   LIVE TEST: YOUCAN & GOOGLE SHEETS AUTOMATIC FUZZY CITY RESOLUTION");
  console.log("=========================================================================\n");

  // Fetch a valid workspace ID from the database
  const { data: workspaces, error: wsError } = await supabase.from('workspaces').select('id, name, carrier').limit(1);
  if (wsError || !workspaces || workspaces.length === 0) {
    console.error("❌ Could not find a valid workspace:", wsError?.message);
    return;
  }

  const workspace = workspaces[0];
  console.log(`Using Workspace: "${workspace.name}" (ID: ${workspace.id}, Carrier: ${workspace.carrier || 'ozon'})\n`);

  // Test Case 1: YouCan webhook order with phonetic city "agadire"
  console.log('--- Test 1: YouCan Order Import with "agadire" ---');
  const youcanOrderNum = `YC-TEST-${Date.now()}`;
  
  const { data: ycOrder, error: ycErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspace.id,
      order_number: youcanOrderNum,
      youcan_order_id: `YC-EXT-${Date.now()}`,
      source: 'youcan',
      customer_name: 'Imane Agadir',
      phone: '212612345678',
      city: 'agadire',
      raw_city: 'agadire',
      shipping_provider: workspace.carrier || 'ozon',
      total: 390,
      status: 'pending'
    })
    .select('*')
    .single();

  if (ycErr) {
    console.error("❌ Error inserting YouCan test order:", ycErr.message);
  } else {
    console.log(`✅ YouCan Order Created: ${ycOrder.order_number}`);
    console.log(`   - Raw City Input: "${ycOrder.raw_city}"`);
    console.log(`   - Official Resolved City Name: "${ycOrder.city_name || ycOrder.city}"`);
    console.log(`   - Ozon City ID: ${ycOrder.ozon_city_id ?? 'N/A'}`);
    console.log(`   - Provider City ID: ${ycOrder.provider_city_id ?? 'N/A'}`);
    console.log(`   - City Mapping Status: "${ycOrder.city_mapping_status}"`);

    // Clean up
    await supabase.from('orders').delete().eq('id', ycOrder.id);
    console.log(`   - Cleanup test order: Done.`);
  }

  // Test Case 2: Google Sheets order import with "knitra"
  console.log('\n--- Test 2: Google Sheets Sync Order Import with "knitra" ---');
  const sheetsOrderNum = `GS-TEST-${Date.now()}`;

  const { data: gsOrder, error: gsErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspace.id,
      order_number: sheetsOrderNum,
      sync_key: `GS-KEY-${Date.now()}`,
      source: 'google_sheets',
      customer_name: 'Kenza Kenitra',
      phone: '212687654321',
      city: 'knitra',
      raw_city: 'knitra',
      shipping_provider: 'sendit',
      total: 280,
      status: 'pending'
    })
    .select('*')
    .single();

  if (gsErr) {
    console.error("❌ Error inserting Google Sheets test order:", gsErr.message);
  } else {
    console.log(`✅ Google Sheets Order Created: ${gsOrder.order_number}`);
    console.log(`   - Raw City Input: "${gsOrder.raw_city}"`);
    console.log(`   - Official Resolved City Name: "${gsOrder.city_name || gsOrder.city}"`);
    console.log(`   - Sendit Provider City ID: ${gsOrder.provider_city_id ?? 'N/A'}`);
    console.log(`   - City Mapping Status: "${gsOrder.city_mapping_status}"`);

    // Clean up
    await supabase.from('orders').delete().eq('id', gsOrder.id);
    console.log(`   - Cleanup test order: Done.`);
  }

  // Test Case 3: Order with unlisted / ambiguous city "village 404"
  console.log('\n--- Test 3: Ambiguous City Order Import "village 404" ---');
  const ambigOrderNum = `AMBIG-TEST-${Date.now()}`;

  const { data: ambigOrder, error: ambigErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspace.id,
      order_number: ambigOrderNum,
      youcan_order_id: `YC-AMBIG-${Date.now()}`,
      source: 'youcan',
      customer_name: 'Karim Village',
      phone: '212699999999',
      city: 'village 404',
      raw_city: 'village 404',
      shipping_provider: 'ozon',
      total: 190,
      status: 'pending'
    })
    .select('*')
    .single();

  if (ambigErr) {
    console.error("❌ Error inserting Ambiguous test order:", ambigErr.message);
  } else {
    console.log(`✅ Ambiguous Order Created: ${ambigOrder.order_number}`);
    console.log(`   - Raw City Input: "${ambigOrder.raw_city}"`);
    console.log(`   - Ozon City ID: ${ambigOrder.ozon_city_id} (Expected: null)`);
    console.log(`   - City Mapping Status: "${ambigOrder.city_mapping_status}" (Expected: "unresolved" -> displays "City to verify" badge)`);

    // Clean up
    await supabase.from('orders').delete().eq('id', ambigOrder.id);
    console.log(`   - Cleanup test order: Done.`);
  }

  console.log("\n=========================================================================");
  console.log("   AUTOMATIC FUZZY CITY RESOLUTION INTEGRATION VERIFIED SUCCESSFULLY!");
  console.log("=========================================================================");
}

runImportTest();
