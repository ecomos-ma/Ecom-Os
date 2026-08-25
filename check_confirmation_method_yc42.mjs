import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkYC42() {
  const { data, error } = await supabase
    .from('orders')
    .select('"Order ID", order_number, status, confirmation_method, confirmed_at')
    .eq('order_number', 'YC-42')
    .single();
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('YC-42 current state:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkYC42();
