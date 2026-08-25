import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wxfialbmyfkafobtkrde.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fb08kpwdB7aj-Yfjy9bA8w_h6Du_AyF';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check orders GS-188 and GS-189
const orderNumbers = ['#GS-188', '#GS-189'];

console.log('Checking ForceLog tracking data for orders:', orderNumbers);

for (const orderNumber of orderNumbers) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number, shipping_provider, tracking_number, shipment_id, coliaty_parcel_code, shipping_status, shipping_status_raw')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching ${orderNumber}:`, error);
  } else if (data) {
    console.log(`\n${orderNumber}:`);
    console.log('  shipping_provider:', data.shipping_provider);
    console.log('  tracking_number:', data.tracking_number);
    console.log('  shipment_id:', data.shipment_id);
    console.log('  coliaty_parcel_code:', data.coliaty_parcel_code);
    console.log('  shipping_status:', data.shipping_status);
    console.log('  shipping_status_raw:', JSON.stringify(data.shipping_status_raw, null, 2));
  } else {
    console.log(`\n${orderNumber}: NOT FOUND`);
  }
}
