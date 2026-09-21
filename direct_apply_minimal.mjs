import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMinimalFix() {
  console.log("Applying minimal fix directly...");
  
  const fixSQL = readFileSync('apply_minimal_fix.sql', 'utf8');
  
  console.log("SQL content length:", fixSQL.length);
  console.log("First 200 chars:", fixSQL.substring(0, 200));
  
  // Apply the fix using service role
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: fixSQL });
  
  if (error) {
    console.error("Error applying fix:", error);
    console.log("Trying via direct PostgreSQL connection...");
    
    // Try using pg library for direct connection
    try {
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: supabaseUrl,
        ssl: { rejectUnauthorized: false }
      });
      
      await client.connect();
      await client.query(fixSQL);
      await client.end();
      
      console.log("✅ Fix applied successfully via direct connection");
    } catch (err) {
      console.error("❌ Direct connection also failed:", err);
    }
  } else {
    console.log("✅ Fix applied successfully via RPC:", data);
  }
}

applyMinimalFix();
