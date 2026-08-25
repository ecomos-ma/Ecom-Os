import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  const { data, error } = await supabase.rpc('execute_sql', { query: "SELECT * FROM pg_policies WHERE tablename = 'ameex_city_mappings';" });
  
  if (error) {
    console.error("RPC failed, fetching count to check if table is accessible:", error);
    const { count } = await supabase.from('ameex_city_mappings').select('*', { count: 'exact', head: true });
    console.log("Count:", count);
  } else {
    console.log("Policies:", data);
  }
}
checkRLS().catch(console.error);
