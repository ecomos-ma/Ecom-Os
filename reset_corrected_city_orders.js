// Script to reset ozon_city_id for orders with old incorrect IDs
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

async function resetCorrectedCityOrders() {
  try {
    console.log('Resetting ozon_city_id for orders with old incorrect IDs...');

    const { data: affectedOrders, error: fetchError } = await supabase
      .from('orders')
      .select('order_number, city, ozon_city_id')
      .in('ozon_city_id', OLD_INCORRECT_IDS);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${affectedOrders.length} orders with old incorrect IDs`);

    if (affectedOrders.length === 0) {
      console.log('No orders to reset');
      return;
    }

    // Reset ozon_city_id and city_name for these orders
    const orderNumbers = affectedOrders.map(o => o.order_number);
    const { error } = await supabase
      .from('orders')
      .update({ ozon_city_id: null, city_name: null })
      .in('order_number', orderNumbers);

    if (error) {
      throw error;
    }

    console.log(`✅ Reset ozon_city_id for ${affectedOrders.length} orders`);

    // Show sample of reset orders
    console.log('\nSample reset orders:');
    affectedOrders.slice(0, 10).forEach(order => {
      console.log(`  - #${order.order_number}: "${order.city}" → was ID ${order.ozon_city_id}`);
    });

  } catch (error) {
    console.error('Error during reset:', error);
    process.exit(1);
  }
}

resetCorrectedCityOrders();
