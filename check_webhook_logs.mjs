import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkWebhookLogs() {
  console.log("=== CHECKING WEBHOOK LOGS ===\n");

  const { data: logs, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('provider', 'youcan')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error querying webhook logs:", error);
  } else {
    console.log(`Found ${logs.length} recent YouCan webhook logs:`);
    logs.forEach(log => {
      console.log(`\n- Event: ${log.event_type}`);
      console.log(`  Status: ${log.status}`);
      console.log(`  Created: ${log.created_at}`);
      console.log(`  Payload keys: ${Object.keys(log.payload || {}).join(', ')}`);
    });
  }
}

checkWebhookLogs();
