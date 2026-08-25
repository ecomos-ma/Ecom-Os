// Inspect the real orders table schema to identify actual column names
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

async function inspectOrdersSchema() {
  console.log('=== Inspecting Real Orders Table Schema ===\n');

  try {
    // Method 1: Use PostgreSQL information_schema
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'orders' });
    
    if (columnsError) {
      console.log('Method 1 failed, trying alternative...');
    } else {
      console.log('Orders table columns:');
      columns?.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    // Method 2: Direct query to information_schema
    const { data: schemaData, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'orders')
      .eq('table_schema', 'public')
      .order('ordinal_position');

    if (schemaError) {
      console.error('Schema query failed:', schemaError.message);
    } else {
      console.log('\nOrders table schema from information_schema:');
      schemaData?.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });
    }

    // Method 3: Try to select a sample row to see actual structure
    const { data: sampleOrder, error: sampleError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error('Sample query failed:', sampleError.message);
    } else if (sampleOrder && sampleOrder.length > 0) {
      console.log('\nSample order structure:');
      console.log('Available fields:', Object.keys(sampleOrder[0]));
    }

  } catch (error) {
    console.error('Inspection failed:', error.message);
  }
}

inspectOrdersSchema();