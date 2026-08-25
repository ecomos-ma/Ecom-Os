// Check actual values in orders table for Google Sheets orders
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

async function checkOrders() {
  console.log('=== Checking Google Sheets Orders ===\n');

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_number, customer_name, phone, city, total, shipping_status, delivery_status, status, product_variant, sku, source, sync_key')
      .eq('source', 'sheets')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }

    if (!orders || orders.length === 0) {
      console.log('No Google Sheets orders found');
      return;
    }

    console.log(`Found ${orders.length} recent Google Sheets orders:\n`);

    orders.forEach((order, index) => {
      console.log(`--- Order ${index + 1}: ${order.order_number} ---`);
      console.log(`Customer: ${order.customer_name}`);
      console.log(`Phone: ${order.phone}`);
      console.log(`City: ${order.city}`);
      console.log(`Total: ${order.total}`);
      console.log(`Shipping Status: ${order.shipping_status}`);
      console.log(`Delivery Status: ${order.delivery_status}`);
      console.log(`Status: ${order.status}`);
      console.log(`SKU: ${order.sku}`);
      console.log(`Variant: ${order.product_variant}`);
      console.log(`Source: ${order.source}`);
      console.log(`Sync Key: ${order.sync_key}`);
      console.log('');
    });

  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkOrders();