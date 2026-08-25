import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySQL() {
  console.log("=== 1. Verifying SQL Functions and Tables ===\n");

  // Check if function exists
  try {
    const { data: functionResult, error: functionError } = await supabase
      .rpc('is_founder_internal_user');
    
    if (functionError) {
      console.error("❌ Function is_founder_internal_user NOT found:", functionError.message);
    } else {
      console.log("✅ Function is_founder_internal_user exists");
      console.log("   Current result (should be false for service role):", functionResult);
    }
  } catch (e) {
    console.error("❌ Function is_founder_internal_user NOT found:", e.message);
  }

  // Check if table exists
  try {
    const { data: tableData, error: tableError } = await supabase
      .from('founder_internal_data')
      .select('*')
      .limit(1);
    
    if (tableError) {
      console.error("❌ Table founder_internal_data NOT found:", tableError.message);
    } else {
      console.log("✅ Table founder_internal_data exists");
      console.log("   Sample data:", tableData);
    }
  } catch (e) {
    console.error("❌ Table founder_internal_data NOT found:", e.message);
  }

  // Check if operation function exists
  try {
    const { data: opResult, error: opError } = await supabase
      .rpc('founder_internal_operation', { 
        operation_key: 'test',
        operation_data: {} 
      });
    
    if (opError) {
      console.error("❌ Function founder_internal_operation NOT found or failed:", opError.message);
    } else {
      console.log("✅ Function founder_internal_operation exists");
      console.log("   Result:", opResult);
    }
  } catch (e) {
    console.error("❌ Function founder_internal_operation NOT found:", e.message);
  }
}

verifySQL();
