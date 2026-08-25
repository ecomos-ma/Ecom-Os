import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createCounterTable() {
  console.log("=== CREATING YOUCAN ORDER COUNTER TABLE ===\n");

  try {
    // Use raw SQL via the Postgres REST API doesn't work for DDL
    // So we'll insert directly into a table that should exist or use a workaround
    
    // Since we can't run DDL via the client, let's check if the table exists first
    // and if not, we'll need to create it manually in the Supabase dashboard
    
    console.log("⚠️  The youcan_order_counters table needs to be created manually in Supabase SQL Editor");
    console.log("Please run the SQL from 'apply_youcan_counter.sql' in your Supabase SQL Editor");
    console.log("\nAfter creating the table, run fix_counter.mjs to initialize the counter");
    
    // For now, let's at least verify the current state
    const { data: orders } = await supabase
      .from('orders')
      .select('order_number, youcan_order_id, created_at')
      .eq('source', 'youcan')
      .order('created_at', { ascending: true })
      .limit(10);

    console.log("\nCurrent YouCan orders:");
    orders?.forEach((o, i) => {
      console.log(`  ${i + 1}. ${o.order_number} (youcan_order_id: ${o.youcan_order_id})`);
    });

  } catch (error) {
    console.error("Error:", error);
  }
}

createCounterTable();