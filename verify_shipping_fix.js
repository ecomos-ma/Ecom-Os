// Script to verify shipping cost fix and calculate impact
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

async function verifyShippingFix() {
  try {
    console.log('Verifying shipping cost fix...\n');

    // Check order ##GS-20260704-11 specifically
    const { data: orderData } = await supabase
      .from('orders')
      .select('order_number, status, delivery_status, city, ozon_city_id')
      .eq('order_number', '#GS-20260704-11')
      .limit(1);

    if (orderData && orderData.length > 0) {
      const order = orderData[0];
      console.log('Order ##GS-20260704-11:');
      console.log(`  status: "${order.status}"`);
      console.log(`  delivery_status: "${order.delivery_status}"`);
      console.log(`  city: "${order.city}"`);
      console.log(`  ozon_city_id: ${order.ozon_city_id}`);

      const status = (order.delivery_status || order.status || "").toLowerCase();
      console.log(`  normalized status: "${status}"`);

      // Get Nouaceur pricing
      const { data: cityData } = await supabase
        .from('ozon_cities')
        .select('delivered_price, returned_price, refused_price')
        .eq('id', order.ozon_city_id)
        .single();

      if (cityData) {
        console.log(`  Nouaceur pricing:`);
        console.log(`    delivered_price: ${cityData.delivered_price}`);
        console.log(`    returned_price: ${cityData.returned_price}`);
        console.log(`    refused_price: ${cityData.refused_price}`);

        // Calculate what it should be now
        let correctCost = null;
        if (status.includes('delivered') || status.includes('livre') || status.includes('livré')) {
          correctCost = cityData.delivered_price;
        } else if (status.includes('returned') || status.includes('retour') || status.includes('retours')) {
          correctCost = cityData.returned_price;
        } else if (status.includes('refused') || status.includes('refus')) {
          correctCost = cityData.refused_price;
        } else {
          correctCost = cityData.delivered_price;
        }

        console.log(`  Correct shipping cost: MAD ${correctCost} (was incorrectly showing MAD ${cityData.delivered_price})`);
      }
    }

    // Check all orders with refused status
    const { data: refusedOrders } = await supabase
      .from('orders')
      .select('order_number, status, delivery_status, city, ozon_city_id')
      .or('status.ilike.%refused%,delivery_status.ilike.%refus%');

    console.log(`\nFound ${refusedOrders.length} orders with refused status:`);
    refusedOrders.forEach(order => {
      const status = (order.delivery_status || order.status || "").toLowerCase();
      console.log(`  - ${order.order_number}: "${status}" (${order.city})`);
    });

    // Calculate total shipping cost impact
    const { data: allOrders } = await supabase
      .from('orders')
      .select('status, delivery_status, ozon_city_id, ozon_cities(delivered_price, returned_price, refused_price)')
      .not('ozon_city_id', 'is', null);

    let oldTotal = 0;
    let newTotal = 0;

    allOrders.forEach(order => {
      const status = (order.delivery_status || order.status || "").toLowerCase();
      const city = order.ozon_cities;

      // Old logic (always delivered_price)
      oldTotal += city.delivered_price;

      // New logic (status-based)
      let correctCost = city.delivered_price;
      if (status.includes('delivered') || status.includes('livre') || status.includes('livré')) {
        correctCost = city.delivered_price;
      } else if (status.includes('returned') || status.includes('retour') || status.includes('retours')) {
        correctCost = city.returned_price;
      } else if (status.includes('refused') || status.includes('refus')) {
        correctCost = city.refused_price;
      }
      newTotal += correctCost;
    });

    console.log(`\nTotal Ozon Shipping Cost Impact:`);
    console.log(`  Before fix: MAD ${oldTotal}`);
    console.log(`  After fix: MAD ${newTotal}`);
    console.log(`  Difference: MAD ${newTotal - oldTotal} (${((newTotal - oldTotal) / oldTotal * 100).toFixed(2)}%)`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyShippingFix();
