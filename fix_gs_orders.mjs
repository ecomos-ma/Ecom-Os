// Fix existing Google Sheets orders with correct city, total, and shipping_status
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixOrders() {
  console.log('=== Fixing Google Sheets Orders ===\n');

  try {
    // Fetch all Google Sheets orders
    const { data: orders, error } = await supabase
      .from('orders')
      .select('"Order ID", order_number, customer_name, phone, city, total, shipping_status, delivery_status, status, raw_city, variant_price')
      .eq('source', 'sheets')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }

    if (!orders || orders.length === 0) {
      console.log('No Google Sheets orders found');
      return;
    }

    console.log(`Found ${orders.length} Google Sheets orders to check:\n`);

    let fixedCount = 0;

    for (const order of orders) {
      console.log(`--- Order ${order.order_number} ---`);
      console.log(`Current: city=${order.city}, total=${order.total}, shipping_status=${order.shipping_status}`);
      console.log(`Fallback: raw_city=${order.raw_city}, variant_price=${order.variant_price}, delivery_status=${order.delivery_status}`);
      console.log(`Order ID: ${order["Order ID"]}`);

      const updates = {};

      // Fix city: use raw_city if city is null
      if (!order.city && order.raw_city) {
        updates.city = order.raw_city;
        console.log(`  Will set city to: ${order.raw_city}`);
      }

      // Fix total: use variant_price if total is 0 or null
      if ((!order.total || order.total === 0) && order.variant_price && order.variant_price > 0) {
        updates.total = order.variant_price;
        console.log(`  Will set total to: ${order.variant_price}`);
      }

      // Fix shipping_status: use delivery_status if shipping_status is null/pending
      if (!order.shipping_status && order.delivery_status && order.delivery_status !== 'pending') {
        updates.shipping_status = order.delivery_status;
        console.log(`  Will set shipping_status to: ${order.delivery_status}`);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('orders')
          .update(updates)
          .eq('"Order ID"', order["Order ID"]);

        if (updateError) {
          console.error(`  Error updating order ${order.order_number}:`, updateError);
        } else {
          console.log(`  ✓ Fixed order ${order.order_number}`);
          fixedCount++;
        }
      } else {
        console.log(`  No fixes needed`);
      }
      console.log('');
    }

    console.log(`\n=== Summary ===`);
    console.log(`Fixed ${fixedCount} orders`);

  } catch (error) {
    console.error('Fix failed:', error);
  }
}

fixOrders();