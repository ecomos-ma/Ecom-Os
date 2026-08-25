import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testWorkspaceOverview() {
  console.log("=== Testing founder_get_workspace_overview RPC ===\n");

  try {
    const { data, error } = await supabase
      .rpc('founder_get_workspace_overview');

    if (error) {
      console.error("❌ Error calling RPC:", error);
      return;
    }

    console.log("✅ RPC call successful");
    console.log(`Found ${data.length} workspaces`);
    
    if (data.length > 0) {
      console.log("\nSample workspace data:");
      console.log(JSON.stringify(data[0], null, 2));
      
      console.log("\nAll workspaces:");
      data.forEach((ws, i) => {
        console.log(`${i + 1}. ${ws.workspace_name} - ${ws.total_orders} orders, ${ws.total_revenue} MAD`);
        console.log(`   Integrations: ${JSON.stringify(ws.active_integrations)}`);
        console.log(`   Last activity: ${ws.last_activity}`);
      });
    }
  } catch (e) {
    console.error("❌ Exception:", e.message);
  }
}

testWorkspaceOverview();
