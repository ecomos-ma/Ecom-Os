import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== CHECKING TOTAL ORDERS (NO WORKSPACE FILTER) ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. COUNT ALL ORDERS (no filter)
    console.log("1. TOTAL ORDERS IN ENTIRE TABLE:");
    const { data: totalOrders, error: totalError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.log("   ❌ ERROR:", totalError.message);
    } else {
      console.log("   ✅ TOTAL ORDERS:", totalOrders?.count || 0);
    }
    console.log();

    // 2. Check for other order-related tables
    console.log("2. CHECKING FOR OTHER ORDER-RELATED TABLES:");
    const possibleOrderTables = [
      'orders',
      'order_items', 
      'shop_orders',
      'youcan_orders',
      'shopify_orders',
      'woocommerce_orders',
      'order',
      'orders_archive',
      'legacy_orders'
    ];

    for (const tableName of possibleOrderTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (!error) {
          console.log(`   ✅ ${tableName}: ${data?.count || 0} rows`);
        }
      } catch (e) {
        // Table doesn't exist or no access - skip
      }
    }
    console.log();

    // 3. If total orders > 0, show distribution by workspace
    if (totalOrders?.count > 0) {
      console.log("3. ORDERS DISTRIBUTION BY WORKSPACE:");
      const { data: ordersWithWs, error: wsError } = await supabase
        .from('orders')
        .select('workspace_id')
        .limit(1000);

      if (!wsError && ordersWithWs) {
        const wsCounts = {};
        ordersWithWs.forEach(order => {
          wsCounts[order.workspace_id] = (wsCounts[order.workspace_id] || 0) + 1;
        });

        // Get workspace names
        const workspaceIds = Object.keys(wsCounts);
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('id, name')
          .in('id', workspaceIds);

        const wsMap = {};
        wsData?.forEach(ws => {
          wsMap[ws.id] = ws.name;
        });

        Object.entries(wsCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([wsId, count]) => {
            const wsName = wsMap[wsId] || 'Unknown';
            console.log(`   - ${wsName} (${wsId}): ${count} orders`);
          });
      }
    } else {
      console.log("3. NO ORDERS FOUND - CHECKING IF TABLES HAVE DIFFERENT STRUCTURE");
      
      // Try to list all tables to see what actually exists
      console.log("   Attempting to list tables...");
      try {
        const { data: tablesData, error: tablesError } = await supabase
          .rpc('get_tables');
        
        if (!tablesError && tablesData) {
          console.log("   Available tables:", tablesData);
        }
      } catch (e) {
        console.log("   Could not list tables:", e.message);
      }
    }
    console.log();

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();