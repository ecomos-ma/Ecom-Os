import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
  console.log("=== SCHEMA DIAGNOSTICS ===\n");

  try {
    // Check workspaces table for credential columns
    console.log("1. CHECKING WORKSPACES TABLE FOR CREDENTIAL COLUMNS...");
    const { data: workspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('id, name, ozon_client_id, ozon_api_key, coliaty_public_key, coliaty_secret_key')
      .limit(5);
    
    if (workspacesError) {
      console.log("   ❌ Error:", workspacesError.message);
    } else {
      console.log("   ✅ Sample workspace credential fields:");
      workspaces.forEach(ws => {
        console.log(`      Workspace: ${ws.name} (${ws.id})`);
        console.log(`         Ozon Client ID: ${ws.ozon_client_id ? 'SET' : 'NULL'}`);
        console.log(`         Ozon API Key: ${ws.ozon_api_key ? 'SET' : 'NULL'}`);
        console.log(`         Coliaty Public Key: ${ws.coliaty_public_key ? 'SET' : 'NULL'}`);
        console.log(`         Coliaty Secret Key: ${ws.coliaty_secret_key ? 'SET' : 'NULL'}`);
      });
    }

    // Check if orders actually have tracking numbers
    console.log("\n2. CHECKING ORDERS FOR TRACKING NUMBERS...");
    const { data: ordersWithTracking, error: trackingError } = await supabase
      .from('orders')
      .select('order_number, tracking_number, shipping_provider, shipping_status')
      .not('tracking_number', 'is', null)
      .limit(10);
    
    if (trackingError) {
      console.log("   ❌ Error:", trackingError.message);
    } else if (!ordersWithTracking || ordersWithTracking.length === 0) {
      console.log("   ⚠️  No orders with tracking numbers found");
      
      // Check if any orders exist at all
      const { data: allOrders, error: allOrdersError } = await supabase
        .from('orders')
        .select('order_number, tracking_number')
        .limit(5);
      
      if (allOrdersError) {
        console.log("   ❌ Error checking all orders:", allOrdersError.message);
      } else {
        console.log(`   ℹ️  Found ${allOrders.length} total orders (first 5):`);
        allOrders.forEach(order => {
          console.log(`      Order #${order.order_number}: Tracking = ${order.tracking_number || 'NULL'}`);
        });
      }
    } else {
      console.log(`   ✅ Found ${ordersWithTracking.length} orders with tracking numbers:`);
      ordersWithTracking.forEach(order => {
        console.log(`      Order #${order.order_number}: ${order.shipping_provider} | ${order.tracking_number} | Status: ${order.shipping_status || 'Not set'}`);
      });
    }

    // Check shipping_logs table structure
    console.log("\n3. CHECKING SHIPPING_LOGS TABLE STRUCTURE...");
    const { data: shippingLogs, error: logsError } = await supabase
      .from('shipping_logs')
      .select('*')
      .limit(3);
    
    if (logsError) {
      console.log("   ❌ Error:", logsError.message);
    } else if (!shippingLogs || shippingLogs.length === 0) {
      console.log("   ⚠️  No shipping logs found (table might be empty or structure different)");
    } else {
      console.log("   ✅ Sample shipping logs (showing structure):");
      console.log("   Columns:", Object.keys(shippingLogs[0] || {}));
      shippingLogs.forEach((log, i) => {
        console.log(`      Log ${i + 1}:`, JSON.stringify(log, null, 2).substring(0, 200));
      });
    }

    // Check what tables exist
    console.log("\n4. CHECKING IF EXPECTED TABLES EXIST...");
    const tablesToCheck = [
      'shipping_provider_credentials',
      'shipping_sync_logs', 
      'integration_sync_state',
      'shipping_logs',
      'workspace_shipping_providers'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`   ❌ ${table}: ${error.message}`);
        } else {
          console.log(`   ✅ ${table}: Exists (${data.length} rows)`);
        }
      } catch (e) {
        console.log(`   ❌ ${table}: ${e.message}`);
      }
    }

  } catch (error) {
    console.error("❌ SCHEMA CHECK ERROR:", error);
  }
}

checkSchema();