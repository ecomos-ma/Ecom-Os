import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testWebhook() {
  console.log("=== TESTING YOUCAN WEBHOOK SIMULATION ===\n");

  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';

  // Simulate calling the get_next_youcan_order_number function
  const { data: orderNumber, error } = await supabase
    .rpc('get_next_youcan_order_number', { 
      p_workspace_id: workspaceId 
    });

  if (error) {
    console.error("Error generating order number:", error);
  } else {
    console.log("✅ Generated order number:", orderNumber);
    
    // Verify the counter was incremented
    const { data: counter } = await supabase
      .from('youcan_order_counters')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single();

    console.log("Counter state after increment:", counter);
    
    if (orderNumber === 'YC-9') {
      console.log("✅ CORRECT: Order number is YC-9 as expected");
    } else {
      console.log(`❌ INCORRECT: Expected YC-9, got ${orderNumber}`);
    }
  }
}

testWebhook();
