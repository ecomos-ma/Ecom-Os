import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyCounter() {
  console.log('=== 1. Checking youcan_order_counters table ===');
  
  const { data: counters, error } = await supabase
    .from('youcan_order_counters')
    .select('*');
  
  if (error) {
    console.error('Error querying counters:', error);
    return;
  }
  
  console.log('Counters found:', counters);
  
  if (counters && counters.length > 0) {
    console.log(`✓ Table exists with ${counters.length} workspace(s)`);
    counters.forEach(c => {
      console.log(`  - Workspace: ${c.workspace_id}, Next sequence: ${c.next_sequence_number}, Updated: ${c.updated_at}`);
    });
  } else {
    console.log('✗ No counters found in table');
  }
  
  console.log('\n=== 2. Checking migrated orders with YC- prefix ===');
  
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('order_number, status, workspace_id')
    .like('order_number', 'YC-%')
    .order('order_number');
  
  if (ordersError) {
    console.error('Error querying orders:', ordersError);
    return;
  }
  
  console.log(`Found ${orders.length} orders with YC- prefix:`);
  orders.forEach(o => {
    console.log(`  - ${o.order_number} (ID: ${o.id}, Status: ${o.status})`);
  });
  
  if (orders.length === 8) {
    console.log('✓ Expected 8 migrated orders (YC-1 to YC-8)');
  } else {
    console.log(`⚠ Expected 8 orders, found ${orders.length}`);
  }
}

verifyCounter().catch(console.error);
