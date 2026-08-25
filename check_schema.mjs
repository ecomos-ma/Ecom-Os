import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('=== Checking orders table schema ===');
  
  const { data: columns, error } = await supabase
    .rpc('get_table_columns', { table_name: 'orders' });
  
  if (error) {
    console.error('Error getting columns:', error);
    
    // Try alternative approach
    console.log('\nTrying direct query...');
    const { data: sample, error: sampleError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('Error querying orders:', sampleError);
    } else {
      console.log('Sample order data:', sample);
      if (sample && sample.length > 0) {
        console.log('Available columns:', Object.keys(sample[0]));
      }
    }
  } else {
    console.log('Columns:', columns);
  }
  
  console.log('\n=== Checking workspaces ===');
  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name');
  
  if (wsError) {
    console.error('Error querying workspaces:', wsError);
  } else {
    console.log('Workspaces:', workspaces);
  }
}

checkSchema().catch(console.error);
