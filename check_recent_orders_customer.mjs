import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRecentOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('"Order ID", order_number, customer_id, customer_name, phone, created_at')
    .eq('workspace_id', '03826be0-e050-42d7-a030-a7d5a8d4f920')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Recent orders:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkRecentOrders();
