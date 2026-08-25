import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function applyMigration() {
  console.log("=== APPLYING YOUCAN SEQUENTIAL ORDER NUMBERING MIGRATION ===\n");

  const migrationSQL = readFileSync('./supabase/migrations/202608210001_add_youcan_sequential_order_numbers.sql', 'utf8');

  // Split the SQL into individual statements and execute them
  const statements = migrationSQL
    .split('--')
    .filter(s => s.trim())
    .map(s => '--' + s)
    .join('\n')
    .split(';')
    .filter(s => s.trim() && !s.trim().startsWith('--'));

  for (const statement of statements) {
    if (statement.trim()) {
      console.log("Executing:", statement.trim().substring(0, 100) + "...");
      const { error } = await supabase.rpc('exec_sql', { query: statement.trim() });
      if (error) {
        console.error("Error:", error);
        // Continue anyway as some statements might already exist
      } else {
        console.log("✅ Success");
      }
    }
  }

  console.log("\n=== VERIFYING MIGRATION ===");

  // Check if table exists
  const { data: tables, error: tableError } = await supabase
    .from('youcan_order_counters')
    .select('*')
    .limit(1);

  if (tableError) {
    console.error("❌ Table verification failed:", tableError);
  } else {
    console.log("✅ youcan_order_counters table exists");
  }

  // Test the function
  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920'; // Use existing workspace
  const { data: funcResult, error: funcError } = await supabase
    .rpc('get_next_youcan_order_number', { p_workspace_id: workspaceId });

  if (funcError) {
    console.error("❌ Function test failed:", funcError);
  } else {
    console.log("✅ Function works! First order number:", funcResult);
  }

  console.log("\n=== MIGRATION COMPLETE ===");
}

applyMigration();