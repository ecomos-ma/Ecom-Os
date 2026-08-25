const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkOrder() {
    const { data: order, error } = await supabase
        .from('orders')
        .select(`
      id, tracking_number, status, shipping_status, delivery_status, returned_to_stock, sku,
      order_items ( product_id )
    `)
        .ilike('tracking_number', '%AGA102521393388IW%')
        .single();

    console.log('Order:', order);
    console.log('Error:', error);
}

checkOrder();
