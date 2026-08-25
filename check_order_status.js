// Script to check the actual status of order ##GS-20260704-11
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

async function checkOrderStatus() {
  try {
    console.log('Checking status for order ##GS-20260704-11...');

    const { data, error } = await supabase
      .from('orders')
      .select('order_number, status, delivery_status, shipping_status, city, ozon_city_id')
      .eq('order_number', '#GS-20260704-11');

    if (error) {
      throw error;
    }

    console.log('\nOrder status details:');
    console.log(JSON.stringify(data, null, 2));

    // Also check Nouaceur pricing
    const { data: cityData } = await supabase
      .from('ozon_cities')
      .select('id, name, delivered_price, returned_price, refused_price')
      .ilike('name', '%nouaceur%');

    console.log('\nNouaceur city pricing:');
    console.log(JSON.stringify(cityData, null, 2));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrderStatus();
