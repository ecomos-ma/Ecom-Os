import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== INVESTIGATING COUNT vs DATA DISCREPANCY ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

    // 1. Test COUNT with different methods
    console.log("1. TESTING COUNT METHODS:");
    
    console.log("   a) COUNT with head: true, exact");
    const { data: count1, error: error1 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });
    console.log(`      Result: ${count1?.count || 0}, Error: ${error1?.message || 'none'}`);

    console.log("   b) COUNT with head: true, estimated");
    const { data: count2, error: error2 } = await supabase
      .from('orders')
      .select('*', { count: 'estimated', head: true });
    console.log(`      Result: ${count2?.count || 0}, Error: ${error2?.message || 'none'}`);

    console.log("   c) COUNT with head: true, planned");
    const { data: count3, error: error3 } = await supabase
      .from('orders')
      .select('*', { count: 'planned', head: true });
    console.log(`      Result: ${count3?.count || 0}, Error: ${error3?.message || 'none'}`);

    console.log("   d) No count, just select with limit");
    const { data: data4, error: error4 } = await supabase
      .from('orders')
      .select('*')
      .limit(1);
    console.log(`      Result: ${data4?.length || 0} rows, Error: ${error4?.message || 'none'}`);

    console.log("   e) COUNT on workspaces (to test if count works at all)");
    const { data: count5, error: error5 } = await supabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true });
    console.log(`      Result: ${count5?.count || 0}, Error: ${error5?.message || 'none'}`);

    console.log("   f) Actual workspaces data");
    const { data: data6, error: error6 } = await supabase
      .from('workspaces')
      .select('*')
      .limit(5);
    console.log(`      Result: ${data6?.length || 0} rows, Error: ${error6?.message || 'none'}`);
    console.log();

    // 2. Test orders specifically for Nura workspace
    console.log("2. ORDERS FOR NURA WORKSPACE:");
    console.log(`   Workspace ID: ${NURA_WORKSPACE_ID}`);

    console.log("   a) COUNT with workspace filter");
    const { data: count7, error: error7 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', NURA_WORKSPACE_ID);
    console.log(`      Result: ${count7?.count || 0}, Error: ${error7?.message || 'none'}`);

    console.log("   b) Actual data with workspace filter");
    const { data: data8, error: error8 } = await supabase
      .from('orders')
      .select('*')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .limit(10);
    console.log(`      Result: ${data8?.length || 0} rows, Error: ${error8?.message || 'none'}`);

    if (data8 && data8.length > 0) {
      console.log("      Sample orders:");
      data8.slice(0, 3).forEach(order => {
        console.log(`      - ${order.order_number}: ${order.customer_name}`);
      });
    }
    console.log();

    // 3. Test with the user's actual workspace
    console.log("3. CHECKING USER 'Amine Loading' WORKSPACE:");
    const USER_ID = '5c318c20-a8a8-46fe-949d-1a8d583314dd';
    
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', USER_ID)
      .single();

    if (!userError && userProfile) {
      console.log(`   User: ${userProfile.full_name}`);
      console.log(`   Workspace ID: ${userProfile.workspace_id}`);
      
      const { data: userOrders, error: userOrdersError } = await supabase
        .from('orders')
        .select('*')
        .eq('workspace_id', userProfile.workspace_id)
        .limit(10);
      
      if (!userOrdersError) {
        console.log(`   Orders in user's workspace: ${userOrders?.length || 0}`);
        if (userOrders && userOrders.length > 0) {
          console.log("   Sample orders:");
          userOrders.slice(0, 3).forEach(order => {
            console.log(`   - ${order.order_number}: ${order.customer_name} - ${order.status}`);
          });
        }
      }
    }
    console.log();

    // 4. Try raw SQL count via PostgreSQL
    console.log("4. TRYING RAW SQL COUNT:");
    try {
      const { data: sqlResult, error: sqlError } = await supabase
        .rpc('exec_sql', {
          sql: 'SELECT COUNT(*) as total FROM orders;'
        });
      
      if (sqlError) {
        console.log("   ❌ RPC exec_sql not available:", sqlError.message);
      } else {
        console.log("   ✅ SQL COUNT result:", sqlResult);
      }
    } catch (e) {
      console.log("   ❌ SQL COUNT failed:", e.message);
    }
    console.log();

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();