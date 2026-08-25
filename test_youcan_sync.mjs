import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== TESTING YOUCAN SYNC ORDERS FUNCTION ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function run() {
  try {
    console.log("1. INVOKING YOUCAN-SYNC-ORDERS EDGE FUNCTION:");
    console.log("   Workspace ID:", NURA_WORKSPACE_ID);
    console.log();

    const { data, error } = await supabase.functions.invoke("youcan-sync-orders", {
      body: { workspace_id: NURA_WORKSPACE_ID },
    });

    if (error) {
      console.log("   ❌ EDGE FUNCTION ERROR:", error.message);
      console.log("   Details:", error);
    } else {
      console.log("   ✅ SYNC RESULT:");
      console.log("   - success:", data.success);
      console.log("   - total_fetched:", data.total_fetched);
      console.log("   - synced_count:", data.synced_count);
      console.log("   - skipped_count:", data.skipped_count);
      console.log("   - errors:", data.errors ? data.errors.length : 0);
      
      if (data.errors && data.errors.length > 0) {
        console.log("   Error details:");
        data.errors.slice(0, 3).forEach((err, i) => {
          console.log(`   ${i + 1}. ${err}`);
        });
      }
    }
    console.log();

    // Check if orders were created
    console.log("2. CHECKING FOR NEW YOUCAN ORDERS:");
    const { data: newOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('source', 'youcan')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .limit(5);

    if (ordersError) {
      console.log("   ❌ ERROR:", ordersError.message);
    } else {
      console.log("   ✅ YOUCAN ORDERS COUNT:", newOrders?.length || 0);
      if (newOrders && newOrders.length > 0) {
        console.log("   Sample orders:");
        newOrders.forEach(order => {
          console.log(`   - ${order.order_number}: ${order.customer_name} - ${order.status} - ${order.city}`);
        });
      }
    }
    console.log();

    // Check sync state again
    console.log("3. CHECKING UPDATED SYNC STATE:");
    const { data: updatedSyncState, error: syncError } = await supabase
      .from('integration_sync_state')
      .select('*')
      .eq('provider', 'youcan')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .maybeSingle();

    if (syncError) {
      console.log("   ❌ ERROR:", syncError.message);
    } else if (updatedSyncState) {
      console.log("   ✅ SYNC STATE NOW EXISTS:");
      console.log("   - last_success_at:", updatedSyncState.last_success_at);
      console.log("   - last_sync_completed_at:", updatedSyncState.last_sync_completed_at);
      console.log("   - last_processed_external_id:", updatedSyncState.last_processed_external_id);
    } else {
      console.log("   ❌ STILL NO SYNC STATE");
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();