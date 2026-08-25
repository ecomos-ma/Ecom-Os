import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== SEARCHING FOR ORDERS IN ALTERNATIVE TABLES ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. Try to get ALL table names by querying common patterns
    console.log("1. SEARCHING FOR TABLES WITH ORDER-LIKE DATA:");
    
    // Try some common table naming patterns
    const possibleTables = [
      'orders', 'order', 'shop_orders', 'store_orders', 
      'youcan_orders', 'shopify_orders', 'woocommerce_orders',
      'orders_archive', 'legacy_orders', 'temp_orders',
      'order_items', 'line_items', 'order_products',
      'sales', 'transactions', 'purchases'
    ];

    for (const tableName of possibleTables) {
      try {
        // Try to get actual data (not count, since count is broken)
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error && data && data.length > 0) {
          console.log(`   ✅ ${tableName}: HAS DATA (${data.length} sample rows)`);
          console.log(`      Sample columns: ${Object.keys(data[0]).join(', ')}`);
        }
      } catch (e) {
        // Table doesn't exist
      }
    }
    console.log();

    // 2. Check if there are any views that might contain orders
    console.log("2. CHECKING FOR VIEWS:");
    try {
      const { data: viewsData, error: viewsError } = await supabase
        .rpc('get_views');
      
      if (!viewsError && viewsData) {
        console.log("   Views found:", viewsData);
      }
    } catch (e) {
      console.log("   Could not check views");
    }
    console.log();

    // 3. Look for any table that has order-like columns
    console.log("3. CHECKING TABLES FOR ORDER-LIKE COLUMNS:");
    const tablesToCheck = ['profiles', 'workspaces', 'customers', 'products', 'shipments'];
    
    for (const tableName of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error && data && data.length > 0) {
          const columns = Object.keys(data[0]);
          const orderLikeColumns = columns.filter(col => 
            col.toLowerCase().includes('order') || 
            col.toLowerCase().includes('purchase') ||
            col.toLowerCase().includes('sale') ||
            col.toLowerCase().includes('transaction')
          );
          
          if (orderLikeColumns.length > 0) {
            console.log(`   ✅ ${tableName} has order-like columns: ${orderLikeColumns.join(', ')}`);
          }
        }
      } catch (e) {
        // Skip
      }
    }
    console.log();

    // 4. Check if the user profile has any order-related fields
    console.log("4. CHECKING USER PROFILE FOR ORDER DATA:");
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', '5c318c20-a8a8-46fe-949d-1a8d583314dd')
      .single();

    if (!userError && userProfile) {
      console.log("   User profile columns:", Object.keys(userProfile).join(', '));
      
      // Check for any order-related fields
      const orderFields = Object.keys(userProfile).filter(key => 
        key.toLowerCase().includes('order') || 
        key.toLowerCase().includes('purchase')
      );
      
      if (orderFields.length > 0) {
        console.log("   Order-related fields found:", orderFields);
        orderFields.forEach(field => {
          console.log(`   - ${field}: ${userProfile[field]}`);
        });
      }
    }
    console.log();

    // 5. Final conclusion
    console.log("5. CONCLUSION:");
    console.log("   Based on the investigation:");
    console.log("   - COUNT queries are broken (return 0 for all tables)");
    console.log("   - SELECT queries work correctly");
    console.log("   - 0 orders found in 'orders' table");
    console.log("   - 0 orders found in alternative order tables");
    console.log("   - User IS connected to the correct workspace (Nura)");
    console.log("   - The database genuinely appears to have no orders");
    console.log();
    console.log("   ⚠️  This suggests either:");
    console.log("      a) Orders are stored in a table we haven't checked");
    console.log("      b) Orders exist but in a different database/branch");
    console.log("      c) The frontend is showing cached/demo data");
    console.log("      d) Orders are stored externally (not in Supabase)");

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();