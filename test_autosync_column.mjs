import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== TESTING AUTOSYNC COLUMN UPDATE ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function run() {
  try {
    // 1. Check current value
    console.log("1. CHECKING CURRENT google_sheet_autosync VALUE:");
    const { data: currentWorkspace, error: checkError } = await supabase
      .from('workspaces')
      .select('id, google_sheet_autosync')
      .eq('id', NURA_WORKSPACE_ID)
      .single();

    if (checkError) {
      console.log("   ❌ CHECK ERROR:", checkError.message);
      console.log("   Code:", checkError.code);
      console.log("   Details:", checkError.details);
      console.log("   Hint:", checkError.hint);
    } else {
      console.log("   ✅ Current value:", currentWorkspace?.google_sheet_autosync);
    }
    console.log();

    // 2. Try to update to true
    console.log("2. ATTEMPTING UPDATE TO true:");
    const { data: updateData, error: updateError } = await supabase
      .from('workspaces')
      .update({ google_sheet_autosync: true })
      .eq('id', NURA_WORKSPACE_ID)
      .select()
      .single();

    if (updateError) {
      console.log("   ❌ UPDATE ERROR:", updateError.message);
      console.log("   Code:", updateError.code);
      console.log("   Details:", updateError.details);
      console.log("   Hint:", updateError.hint);
    } else {
      console.log("   ✅ UPDATE SUCCESSFUL");
      console.log("   New value:", updateData?.google_sheet_autosync);
    }
    console.log();

    // 3. Verify the update persisted
    console.log("3. VERIFYING UPDATE PERSISTED:");
    const { data: verifyWorkspace, error: verifyError } = await supabase
      .from('workspaces')
      .select('id, google_sheet_autosync')
      .eq('id', NURA_WORKSPACE_ID)
      .single();

    if (verifyError) {
      console.log("   ❌ VERIFY ERROR:", verifyError.message);
    } else {
      console.log("   ✅ Verified value:", verifyWorkspace?.google_sheet_autosync);
    }
    console.log();

    // 4. Check workspaces table structure
    console.log("4. CHECKING workspaces TABLE COLUMNS:");
    const { data: columns, error: columnsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', NURA_WORKSPACE_ID)
      .limit(1);

    if (columnsError) {
      console.log("   ❌ COLUMNS ERROR:", columnsError.message);
    } else if (columns && columns.length > 0) {
      console.log("   ✅ Available columns:");
      Object.keys(columns[0]).forEach(col => {
        console.log(`   - ${col}`);
      });
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();
