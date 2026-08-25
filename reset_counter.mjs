import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetCounter() {
  console.log("=== RESETTING COUNTER TO 8 ===\n");

  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';

  // Reset counter to 8 (so next call returns YC-9)
  const { error: updateError } = await supabase
    .from('youcan_order_counters')
    .update({
      next_sequence_number: 8,
      updated_at: new Date().toISOString()
    })
    .eq('workspace_id', workspaceId);

  if (updateError) {
    console.error("Error updating counter:", updateError);
  } else {
    console.log("✅ Counter reset to next_sequence_number = 8");
  }

  // Verify the counter
  const { data: counter } = await supabase
    .from('youcan_order_counters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  console.log("Counter state:", counter);
}

resetCounter();
