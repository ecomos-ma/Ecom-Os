// Alternative approach to inspect orders table schema
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
  console.log('=== Inspecting Orders Table Schema ===\n');

  try {
    // Try to select a sample row to see actual structure
    const { data: sampleOrder, error: sampleError } = await supabase
      .from('orders')
      .select('*')
      .eq('source', 'sheets')
      .limit(1);

    if (sampleError) {
      console.error('Sample query failed:', sampleError.message);
    } else if (sampleOrder && sampleOrder.length > 0) {
      console.log('Sample Google Sheets order structure:');
      console.log('Available fields:', Object.keys(sampleOrder[0]));
      console.log('\nSample data:');
      console.log(JSON.stringify(sampleOrder[0], null, 2));
    } else {
      console.log('No Google Sheets orders found, trying any order...');
      
      const { data: anyOrder, error: anyError } = await supabase
        .from('orders')
        .select('*')
        .limit(1);
        
      if (anyError) {
        console.error('Any order query failed:', anyError.message);
      } else if (anyOrder && anyOrder.length > 0) {
        console.log('Sample order structure:');
        console.log('Available fields:', Object.keys(anyOrder[0]));
      }
    }

    // Try to use a raw SQL query via RPC if available
    const { data: sqlResult, error: sqlError } = await supabase
      .rpc('exec_sql', { 
        sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' AND table_schema = 'public' ORDER BY ordinal_position;"
      });

    if (sqlError) {
      console.log('RPC SQL query not available:', sqlError.message);
    } else {
      console.log('\nColumns from SQL query:');
      console.log(sqlResult);
    }

  } catch (error) {
    console.error('Inspection failed:', error.message);
  }
}

inspectOrdersSchema();