import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxfialbmyfkafobtkrde.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fb08kpwdB7aj-Yfjy9bA8w_h6Du_AyF';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check total order count
const { count: totalCount } = await supabase
  .from('orders')
  .select('*', { count: 'exact', head: true });

console.log('Total orders in database:', totalCount);

// Check recent orders
console.log('\n\nChecking recent orders:');
const { data: recentOrders } = await supabase
  .from('orders')
  .select('order_number, shipping_provider, tracking_number, shipment_id, coliaty_parcel_code, shipping_status, workspace_id')
  .order('created_at', { ascending: false })
  .limit(10);

if (recentOrders && recentOrders.length > 0) {
  console.log(`Found ${recentOrders.length} recent orders:`);
  for (const order of recentOrders) {
    console.log(`\n${order.order_number} (workspace: ${order.workspace_id}):`);
    console.log('  shipping_provider:', order.shipping_provider);
    console.log('  tracking_number:', order.tracking_number);
    console.log('  shipment_id:', order.shipment_id);
    console.log('  coliaty_parcel_code:', order.coliaty_parcel_code);
    console.log('  shipping_status:', order.shipping_status);
  }
} else {
  console.log('No orders found');
}

// Check orders with tracking numbers
console.log('\n\nChecking orders with tracking numbers:');
const { data: trackedOrders } = await supabase
  .from('orders')
  .select('order_number, shipping_provider, tracking_number, shipment_id, coliaty_parcel_code, shipping_status, workspace_id')
  .not('tracking_number', 'is', null)
  .order('created_at', { ascending: false })
  .limit(10);

if (trackedOrders && trackedOrders.length > 0) {
  console.log(`Found ${trackedOrders.length} orders with tracking numbers:`);
  for (const order of trackedOrders) {
    console.log(`\n${order.order_number} (workspace: ${order.workspace_id}):`);
    console.log('  shipping_provider:', order.shipping_provider);
    console.log('  tracking_number:', order.tracking_number);
    console.log('  shipment_id:', order.shipment_id);
    console.log('  coliaty_parcel_code:', order.coliaty_parcel_code);
    console.log('  shipping_status:', order.shipping_status);
  }
} else {
  console.log('No orders with tracking numbers found');
}
