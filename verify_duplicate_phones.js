// Script to verify phone numbers and identify true duplicates vs order_number collisions
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

async function verifyDuplicatePhones() {
  try {
    console.log('Verifying phone numbers for duplicates...\n');

    // Get all orders with full details
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('order_number, city, status, delivery_status, tracking_number, phone, total, created_at, ozon_city_id, city_name');

    if (error) {
      throw error;
    }

    // Find duplicates
    const orderNumberDetails = new Map();

    allOrders.forEach(order => {
      const num = order.order_number;
      if (!orderNumberDetails.has(num)) {
        orderNumberDetails.set(num, []);
      }
      orderNumberDetails.get(num).push(order);
    });

    // Filter duplicates (count > 1)
    const duplicates = Array.from(orderNumberDetails.entries())
      .filter(([_, details]) => details.length > 1)
      .sort((a, b) => a[0].localeCompare(b[0]));

    console.log(`Analyzing ${duplicates.length} order_numbers with duplicates:\n`);

    const trueDuplicates = [];
    const orderNumberCollisions = [];

    duplicates.forEach(([orderNumber, details]) => {
      console.log(`=== ${orderNumber} ===`);
      details.forEach((order, idx) => {
        console.log(`[${idx + 1}] Phone: "${order.phone}", Total: ${order.total}, Tracking: "${order.tracking_number || 'none'}", City: "${order.city}", Status: "${order.status}"`);
      });

      // Check if same phone, same total, same tracking = true duplicate
      const samePhone = details.length === 2 && details[0].phone === details[1].phone;
      const sameTotal = details.length === 2 && details[0].total === details[1].total;
      const sameTracking = details.length === 2 && details[0].tracking_number === details[1].tracking_number;

      if (samePhone && sameTotal && sameTracking) {
        console.log(`→ TRUE DUPLICATE: Same phone, total, and tracking`);
        trueDuplicates.push({ orderNumber, details });
      } else {
        console.log(`→ ORDER_NUMBER COLLISION: Different phones/totals/trackings - these are distinct orders`);
        orderNumberCollisions.push({ orderNumber, details });
      }
      console.log('');
    });

    console.log('\n=== SUMMARY ===');
    console.log(`True duplicates (same phone + total + tracking): ${trueDuplicates.length}`);
    console.log(`Order number collisions (distinct orders): ${orderNumberCollisions.length}`);

    if (trueDuplicates.length > 0) {
      console.log('\n=== TRUE DUPLICATES (safe to delete one) ===');
      trueDuplicates.forEach(({ orderNumber, details }) => {
        const numericCityOrder = details.find(o => /^\d+$/.test(o.city?.trim() || ''));
        const realCityOrder = details.find(o => !/^\d+$/.test(o.city?.trim() || ''));
        if (numericCityOrder && realCityOrder) {
          console.log(`${orderNumber}: DELETE city="${numericCityOrder.city}" (keep "${realCityOrder.city}")`);
        }
      });
    }

    if (orderNumberCollisions.length > 0) {
      console.log('\n=== ORDER NUMBER COLLISIONS (need renumbering) ===');
      orderNumberCollisions.forEach(({ orderNumber, details }) => {
        console.log(`${orderNumber}:`);
        details.forEach((order, idx) => {
          console.log(`  [${idx + 1}] Phone: "${order.phone}", Total: ${order.total}, City: "${order.city}", Status: "${order.status}"`);
        });
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyDuplicatePhones();
