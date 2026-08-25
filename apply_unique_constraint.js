// Script to apply UNIQUE constraint on orders.order_number
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

async function applyUniqueConstraint() {
  try {
    console.log('Applying UNIQUE constraint on orders.order_number...\n');

    const { error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);'
    });

    if (error) {
      // Try direct SQL execution via REST API
      const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          sql: 'ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to apply constraint: ${response.statusText}`);
      }
    }

    console.log('✓ UNIQUE constraint applied successfully on orders.order_number');
    console.log('\nFuture Google Sheets imports will now fail on duplicate order_numbers instead of creating duplicates.');

  } catch (error) {
    console.error('Error applying UNIQUE constraint:', error.message);
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);');
    process.exit(1);
  }
}

applyUniqueConstraint();
