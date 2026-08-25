import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== INVESTIGATING ORDERS TABLE TRIGGERS AND STRUCTURE ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. List all triggers on the orders table
    console.log("1. TRIGGERS ON ORDERS TABLE:");
    const triggersQuery = `
      SELECT 
        tgname as trigger_name,
        tgrelid::regclass as table_name,
        pg_get_triggerdef(oid) as trigger_definition
      FROM pg_trigger 
      WHERE tgrelid = 'orders'::regclass 
      AND NOT tgisinternal
      ORDER BY tgname;
    `;

    const { data: triggersData, error: triggersError } = await supabase
      .rpc('exec_sql', { sql: triggersQuery });

    if (triggersError) {
      console.log("   ❌ ERROR:", triggersError.message);
      console.log("   Trying alternative method...");
      
      // Try a simpler query
      const simpleQuery = `
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'orders'::regclass 
        AND NOT tgisinternal;
      `;
      
      const { data: simpleData, error: simpleError } = await supabase
        .rpc('exec_sql', { sql: simpleQuery });
      
      if (simpleError) {
        console.log("   ❌ SIMPLE QUERY ALSO FAILED:", simpleError.message);
      } else {
        console.log("   ✅ TRIGGER NAMES:", simpleData);
      }
    } else {
      console.log("   ✅ TRIGGERS FOUND:", triggersData?.length || 0);
      if (triggersData && triggersData.length > 0) {
        triggersData.forEach(trigger => {
          console.log(`   - ${trigger.trigger_name}`);
          console.log(`     Definition: ${trigger.trigger_definition}`);
        });
      } else {
        console.log("   ⚠️  NO TRIGGERS FOUND");
      }
    }
    console.log();

    // 2. Get function definitions for each trigger
    console.log("2. TRIGGER FUNCTION DEFINITIONS:");
    if (triggersData && triggersData.length > 0) {
      for (const trigger of triggersData) {
        // Extract function name from trigger definition
        const funcMatch = trigger.trigger_definition.match(/EXECUTE FUNCTION ([^\s]+)/);
        if (funcMatch) {
          const funcName = funcMatch[1].replace(/"/g, '');
          console.log(`   Function: ${funcName}`);
          
          const funcQuery = `
            SELECT pg_get_functiondef(oid) as function_definition
            FROM pg_proc 
            WHERE proname = '${funcName}'
            LIMIT 1;
          `;
          
          const { data: funcData, error: funcError } = await supabase
            .rpc('exec_sql', { sql: funcQuery });
          
          if (funcError) {
            console.log(`   ❌ ERROR getting function ${funcName}:`, funcError.message);
          } else {
            console.log(`   ✅ Function definition:`);
            if (funcData && funcData.length > 0) {
              console.log(`   ${funcData[0].function_definition}`);
              
              // Check for NEW.id references
              const hasNewId = funcData[0].function_definition.includes('NEW.id');
              const hasNewOrderId = funcData[0].function_definition.includes('NEW."Order ID"');
              const hasNewOrderID = funcData[0].function_definition.includes('NEW.order_id');
              
              console.log(`   🔍 REFERENCES: NEW.id: ${hasNewId ? 'YES ⚠️' : 'NO'}, NEW."Order ID": ${hasNewOrderId ? 'YES' : 'NO'}, NEW.order_id: ${hasNewOrderID ? 'YES' : 'NO'}`);
            }
          }
        }
      }
    } else {
      console.log("   ⚠️  No triggers to investigate");
    }
    console.log();

    // 3. Show actual orders table structure
    console.log("3. ACTUAL ORDERS TABLE COLUMNS:");
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    const { data: columnsData, error: columnsError } = await supabase
      .rpc('exec_sql', { sql: columnsQuery });

    if (columnsError) {
      console.log("   ❌ ERROR:", columnsError.message);
    } else {
      console.log("   ✅ COLUMNS:", columnsData?.length || 0);
      if (columnsData && columnsData.length > 0) {
        columnsData.forEach(col => {
          const marker = col.column_name.toLowerCase().includes('id') ? ' 🔑' : '';
          console.log(`   - ${col.column_name}${marker}: ${col.data_type} (nullable: ${col.is_nullable})${col.column_default ? ` default: ${col.column_default}` : ''}`);
        });
      }
    }
    console.log();

    // 4. Check primary key constraints
    console.log("4. PRIMARY KEY CONSTRAINT:");
    const pkQuery = `
      SELECT
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'orders'
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY';
    `;

    const { data: pkData, error: pkError } = await supabase
      .rpc('exec_sql', { sql: pkQuery });

    if (pkError) {
      console.log("   ❌ ERROR:", pkError.message);
    } else {
      if (pkData && pkData.length > 0) {
        console.log("   ✅ PRIMARY KEY:");
        pkData.forEach(pk => {
          console.log(`   - Constraint: ${pk.constraint_name}`);
          console.log(`   - Column: ${pk.column_name}`);
        });
      } else {
        console.log("   ⚠️  NO PRIMARY KEY CONSTRAINT FOUND");
      }
    }
    console.log();

    // 5. Check unique constraints
    console.log("5. UNIQUE CONSTRAINTS:");
    const uniqueQuery = `
      SELECT
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'orders'
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'UNIQUE';
    `;

    const { data: uniqueData, error: uniqueError } = await supabase
      .rpc('exec_sql', { sql: uniqueQuery });

    if (uniqueError) {
      console.log("   ❌ ERROR:", uniqueError.message);
    } else {
      if (uniqueData && uniqueData.length > 0) {
        console.log("   ✅ UNIQUE CONSTRAINTS:", uniqueData.length);
        uniqueData.forEach(uc => {
          console.log(`   - ${uc.constraint_name}: ${uc.column_name}`);
        });
      } else {
        console.log("   ⚠️  NO UNIQUE CONSTRAINTS FOUND");
      }
    }
    console.log();

    console.log("6. SUMMARY:");
    console.log("   Trigger Status:", triggersData && triggersData.length > 0 ? `${triggersData.length} triggers found` : "No triggers");
    console.log("   Primary Key Status:", pkData && pkData.length > 0 ? `Found on column: ${pkData[0].column_name}` : "No primary key");
    console.log("   Column Count:", columnsData?.length || 0);
    console.log();
    console.log("   ⚠️  READ-ONLY INVESTIGATION COMPLETE - NO MODIFICATIONS MADE");

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();