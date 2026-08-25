import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkYC42Messages() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('order_id', 'c58e4ed9-bc56-438c-85a1-4492ecd044a0')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('YC-42 WhatsApp messages:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkYC42Messages();
