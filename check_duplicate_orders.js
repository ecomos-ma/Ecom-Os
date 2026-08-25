// Script to check for duplicate order_numbers in orders table
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

async function checkDuplicateOrders() {
  try {
    console.log('Checking for duplicate order_numbers...\n');

    // Get all orders with their order_number
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('order_number, created_at, city, status, delivery_status');

    if (error) {
      throw error;
    }

    console.log(`Total orders in database: ${allOrders.length}`);

    // Find duplicates
    const orderNumberCount = new Map();
    const orderNumberDetails = new Map();

    allOrders.forEach(order => {
      const num = order.order_number;
      orderNumberCount.set(num, (orderNumberCount.get(num) || 0) + 1);
      
      if (!orderNumberDetails.has(num)) {
        orderNumberDetails.set(num, []);
      }
      orderNumberDetails.get(num).push(order);
    });

    // Filter duplicates (count > 1)
    const duplicates = Array.from(orderNumberCount.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    console.log(`\nFound ${duplicates.length} order_numbers with duplicates:`);

    if (duplicates.length === 0) {
      console.log('No duplicates found - order_number is unique.');
    } else {
      duplicates.forEach(([orderNumber, count]) => {
        console.log(`\n${orderNumber}: ${count} occurrences`);
        const details = orderNumberDetails.get(orderNumber);
        details.forEach((order, idx) => {
          const orderCity = order.city;
          const orderStatus = order.status;
          const orderDelivery = order.delivery_status;
          const orderCreated = order.created_at;
          console.log(`  [${idx + 1}] City: "${orderCity}", Status: "${orderStatus}", Delivery: "${orderDelivery}", Created: ${orderCreated}`);
        });
      });

      // Analyze patterns
      console.log('\n--- Pattern Analysis ---');
      const gsDuplicates = duplicates.filter(([num]) => num.startsWith('#GS-'));
      const nonGsDuplicates = duplicates.filter(([num]) => !num.startsWith('#GS-'));
      
      console.log(`Google Sheets duplicates: ${gsDuplicates.length}`);
      console.log(`Non-Google Sheets duplicates: ${nonGsDuplicates.length}`);

      // Check if duplicates are from same date
      console.log('\n--- Date Analysis ---');
      duplicates.forEach(([orderNumber, count]) => {
        const details = orderNumberDetails.get(orderNumber);
        const dates = new Set(details.map(o => o.created_at?.split('T')[0]));
        if (dates.size > 1) {
          console.log(`${orderNumber}: spans multiple dates (${Array.from(dates).join(', ')})`);
        }
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDuplicateOrders();
