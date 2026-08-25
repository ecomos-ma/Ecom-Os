import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testEdgeWorkspaceOverview() {
  console.log("=== Testing Edge Function Workspace Overview ===\n");

  // Test with service role (simulating founder access)
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/founder-internal-access?operation=workspace-overview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({})
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.ok && Array.isArray(data)) {
      console.log(`\n✅ Successfully fetched ${data.length} workspaces`);
      if (data.length > 0) {
        console.log("\nSample workspace:");
        console.log(JSON.stringify(data[0], null, 2));
      }
    } else {
      console.log("❌ Failed to fetch workspaces");
    }
  } catch (e) {
    console.error("❌ Error:", e.message);
  }
}

testEdgeWorkspaceOverview();
