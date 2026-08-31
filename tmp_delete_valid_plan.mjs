import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://wxfialbmyfkafobtkrde.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('missing env');

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const insert = await supabase
  .from('subscription_plans')
  .insert({
    name: 'Test Delete Plan Valid',
    description: 'Temporary validation plan with null code',
    orders_limit: 500,
    products_limit: 1000,
    members_limit: 10,
    storage_limit_gb: 10,
    integrations_limit: 5,
    price_cents: 1500,
    currency: 'MAD',
    code: null,
    monthly_price_mad: 149,
    annual_price_mad: 1490,
    order_limit: 500,
    order_period: 'month',
    workspace_limit: 1,
    team_member_limit: 10,
    integration_limit: null,
    mobile_app: false,
    whatsapp_automation: false,
    ai_whatsapp_confirmation_agent: false,
    sawty_os: false,
    landing_page_os: false,
    premium_support: false,
    is_popular: false,
    is_active: true,
    is_public: true,
    is_official: true,
    display_order: 999,
    badge_text: null,
    cta_text: 'Try test plan',
    monthly_billing_enabled: true,
    annual_billing_enabled: true,
    custom_limits: {},
    custom_benefits: [],
    metadata: {},
  })
  .select('*')
  .single();

console.log('INSERT_OK', JSON.stringify(insert, null, 2));

if (insert.data) {
  const del = await supabase.from('subscription_plans').delete().eq('id', insert.data.id);
  console.log('DELETE_OK', JSON.stringify(del, null, 2));
}
