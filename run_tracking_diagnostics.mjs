import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runDiagnostics() {
  console.log("=== DELIVERY STATUS SYNC DIAGNOSTICS ===\n");

  try {
    // 1. Check pg_cron jobs
    console.log("1. CHECKING PG_CRON JOBS...");
    try {
      const { data: cronJobs, error: cronError } = await supabase
        .rpc('exec_sql', { query: "SELECT * FROM pg_cron.jobs" });
      
      if (cronError) {
        console.log("   ⚠️  Cannot access pg_cron (requires admin):", cronError.message);
        console.log("   ℹ️  Will check alternative indicators...");
      } else {
        console.log("   ✅ pg_cron jobs:", JSON.stringify(cronJobs, null, 2));
      }
    } catch (e) {
      console.log("   ⚠️  pg_cron check failed:", e.message);
    }

    // 2. Check recent sync logs
    console.log("\n2. CHECKING RECENT SYNC LOGS (last 20)...");
    const { data: syncLogs, error: syncLogsError } = await supabase
      .from('shipping_sync_logs')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(20);
    
    if (syncLogsError) {
      console.log("   ❌ Error fetching sync logs:", syncLogsError.message);
    } else if (!syncLogs || syncLogs.length === 0) {
      console.log("   ⚠️  No sync logs found - cron may never have run successfully");
    } else {
      console.log(`   ✅ Found ${syncLogs.length} sync log entries`);
      syncLogs.forEach((log, i) => {
        console.log(`      ${i + 1}. ${log.synced_at} | Workspace: ${log.workspace_id} | Checked: ${log.orders_checked} | Updated: ${log.orders_updated} | Errors: ${log.errors}`);
      });
    }

    // 3. Check provider credentials
    console.log("\n3. CHECKING PROVIDER CREDENTIALS...");
    const { data: credentials, error: credsError } = await supabase
      .from('shipping_provider_credentials')
      .select('*');
    
    if (credsError) {
      console.log("   ❌ Error fetching credentials:", credsError.message);
    } else if (!credentials || credentials.length === 0) {
      console.log("   ⚠️  No provider credentials found in database");
    } else {
      console.log(`   ✅ Found ${credentials.length} credential entries`);
      const credsByProvider = {};
      credentials.forEach(cred => {
        if (!credsByProvider[cred.provider]) credsByProvider[cred.provider] = [];
        credsByProvider[cred.provider].push(cred.workspace_id);
      });
      console.log("   Credentials by provider:");
      Object.entries(credsByProvider).forEach(([provider, workspaceIds]) => {
        console.log(`      ${provider}: ${workspaceIds.length} workspace(s)`);
      });
    }

    // 4. Check integration sync state
    console.log("\n4. CHECKING INTEGRATION SYNC STATE...");
    const { data: syncState, error: syncStateError } = await supabase
      .from('integration_sync_state')
      .select('*')
      .eq('provider', 'shipping')
      .order('last_sync_completed_at', { ascending: false })
      .limit(10);
    
    if (syncStateError) {
      console.log("   ❌ Error fetching sync state:", syncStateError.message);
    } else if (!syncState || syncState.length === 0) {
      console.log("   ⚠️  No integration sync state found");
    } else {
      console.log(`   ✅ Found ${syncState.length} sync state entries`);
      syncState.forEach((state, i) => {
        console.log(`      ${i + 1}. Workspace: ${state.workspace_id}`);
        console.log(`         Last sync: ${state.last_sync_completed_at}`);
        console.log(`         Last success: ${state.last_success_at}`);
        console.log(`         Last error: ${state.last_error || 'None'}`);
      });
    }

    // 5. Check orders with stale tracking
    console.log("\n5. CHECKING ORDERS WITH STALE TRACKING (no sync in 24h)...");
    const { data: staleOrders, error: staleError } = await supabase
      .from('orders')
      .select('order_number, shipping_provider, shipping_status, delivery_status, last_tracking_sync, shipping_updated_at, tracking_number, created_at, updated_at')
      .not('tracking_number', 'is', null)
      .not('tracking_number', 'eq', '')
      .or('last_tracking_sync.is.null,last_tracking_sync.lt.' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: false })
      .limit(10);
    
    if (staleError) {
      console.log("   ❌ Error fetching stale orders:", staleError.message);
    } else if (!staleOrders || staleOrders.length === 0) {
      console.log("   ✅ No stale orders found - all tracked orders synced recently");
    } else {
      console.log(`   ⚠️  Found ${staleOrders.length} orders with stale tracking`);
      staleOrders.forEach((order, i) => {
        console.log(`      ${i + 1}. Order #${order.order_number}`);
        console.log(`         Provider: ${order.shipping_provider || 'Not set'}`);
        console.log(`         Status: ${order.shipping_status || order.delivery_status || 'Not set'}`);
        console.log(`         Last sync: ${order.last_tracking_sync || 'Never'}`);
        console.log(`         Updated: ${order.shipping_updated_at || order.updated_at}`);
        console.log(`         Tracking: ${order.tracking_number}`);
      });
    }

    // 6. Check recent tracking errors
    console.log("\n6. CHECKING RECENT TRACKING ERRORS...");
    const { data: trackingErrors, error: trackingErrorsError } = await supabase
      .from('shipping_logs')
      .select('*')
      .eq('event_type', 'tracking_sync')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (trackingErrorsError) {
      console.log("   ❌ Error fetching tracking errors:", trackingErrorsError.message);
    } else if (!trackingErrors || trackingErrors.length === 0) {
      console.log("   ✅ No recent tracking errors found");
    } else {
      console.log(`   ⚠️  Found ${trackingErrors.length} recent tracking errors`);
      trackingErrors.forEach((log, i) => {
        console.log(`      ${i + 1}. ${log.created_at} | Order: ${log.order_number} | Provider: ${log.provider}`);
        console.log(`         Error: ${log.error_message || 'Unknown error'}`);
      });
    }

    // 7. Sample recent orders for manual inspection
    console.log("\n7. SAMPLE RECENT ORDERS (last 5 with tracking)...");
    const { data: recentOrders, error: recentError } = await supabase
      .from('orders')
      .select('order_number, shipping_provider, shipping_status, delivery_status, last_tracking_sync, shipping_updated_at, tracking_number')
      .not('tracking_number', 'is', null)
      .not('tracking_number', 'eq', '')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentError) {
      console.log("   ❌ Error fetching recent orders:", recentError.message);
    } else {
      console.log(`   ✅ Sample of ${recentOrders.length} recent orders with tracking:`);
      recentOrders.forEach((order, i) => {
        console.log(`      ${i + 1}. Order #${order.order_number}`);
        console.log(`         Provider: ${order.shipping_provider || 'Not set'}`);
        console.log(`         Status: ${order.shipping_status || order.delivery_status || 'Not set'}`);
        console.log(`         Last sync: ${order.last_tracking_sync || 'Never'}`);
        console.log(`         Tracking: ${order.tracking_number}`);
      });
    }

  } catch (error) {
    console.error("❌ DIAGNOSTIC SCRIPT ERROR:", error);
  }
}

runDiagnostics();