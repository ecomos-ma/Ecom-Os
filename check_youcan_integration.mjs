import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== YOUCAN INTEGRATION DIAGNOSTIC ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function run() {
  try {
    // 1. Check integration_sync_state for YouCan
    console.log("1. INTEGRATION_SYNC_STATE FOR YOUCAN:");
    const { data: syncState, error: syncError } = await supabase
      .from('integration_sync_state')
      .select('*')
      .eq('provider', 'youcan')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .maybeSingle();

    if (syncError) {
      console.log("   ❌ ERROR:", syncError.message);
    } else if (syncState) {
      console.log("   ✅ SYNC STATE FOUND:");
      console.log("   - workspace_id:", syncState.workspace_id);
      console.log("   - provider:", syncState.provider);
      console.log("   - last_synced_at:", syncState.last_synced_at);
      console.log("   - last_success_at:", syncState.last_success_at);
      console.log("   - last_sync_completed_at:", syncState.last_sync_completed_at);
      console.log("   - last_processed_external_id:", syncState.last_processed_external_id);
      console.log("   - status:", syncState.status);
      console.log("   - error_message:", syncState.error_message);
    } else {
      console.log("   ❌ NO SYNC STATE FOUND - YouCan sync has never run");
    }
    console.log();

    // 2. Check workspace YouCan credentials
    console.log("2. WORKSPACE YOUCAN CREDENTIALS:");
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', NURA_WORKSPACE_ID)
      .single();

    if (wsError) {
      console.log("   ❌ ERROR:", wsError.message);
    } else if (workspace) {
      console.log("   ✅ WORKSPACE FOUND:", workspace.name);
      console.log("   - youcan_access_token:", workspace.youcan_access_token ? "SET (length: " + workspace.youcan_access_token.length + ")" : "NOT SET");
      console.log("   - youcan_refresh_token:", workspace.youcan_refresh_token ? "SET (length: " + workspace.youcan_refresh_token.length + ")" : "NOT SET");
      console.log("   - youcan_token_expires_at:", workspace.youcan_token_expires_at);
      console.log("   - youcan_webhook_id:", workspace.youcan_webhook_id || "NOT SET");
      
      // Check if token is expired
      if (workspace.youcan_token_expires_at) {
        const expiryDate = new Date(workspace.youcan_token_expires_at);
        const now = new Date();
        const isExpired = expiryDate < now;
        console.log("   - TOKEN STATUS:", isExpired ? "EXPIRED" : "VALID");
        console.log("   - EXPIRY DATE:", expiryDate.toISOString());
        console.log("   - CURRENT DATE:", now.toISOString());
      }
    } else {
      console.log("   ❌ WORKSPACE NOT FOUND");
    }
    console.log();

    // 3. Check for any YouCan orders in the database
    console.log("3. YOUCAN ORDERS IN DATABASE:");
    const { data: youcanOrders, error: youcanError } = await supabase
      .from('orders')
      .select('*')
      .eq('source', 'youcan')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .limit(5);

    if (youcanError) {
      console.log("   ❌ ERROR:", youcanError.message);
    } else {
      console.log("   ✅ YOUCAN ORDERS COUNT:", youcanOrders?.length || 0);
      if (youcanOrders && youcanOrders.length > 0) {
        console.log("   Sample YouCan orders:");
        youcanOrders.forEach(order => {
          console.log(`   - ${order.order_number}: ${order.customer_name} - ${order.status}`);
        });
      }
    }
    console.log();

    // 4. Check all orders with youcan_order_id set
    console.log("4. ORDERS WITH YOUCAN_ORDER_ID:");
    const { data: ordersWithYoucanId, error: idError } = await supabase
      .from('orders')
      .select('*')
      .not('youcan_order_id', 'is', null)
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .limit(5);

    if (idError) {
      console.log("   ❌ ERROR:", idError.message);
    } else {
      console.log("   ✅ ORDERS WITH YOUCAN_ORDER_ID:", ordersWithYoucanId?.length || 0);
    }
    console.log();

    // 5. Summary
    console.log("5. SUMMARY:");
    console.log("   Integration Architecture:");
    console.log("   - Primary: Webhook-based real-time sync (order.created events)");
    console.log("   - Backup: Manual sync via youcan-sync-orders edge function");
    console.log("   - OAuth: youcan-generate-state → youcan-oauth-callback");
    console.log("   - Webhook Registration: youcan-register-webhook");
    console.log();
    console.log("   Current Status for Workspace Nura:");
    const isConnected = workspace?.youcan_access_token ? "CONNECTED" : "NOT CONNECTED";
    const webhookRegistered = workspace?.youcan_webhook_id ? "REGISTERED" : "NOT REGISTERED";
    const hasSyncState = syncState ? "YES" : "NO";
    const hasYouCanOrders = (youcanOrders?.length || 0) > 0 ? "YES" : "NO";
    
    console.log(`   - YouCan Connection: ${isConnected}`);
    console.log(`   - Webhook Status: ${webhookRegistered}`);
    console.log(`   - Sync State: ${hasSyncState}`);
    console.log(`   - YouCan Orders: ${hasYouCanOrders}`);
    console.log();
    
    if (!workspace?.youcan_access_token) {
      console.log("   ⚠️  PRIMARY ISSUE: YouCan is not connected to this workspace");
      console.log("   ⚠️  User needs to complete OAuth flow in Settings");
    } else if (!workspace?.youcan_webhook_id) {
      console.log("   ⚠️  ISSUE: Webhook not registered - real-time sync won't work");
      console.log("   ⚠️  User needs to click 'Activate Webhook' in Settings");
    } else if (!syncState) {
      console.log("   ⚠️  ISSUE: No sync state - sync has never run successfully");
      console.log("   ⚠️  User needs to run manual sync via 'Sync Orders' button");
    } else if (youcanOrders?.length === 0) {
      console.log("   ⚠️  ISSUE: No YouCan orders despite connection - sync might be failing");
      console.log("   ⚠️  Check edge function logs for errors");
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();