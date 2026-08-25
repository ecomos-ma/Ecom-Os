import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== FINDING ACTUAL WORKSPACE WITH ORDERS ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // Get all workspaces
    console.log("1. GETTING ALL WORKSPACES:");
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (wsError) {
      console.log("   ❌ ERROR:", wsError.message);
      return;
    }

    console.log("   ✅ Total workspaces:", workspaces?.length || 0);
    console.log();

    // Check each workspace for orders
    console.log("2. CHECKING EACH WORKSPACE FOR ORDERS:");
    const workspaceOrderCounts = [];

    for (const ws of workspaces || []) {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ws.id);

      if (!orderError) {
        const count = orderData?.count || 0;
        if (count > 0) {
          workspaceOrderCounts.push({
            workspace: ws,
            count: count
          });
          console.log(`   ✅ ${ws.name} (${ws.id}): ${count} orders`);
        }
      }
    }

    console.log();
    console.log("3. WORKSPACES WITH ORDERS:");
    if (workspaceOrderCounts.length === 0) {
      console.log("   ❌ NO WORKSPACES HAVE ORDERS");
      console.log("   ⚠️  This explains why the frontend shows no orders");
    } else {
      workspaceOrderCounts.sort((a, b) => b.count - a.count);
      workspaceOrderCounts.forEach(({ workspace, count }) => {
        console.log(`   🎯 ${workspace.name} (${workspace.id}): ${count} orders`);
      });
    }
    console.log();

    // Check specifically for "Nura" workspaces
    console.log("4. NURA-SPECIFIC WORKSPACES:");
    const nuraWorkspaces = workspaces?.filter(ws => 
      ws.name.toLowerCase().includes('nura')
    ) || [];

    console.log(`   Found ${nuraWorkspaces.length} Nura workspaces:`);
    for (const ws of nuraWorkspaces) {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ws.id);

      const count = !orderError ? (orderData?.count || 0) : 'ERROR';
      console.log(`   - ${ws.name} (${ws.id}): ${count} orders`);
    }
    console.log();

    // Get sample orders from the workspace with most orders
    if (workspaceOrderCounts.length > 0) {
      const topWorkspace = workspaceOrderCounts[0].workspace;
      console.log("5. SAMPLE ORDERS FROM TOP WORKSPACE:", topWorkspace.name);
      const { data: sampleOrders, error: sampleError } = await supabase
        .from('orders')
        .select('order_number, customer_name, city, status, total, created_at')
        .eq('workspace_id', topWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (sampleError) {
        console.log("   ❌ ERROR:", sampleError.message);
      } else {
        console.log("   ✅ Sample orders:");
        sampleOrders?.forEach(order => {
          console.log(`   - ${order.order_number}: ${order.customer_name} - ${order.city} - ${order.status}`);
        });
      }
    }

    console.log();
    console.log("=== CONCLUSION ===");
    if (workspaceOrderCounts.length === 0) {
      console.log("❌ NO ORDERS EXIST IN ANY WORKSPACE");
      console.log("⚠️  The database is completely empty of orders");
      console.log("⚠️  This explains why both ANON and SERVICE ROLE keys return 0 orders");
      console.log("⚠️  The frontend showing orders suggests it may be connected to a DIFFERENT database/branch");
    } else {
      console.log("✅ ORDERS EXIST IN SPECIFIC WORKSPACES");
      console.log("⚠️  The diagnostic script was checking the wrong workspace ID");
      console.log("⚠️  The frontend is likely using one of these workspace IDs:", workspaceOrderCounts[0].workspace.id);
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();