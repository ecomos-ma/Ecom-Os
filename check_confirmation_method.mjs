import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumn() {
  const { data, error } = await supabase
    .from('orders')
    .select('confirmation_method')
    .limit(1);
  
  if (error) {
    if (error.code === '42703') {
      console.log('Column DOES NOT EXIST - error code 42703 (undefined column)');
    } else {
      console.log('Error checking column:', error);
    }
  } else {
    console.log('Column EXISTS - query succeeded');
    console.log('Sample data:', data);
  }
}

checkColumn();
