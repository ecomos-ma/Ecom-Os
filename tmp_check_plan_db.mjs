import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://wxfialbmyfkafobtkrde.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('missing env');
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = {};

try {
  const table = await supabase.from('subscription_plans').select('*').limit(10);
  results.table = table;

  const selected = await supabase
    .from('subscription_plans')
    .select('id,code,name,monthly_price_mad,annual_price_mad,order_limit,order_period,is_public,is_active,is_official,display_order,badge_text,cta_text,custom_limits,custom_benefits')
    .limit(10);
  results.selected = selected;

  const rpc = await supabase.rpc('list_official_plans_v1');
  results.rpc = rpc;

  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error('FATAL', error);
  process.exit(1);
}
