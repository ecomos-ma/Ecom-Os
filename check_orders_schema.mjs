import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== CHECKING ORDERS TABLE SCHEMA ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // Try to get sample data to understand schema
    console.log("1. CHECKING ORDERS TABLE STRUCTURE VIA SAMPLE DATA:");
    
    const { data: sampleData, error: sampleError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);

    if (!sampleError && sampleData && sampleData.length > 0) {
      console.log("   ✅ COLUMNS FROM SAMPLE DATA:");
      Object.keys(sampleData[0]).forEach(col => {
        console.log(`   - ${col}`);
      });
    } else {
      console.log("   ⚠️  NO SAMPLE DATA AVAILABLE - TABLE MIGHT BE EMPTY");
      console.log("   This is expected since we found 0 orders earlier");
    }
    console.log();

    // Try to insert a test record to see what columns are required
    console.log("2. TRYING TEST INSERT TO IDENTIFY REQUIRED COLUMNS:");
    const testOrderId = 'test-' + Date.now();
    
    const testPayload = {
      workspace_id: '03826be0-e050-42d7-a030-a7d5a8d4f920',
      youcan_order_id: testOrderId,
      order_number: '#TEST-001',
      phone: '1234567890',
      address: 'Test Address',
      city: 'Test City',
      total: 100,
      status: 'pending',
      source: 'youcan',
      created_at: new Date().toISOString(),
      customer_name: 'Test Customer'
    };

    const { data: insertData, error: insertError } = await supabase
      .from('orders')
      .insert(testPayload)
      .select()
      .maybeSingle();

    if (insertError) {
      console.log("   ❌ INSERT ERROR:", insertError.message);
      console.log("   Code:", insertError.code);
      console.log("   Details:", insertError.details);
      console.log("   Hint:", insertError.hint);
      
      // This will tell us what's missing
      if (insertError.message.includes('column') || insertError.message.includes('field')) {
        console.log("   ⚠️  LIKELY ISSUE: Missing required column in orders table");
      }
    } else {
      console.log("   ✅ TEST INSERT SUCCESSFUL");
      console.log("   Inserted record:", insertData);
      
      // Clean up test record
      await supabase
        .from('orders')
        .delete()
        .eq('youcan_order_id', testOrderId);
      console.log("   ✅ TEST RECORD CLEANED UP");
    }
    console.log();

    // Check what the sync function is trying to insert
    console.log("3. ANALYZING SYNC FUNCTION PAYLOAD STRUCTURE:");
    console.log("   The sync function creates this payload:");
    console.log("   {");
    console.log("     workspace_id,");
    console.log("     youcan_order_id,");
    console.log("     order_number,");
    console.log("     phone,");
    console.log("     address,");
    console.log("     city,");
    console.log("     ozon_city_id,");
    console.log("     city_name,");
    console.log("     total,");
    console.log("     status,");
    console.log("     source: 'youcan',");
    console.log("     created_at,");
    console.log("     sku,");
    console.log("     product_variant,");
    console.log("     customer_name,");
    console.log("     shipping_cost,");
    console.log("     customer_id (if exists)");
    console.log("   }");
    console.log();

    console.log("4. ROOT CAUSE ANALYSIS:");
    console.log("   Error: 'record new has no field id'");
    console.log("   This typically means:");
    console.log("   a) The orders table is missing a primary key 'id' column");
    console.log("   b) The upsert is trying to use 'id' in the conflict resolution");
    console.log("   c) There's a mismatch between the actual schema and expected schema");
    console.log();
    console.log("   The sync function uses: onConflict: 'workspace_id,youcan_order_id'");
    console.log("   This expects a unique constraint on (workspace_id, youcan_order_id)");
    console.log();

    // === NEW DIAGNOSTIC QUERIES FOR TRIGGER INVESTIGATION ===
    console.log("=== TRIGGER AND SCHEMA DIAGNOSTICS ===\n");

    console.log("5. LISTING ALL TRIGGERS ON ORDERS TABLE:");
    const { data: triggers, error: triggersError } = await supabase.rpc("exec_sql", {
      query: `SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid) 
              FROM pg_trigger WHERE tgrelid = 'orders'::regclass AND NOT tgisinternal;`
    });
    console.log("   Triggers:", triggers);
    console.log("   Error:", triggersError);
    console.log();

    console.log("6. ORDERS TABLE COLUMNS (FROM information_schema):");
    const { data: columns, error: columnsError } = await supabase.rpc("exec_sql", {
      query: `SELECT column_name, data_type, is_nullable 
              FROM information_schema.columns WHERE table_name = 'orders' 
              ORDER BY ordinal_position;`
    });
    console.log("   Columns:", columns);
    console.log("   Error:", columnsError);
    console.log();

    console.log("7. PRIMARY KEY COLUMN FOR ORDERS TABLE:");
    const { data: primaryKey, error: pkError } = await supabase.rpc("exec_sql", {
      query: `SELECT kcu.column_name, kcu.data_type
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
              WHERE tc.table_name = 'orders' 
                AND tc.constraint_type = 'PRIMARY KEY';`
    });
    console.log("   Primary Key:", primaryKey);
    console.log("   Error:", pkError);
    console.log();

    console.log("8. TRIGGER FUNCTION SOURCES (if any triggers found):");
    if (triggers && !triggersError && triggers.length > 0) {
      for (const trigger of triggers) {
        const triggerDef = trigger.pg_get_triggerdef;
        const funcNameMatch = triggerDef.match(/EXECUTE FUNCTION (.+?)\(/);
        if (funcNameMatch) {
          const funcName = funcNameMatch[1];
          console.log(`   Function: ${funcName}`);
          const { data: funcDef, error: funcError } = await supabase.rpc("exec_sql", {
            query: `SELECT pg_get_functiondef('${funcName}'::regproc);`
          });
          console.log("   Definition:", funcDef);
          console.log("   Error:", funcError);
          console.log();
        }
      }
    } else {
      console.log("   No triggers found on orders table");
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();