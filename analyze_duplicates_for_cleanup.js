// Script to analyze duplicates and propose cleanup following user rules
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

async function analyzeDuplicatesForCleanup() {
  try {
    console.log('Analyzing duplicates for cleanup...\n');

    // Get all orders with more details
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('order_number, created_at, city, status, delivery_status, tracking_number, phone, total, ozon_city_id, city_name');

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

    console.log(`Found ${duplicates.length} order_numbers with duplicates:\n`);

    const proposedDeletions = [];
    const manualReview = [];

    duplicates.forEach(([orderNumber, details]) => {
      console.log(`=== ${orderNumber} ===`);
      details.forEach((order, idx) => {
        console.log(`[${idx + 1}] City: "${order.city}", Status: "${order.status}", Delivery: "${order.delivery_status}", Tracking: "${order.tracking_number || 'none'}", Phone: "${order.phone || 'none'}", Total: ${order.total}, ozon_city_id: ${order.ozon_city_id}, city_name: "${order.city_name || 'none'}"`);
      });

      // Apply cleanup rules
      const isNumericCity = (city) => /^\d+$/.test(city?.trim() || '');
      
      const hasNumericCity = details.some(o => isNumericCity(o.city));
      const hasRealCity = details.some(o => !isNumericCity(o.city));
      
      // Special case: #GS-20260704-11 with returned status
      if (orderNumber === '#GS-20260704-11') {
        const returnedOrder = details.find(o => o.status === 'returned' || o.delivery_status?.toLowerCase().includes('retour'));
        if (returnedOrder) {
          const toDelete = details.find(o => o !== returnedOrder);
          if (toDelete) {
            console.log(`→ PROPOSED DELETE: [${toDelete.city === returnedOrder.city ? 'other' : 'numeric city'}] Keep returned order, delete the other`);
            proposedDeletions.push({ orderNumber, toDelete, reason: 'Keep returned order with tracking' });
          }
        }
      }
      // Rule: if one has numeric city (like "433") and other has real city name
      else if (hasNumericCity && hasRealCity) {
        const realCityOrder = details.find(o => !isNumericCity(o.city));
        const numericCityOrder = details.find(o => isNumericCity(o.city));
        console.log(`→ PROPOSED DELETE: [numeric city "${numericCityOrder.city}"] Keep real city "${realCityOrder.city}"`);
        proposedDeletions.push({ orderNumber, toDelete: numericCityOrder, reason: `Keep real city "${realCityOrder.city}" vs numeric "${numericCityOrder.city}"` });
      }
      // Rule: if neither has numeric city and both have different plausible cities
      else if (!hasNumericCity && details.length > 1) {
        const cities = [...new Set(details.map(o => o.city))];
        if (cities.length > 1) {
          console.log(`→ MANUAL REVIEW: Both have different plausible cities (${cities.join(', ')}) - cannot auto-delete`);
          manualReview.push({ orderNumber, details });
        }
      }
      console.log('');
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Proposed automatic deletions: ${proposedDeletions.length}`);
    console.log(`Manual review required: ${manualReview.length}`);

    if (proposedDeletions.length > 0) {
      console.log('\n=== PROPOSED DELETIONS (awaiting approval) ===');
      proposedDeletions.forEach(({ orderNumber, toDelete, reason }) => {
        console.log(`${orderNumber}: DELETE city="${toDelete.city}" - Reason: ${reason}`);
      });
    }

    if (manualReview.length > 0) {
      console.log('\n=== MANUAL REVIEW REQUIRED ===');
      manualReview.forEach(({ orderNumber, details }) => {
        console.log(`${orderNumber}:`);
        details.forEach((order, idx) => {
          console.log(`  [${idx + 1}] City: "${order.city}", Status: "${order.status}", Phone: "${order.phone || 'none'}"`);
        });
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeDuplicatesForCleanup();
