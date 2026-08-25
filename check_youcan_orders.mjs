import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkYouCanOrders() {
  console.log("=== CHECKING EXISTING YOUCAN ORDERS ===\n");

  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_number, youcan_order_id, created_at, workspace_id')
    .eq('source', 'youcan')
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample YouCan orders (chronological by created_at):');
    console.log('Total found in sample:', orders?.length || 0);
    orders?.forEach((order, i) => {
      console.log(`${i + 1}. ${order.order_number} (youcan_order_id: ${order.youcan_order_id}, created: ${order.created_at})`);
    });
  }

  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'youcan');

  console.log('\nTotal YouCan orders in database:', count);
  console.log('\n✅ Orders can be sorted chronologically using created_at field');
}

checkYouCanOrders();