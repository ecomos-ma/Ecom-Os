import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigateSchema() {
  console.log("=== READ-ONLY SCHEMA INVESTIGATION ===\n");
  console.log("Connected to:", process.env.VITE_SUPABASE_URL);
  console.log("Using service role key:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "YES" : "NO");
  console.log("CONFIRMATION: This script will ONLY run SELECT queries - NO writes of any kind\n");

  try {
    // Since information_schema is not accessible through Supabase client,
    // let's try common table names directly
    console.log("1. TESTING COMMON TABLE NAMES DIRECTLY...");
    const commonTables = [
      'orders', 'workspaces', 'orders_backup', 'orders_new', 'orders_v2',
      'order_items', 'shop_orders', 'customers', 'products', 'users',
      'shipping_logs', 'shipping_sync_logs', 'integration_sync_state',
      'shipping_provider_credentials', 'workspace_shipping_providers'
    ];
    
    for (const tableName of commonTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.log(`   ❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`   ✅ ${tableName}: EXISTS (${data || 0} rows)`);
        }
      } catch (e) {
        console.log(`   ❌ ${tableName}: Exception - ${e.message}`);
      }
    }

    // Try some variations based on the migration files I saw
    console.log("\n2. TESTING TABLE NAMES FROM MIGRATION FILES...");
    const migrationTables = [
      'profiles', 'team_members', 'workspace_invitations', 'meta_campaigns',
      'products', 'inventory', 'finance_records', 'notifications',
      'delivery_notes', 'coliaty_cities', 'ozon_cities', 'city_aliases'
    ];
    
    for (const tableName of migrationTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.log(`   ❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`   ✅ ${tableName}: EXISTS (${data || 0} rows)`);
        }
      } catch (e) {
        console.log(`   ❌ ${tableName}: Exception - ${e.message}`);
      }
    }

    // If we find any tables with data, examine their structure
    console.log("\n3. IF TABLES FOUND, EXAMINING STRUCTURE...");
    const tablesToExamine = ['orders', 'workspaces', 'profiles', 'users'];
    
    for (const tableName of tablesToExamine) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error && data && data.length > 0) {
          console.log(`\n   ✅ ${tableName} structure (from sample row):`);
          console.log(`      Columns: ${Object.keys(data[0]).join(', ')}`);
          
          // If this is orders table, show a few sample rows
          if (tableName === 'orders') {
            const { data: sampleOrders, error: sampleError } = await supabase
              .from('orders')
              .select('*')
              .limit(3);
            
            if (!sampleError && sampleOrders) {
              console.log(`      Sample orders (${sampleOrders.length} total):`);
              sampleOrders.forEach((order, i) => {
                console.log(`         ${i + 1}. Order #${order.order_number || 'N/A'} | Provider: ${order.shipping_provider || 'N/A'} | Status: ${order.shipping_status || order.delivery_status || 'N/A'}`);
              });
            }
          }
        }
      } catch (e) {
        // Skip if table doesn't exist
      }
    }

    // Try using PostgreSQL system tables through RPC if available
    console.log("\n4. TRYING RPC CALL TO LIST TABLES...");
    try {
      const { data, error } = await supabase.rpc('get_tables_in_schema', { schema_name: 'public' });
      if (error) {
        console.log("   ❌ RPC get_tables_in_schema failed:", error.message);
      } else {
        console.log("   ✅ Tables via RPC:", data);
      }
    } catch (e) {
      console.log("   ❌ RPC exception:", e.message);
    }

  } catch (error) {
    console.error("❌ SCHEMA INVESTIGATION ERROR:", error);
  }
}

investigateSchema();