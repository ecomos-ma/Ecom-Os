import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== PLAIN SELECT QUERIES (NO COUNT) ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. Plain SELECT * FROM orders LIMIT 5
    console.log("1. SELECT * FROM orders LIMIT 5:");
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(5);

    if (ordersError) {
      console.log("   ❌ ERROR:", ordersError.message);
      console.log("   Code:", ordersError.code);
      console.log("   Details:", ordersError.details);
    } else {
      console.log("   ✅ Result:", orders?.length || 0, "rows");
      if (orders && orders.length > 0) {
        console.log("   Sample orders:");
        orders.slice(0, 3).forEach(order => {
          console.log(`   - Order #${order.order_number}: ${order.customer_name} - ${order.city} - ${order.status}`);
        });
      } else {
        console.log("   ❌ Empty array - no orders found");
      }
    }
    console.log();

    // 2. Plain SELECT with workspace filter
    const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';
    console.log("2. SELECT * FROM orders WHERE workspace_id = Nura LIMIT 5:");
    const { data: nuraOrders, error: nuraError } = await supabase
      .from('orders')
      .select('*')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .limit(5);

    if (nuraError) {
      console.log("   ❌ ERROR:", nuraError.message);
    } else {
      console.log("   ✅ Result:", nuraOrders?.length || 0, "rows");
      if (nuraOrders && nuraOrders.length > 0) {
        console.log("   Sample Nura orders:");
        nuraOrders.slice(0, 3).forEach(order => {
          console.log(`   - Order #${order.order_number}: ${order.customer_name} - ${order.city} - ${order.status}`);
        });
      } else {
        console.log("   ❌ Empty array - no Nura orders found");
      }
    }
    console.log();

    // 3. Check workspaces with plain SELECT
    console.log("3. SELECT * FROM workspaces LIMIT 5:");
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .limit(5);

    if (wsError) {
      console.log("   ❌ ERROR:", wsError.message);
    } else {
      console.log("   ✅ Result:", workspaces?.length || 0, "rows");
      if (workspaces && workspaces.length > 0) {
        console.log("   Sample workspaces:");
        workspaces.forEach(ws => {
          console.log(`   - ${ws.name} (${ws.id})`);
        });
      }
    }
    console.log();

    // 4. Conclusion based on actual data
    console.log("4. CONCLUSION:");
    if (orders && orders.length > 0) {
      console.log("   ✅ ORDERS EXIST - my COUNT logic was buggy");
      console.log("   ⚠️  Need to re-check workspace filtering using array length");
    } else {
      console.log("   ❌ NO ORDERS FOUND - database genuinely empty");
      console.log("   ⚠️  Frontend must be using different credentials or showing demo data");
      console.log();
      console.log("   Need to compare frontend Supabase client vs .env credentials");
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();