// Script to check if orders were sent to Ozon with old incorrect IDs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env manually
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');
const env = {};
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

// Old incorrect IDs that were corrected
const OLD_INCORRECT_IDS = [2047, 1622, 1922, 1832, 2146, 2178];

async function checkSentWithOldIds() {
  try {
    console.log('Checking if orders were sent to Ozon with old incorrect IDs...');

    // Check orders with tracking_number (sent to Ozon) and old incorrect IDs
    const { data: sentOrders, error: fetchError } = await supabase
      .from('orders')
      .select('order_number, city, ozon_city_id, tracking_number, shipping_provider, status')
      .in('ozon_city_id', OLD_INCORRECT_IDS)
      .not('tracking_number', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    if (sentOrders && sentOrders.length > 0) {
      console.log(`\n⚠️ Found ${sentOrders.length} orders sent to Ozon with old incorrect IDs:`);
      sentOrders.forEach(order => {
        console.log(`  - #${order.order_number}: "${order.city}" → ID ${order.ozon_city_id}, tracking: ${order.tracking_number}, provider: ${order.shipping_provider}, status: ${order.status}`);
      });
    } else {
      console.log('✅ No orders were sent to Ozon with old incorrect IDs');
    }

    // Also check orders that have ozon_raw_response (indicates Ozon API call was made)
    const { data: apiOrders, error: apiError } = await supabase
      .from('orders')
      .select('order_number, city, ozon_city_id, tracking_number, status')
      .in('ozon_city_id', OLD_INCORRECT_IDS)
      .not('ozon_raw_response', 'is', null);

    if (apiError) {
      console.error('Error checking API orders:', apiError);
    } else if (apiOrders && apiOrders.length > 0) {
      console.log(`\n⚠️ Found ${apiOrders.length} orders with Ozon API calls using old incorrect IDs:`);
      apiOrders.forEach(order => {
        console.log(`  - #${order.order_number}: "${order.city}" → ID ${order.ozon_city_id}, tracking: ${order.tracking_number || 'none'}, status: ${order.status}`);
      });
    }

  } catch (error) {
    console.error('Error during check:', error);
    process.exit(1);
  }
}

checkSentWithOldIds();
