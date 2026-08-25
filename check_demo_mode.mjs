import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== CHECKING IF FRONTEND MIGHT BE IN DEMO MODE ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. Check if there's a demo workspace in the database
    console.log("1. CHECKING FOR DEMO WORKSPACE:");
    const DEMO_WORKSPACE_ID = "demo-workspace-001";
    
    const { data: demoWorkspace, error: demoError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', DEMO_WORKSPACE_ID)
      .maybeSingle();

    if (!demoError && demoWorkspace) {
      console.log("   ✅ DEMO WORKSPACE FOUND:", demoWorkspace.name);
    } else {
      console.log("   ❌ No demo workspace found in database");
    }
    console.log();

    // 2. Check the current user's workspace name
    console.log("2. CHECKING CURRENT USER'S WORKSPACE:");
    const USER_ID = '5c318c20-a8a8-46fe-949d-1a8d583314dd';
    
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('*, workspaces(*)')
      .eq('id', USER_ID)
      .single();

    if (!userError && userProfile) {
      console.log(`   User: ${userProfile.full_name}`);
      console.log(`   Workspace: ${userProfile.workspaces?.name || 'Unknown'}`);
      console.log(`   Workspace ID: ${userProfile.workspace_id}`);
      
      if (userProfile.workspaces?.name?.toLowerCase().includes('demo')) {
        console.log("   ⚠️  USER IS IN A DEMO WORKSPACE");
      }
    }
    console.log();

    // 3. Check for demo-related data
    console.log("3. CHECKING FOR DEMO DATA INDICATORS:");
    
    // Check if there are any fake/demo-looking orders
    const { data: allOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(10);

    if (!ordersError && allOrders && allOrders.length > 0) {
      console.log("   Sample orders found:");
      allOrders.forEach(order => {
        console.log(`   - ${order.order_number}: ${order.customer_name}`);
        
        // Check for demo patterns
        if (order.order_number?.includes('demo') || 
            order.customer_name?.toLowerCase().includes('demo')) {
          console.log("     ⚠️  This looks like demo data");
        }
      });
    } else {
      console.log("   No orders found (consistent with earlier findings)");
    }
    console.log();

    // 4. Final analysis
    console.log("4. ANALYSIS:");
    console.log("   The investigation shows:");
    console.log("   - Database has 0 orders in all tables");
    console.log("   - User 'Amine Loading' is connected to workspace 'Nura'");
    console.log("   - User has 0 current_assigned_orders and 0 completed_orders_today");
    console.log("   - Frontend shows orders (per your report)");
    console.log();
    console.log("   POSSIBLE EXPLANATIONS:");
    console.log("   a) Frontend is in demo mode (showing fake data)");
    console.log("   b) Frontend is connected to a different database/branch");
    console.log("   c) Frontend is showing cached data from previous session");
    console.log("   d) Orders are stored externally and fetched via API");
    console.log();
    console.log("   RECOMMENDED NEXT STEPS:");
    console.log("   1. Check browser DevTools Application tab for demo session storage");
    console.log("   2. Check browser Network tab to see which API calls return order data");
    console.log("   3. Check if frontend is using different Supabase credentials");
    console.log("   4. Verify in Supabase Dashboard if this is the correct project");

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();