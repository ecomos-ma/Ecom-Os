import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkIntegrationState() {
  console.log("=== INTEGRATION STATE CHECK ===\n");

  try {
    // Check the single integration_sync_state row
    console.log("1. CHECKING INTEGRATION SYNC STATE...");
    const { data: syncState, error: syncStateError } = await supabase
      .from('integration_sync_state')
      .select('*');
    
    if (syncStateError) {
      console.log("   ❌ Error:", syncStateError.message);
    } else {
      console.log("   ✅ Integration sync state:");
      console.log("   ", JSON.stringify(syncState, null, 2));
    }

    // Check workspace_shipping_providers configuration
    console.log("\n2. CHECKING WORKSPACE SHIPPING PROVIDERS CONFIGURATION...");
    const { data: workspaceProviders, error: providersError } = await supabase
      .from('workspace_shipping_providers')
      .select('*');
    
    if (providersError) {
      console.log("   ❌ Error:", providersError.message);
    } else if (!workspaceProviders || workspaceProviders.length === 0) {
      console.log("   ⚠️  No workspace shipping providers configured");
    } else {
      console.log(`   ✅ Found ${workspaceProviders.length} workspace shipping provider configs:`);
      workspaceProviders.forEach(wp => {
        console.log(`      Workspace: ${wp.workspace_id} | Provider: ${wp.provider} | Active: ${wp.is_active}`);
      });
    }

    // Check total orders count
    console.log("\n3. CHECKING TOTAL ORDERS COUNT...");
    const { data: ordersCount, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      console.log("   ❌ Error:", countError.message);
    } else {
      console.log(`   ✅ Total orders in database: ${ordersCount || 0}`);
    }

    // Check workspaces count
    console.log("\n4. CHECKING TOTAL WORKSPACES COUNT...");
    const { data: workspacesCount, error: wsCountError } = await supabase
      .from('workspaces')
      .select('id', { count: 'exact', head: true });
    
    if (wsCountError) {
      console.log("   ❌ Error:", wsCountError.message);
    } else {
      console.log(`   ✅ Total workspaces in database: ${workspacesCount || 0}`);
    }

    // Check if this might be a demo environment
    console.log("\n5. CHECKING FOR DEMO DATA INDICATORS...");
    const { data: demoCheck, error: demoError } = await supabase
      .from('workspaces')
      .select('id, name, is_demo, created_at')
      .limit(5);
    
    if (demoError) {
      console.log("   ❌ Error:", demoError.message);
    } else {
      console.log("   ✅ Sample workspaces:");
      demoCheck.forEach(ws => {
        console.log(`      ${ws.name} (${ws.id}) | Demo: ${ws.is_demo || 'N/A'} | Created: ${ws.created_at}`);
      });
    }

  } catch (error) {
    console.error("❌ INTEGRATION STATE CHECK ERROR:", error);
  }
}

checkIntegrationState();