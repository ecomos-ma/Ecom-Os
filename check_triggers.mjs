import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTriggers() {
  const { data, error } = await supabase.rpc('exec_sql', { 
    sql: `SELECT 
      trigger_name,
      event_manipulation,
      event_object_table,
      action_timing,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND trigger_schema = 'public'
    ORDER BY event_manipulation, action_timing;`
  });
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Triggers on orders table:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkTriggers();
