// Script to reset ozon_city_id to NULL for all orders (to fix incorrect migration)
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

async function resetCityIds() {
  try {
    console.log('Resetting ozon_city_id to NULL for orders with Arabic city text...');

    // First, get orders with Arabic city text that have ozon_city_id set
    const { data: arabicOrders, error: fetchError } = await supabase
      .from('orders')
      .select('order_number, city, ozon_city_id')
      .not('ozon_city_id', 'is', null)
      .not('city', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${arabicOrders.length} orders with ozon_city_id`);

    // Filter for Arabic text using regex
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const arabicCityOrders = arabicOrders.filter(order => arabicPattern.test(order.city));

    console.log(`Found ${arabicCityOrders.length} orders with Arabic city text to reset`);

    if (arabicCityOrders.length === 0) {
      console.log('No orders with Arabic city text to reset');
      return;
    }

    // Reset only those orders
    const orderNumbers = arabicCityOrders.map(o => o.order_number);
    const { error } = await supabase
      .from('orders')
      .update({ ozon_city_id: null, city_name: null })
      .in('order_number', orderNumbers);

    if (error) {
      throw error;
    }

    console.log(`✅ Reset ozon_city_id for ${arabicCityOrders.length} orders with Arabic city text`);

    // Show sample of reset orders
    console.log('\nSample reset orders:');
    arabicCityOrders.slice(0, 10).forEach(order => {
      console.log(`  - #${order.order_number}: "${order.city}" → was ID ${order.ozon_city_id}`);
    });

    // Verify
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('order_number', orderNumbers)
      .not('ozon_city_id', 'is', null);

    if (countError) {
      console.error('Error counting:', countError);
    } else {
      console.log(`\nOrders with ozon_city_id after reset: ${count} (should be 0)`);
    }

  } catch (error) {
    console.error('Error during reset:', error);
    process.exit(1);
  }
}

resetCityIds();
