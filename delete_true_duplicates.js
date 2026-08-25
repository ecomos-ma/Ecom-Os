// Script to delete the 2 true duplicates (same phone + total + tracking)
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

async function deleteTrueDuplicates() {
  try {
    console.log('Deleting true duplicates...\n');

    // #GS-20260704-1: DELETE city="433" (keep "طانطان المغرب")
    const { error: err1 } = await supabase
      .from('orders')
      .delete()
      .match({ order_number: '#GS-20260704-1', city: '433' });

    if (err1) {
      console.error('Error deleting #GS-20260704-1 (city=433):', err1);
    } else {
      console.log('✓ Deleted #GS-20260704-1 with city="433"');
    }

    // #GS-20260704-2: DELETE city="433" (keep "سلوان العمران إقليم الناضور")
    const { error: err2 } = await supabase
      .from('orders')
      .delete()
      .match({ order_number: '#GS-20260704-2', city: '433' });

    if (err2) {
      console.error('Error deleting #GS-20260704-2 (city=433):', err2);
    } else {
      console.log('✓ Deleted #GS-20260704-2 with city="433"');
    }

    console.log('\nVerification: checking remaining duplicates...');
    const { data: remaining } = await supabase
      .from('orders')
      .select('order_number, city, phone, total, tracking_number')
      .in('order_number', ['#GS-20260704-1', '#GS-20260704-2']);

    console.log('Remaining orders for these order_numbers:');
    remaining.forEach(o => {
      console.log(`  ${o.order_number}: city="${o.city}", phone="${o.phone}", total=${o.total}, tracking="${o.tracking_number}"`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteTrueDuplicates();
