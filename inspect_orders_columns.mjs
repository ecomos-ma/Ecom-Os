// Inspect actual orders table columns from database
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

async function inspectOrdersColumns() {
  console.log('=== Inspecting Orders Table Columns ===\n');

  try {
    // Run the diagnostic query from the migration
    const { data: columns, error } = await supabase
      .rpc('exec_sql', { 
        sql: `SELECT column_name, data_type, is_nullable 
               FROM information_schema.columns 
               WHERE table_name = 'orders' 
               AND table_schema = 'public'
               ORDER BY ordinal_position;`
      });

    if (error) {
      console.log('RPC not available, trying direct query...');
      
      // Try to get a sample order to see actual structure
      const { data: sampleOrder, error: sampleError } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error('Failed to query orders:', sampleError.message);
      } else if (sampleOrder && sampleOrder.length > 0) {
        console.log('Available columns from sample order:');
        console.log(Object.keys(sampleOrder[0]).join('\n'));
      }
    } else {
      console.log('Orders table columns:');
      columns?.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });
    }

  } catch (error) {
    console.error('Inspection failed:', error.message);
  }
}

inspectOrdersColumns();