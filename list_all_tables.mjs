import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== LISTING ALL TABLES IN DATABASE ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  try {
    // Try to get all tables using PostgreSQL system tables
    console.log("1. QUERYING POSTGRES SYSTEM TABLES:");
    const { data: tablesData, error: tablesError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `
      });

    if (tablesError) {
      console.log("   ❌ ERROR via RPC:", tablesError.message);
      
      // Try direct SQL query via REST
      console.log("   Trying direct SQL via REST API...");
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            query: `
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
              ORDER BY table_name;
            `
          })
        });
        
        const result = await response.json();
        console.log("   REST API result:", result);
      } catch (e) {
        console.log("   ❌ REST API also failed:", e.message);
      }
    } else {
      console.log("   ✅ TABLES FOUND:", tablesData?.length || 0);
      if (tablesData && tablesData.length > 0) {
        console.log("   All tables:");
        tablesData.forEach(row => {
          console.log(`   - ${row.table_name}`);
        });
      }
    }
    console.log();

    // Alternative: Try to query from known tables to see what's actually accessible
    console.log("2. CHECKING ROW COUNTS FOR ALL COMMON TABLES:");
    const commonTables = [
      'profiles', 'workspaces', 'orders', 'customers', 'products', 
      'shipments', 'campaigns', 'meta_campaigns', 'ozon_cities',
      'city_arabic_names', 'city_aliases', 'profile_workspaces',
      'expenses', 'ad_spend', 'tracking_events'
    ];

    for (const tableName of commonTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (!error) {
          console.log(`   ✅ ${tableName}: ${data?.count || 0} rows`);
        } else {
        }
      } catch (e) {
        // Table doesn't exist - skip
      }
    }
    console.log();

    // Check if there's any data at all in the database
    console.log("3. SAMPLE DATA FROM NON-EMPTY TABLES:");
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, workspace_id')
      .limit(3);

    if (!profilesError && profiles && profiles.length > 0) {
      console.log("   Sample profiles:");
      profiles.forEach(p => {
        console.log(`   - ${p.full_name} (${p.id}) - workspace: ${p.workspace_id}`);
      });
    }

    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name')
      .limit(3);

    if (!wsError && workspaces && workspaces.length > 0) {
      console.log("   Sample workspaces:");
      workspaces.forEach(w => {
        console.log(`   - ${w.name} (${w.id})`);
      });
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();