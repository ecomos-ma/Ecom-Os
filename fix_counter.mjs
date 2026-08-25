import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCounter() {
  console.log("=== FIXING YOUCAN ORDER COUNTER ===\n");

  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';

  // Manually create the counter table entry
  const { error: insertError } = await supabase
    .from('youcan_order_counters')
    .insert({
      workspace_id: workspaceId,
      next_sequence_number: 9, // Next order should be YC-9 (we have YC-1 to YC-8)
      updated_at: new Date().toISOString()
    });

  if (insertError) {
    console.error("Error creating counter:", insertError);
  } else {
    console.log("✅ Counter created with next_sequence_number = 9");
  }

  // Verify the counter
  const { data: counter } = await supabase
    .from('youcan_order_counters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  console.log("Counter state:", counter);
}

fixCounter();