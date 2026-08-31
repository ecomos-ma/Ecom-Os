import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://wxfialbmyfkafobtkrde.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('missing supabase service role key');
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const growth = await supabase.from('subscription_plans').select('*').eq('code', 'growth').maybeSingle();
console.log('GROWTH_FETCH', JSON.stringify(growth, null, 2));

const payload = {
  code: 'growth',
  name: 'Growth',
  description: 'For growing stores scaling COD volume.',
  monthly_price_mad: 5000,
  annual_price_mad: 50000,
  order_limit: 8000,
  order_period: 'month',
  workspace_limit: 3,
  team_member_limit: 10,
  integration_limit: null,
  mobile_app: true,
  whatsapp_automation: true,
  ai_whatsapp_confirmation_agent: true,
  sawty_os: true,
  landing_page_os: true,
  premium_support: true,
  is_popular: true,
  is_active: true,
  is_public: true,
  is_official: true,
  display_order: 20,
  badge_text: null,
  cta_text: null,
  monthly_billing_enabled: true,
  annual_billing_enabled: true,
  custom_limits: {},
  custom_benefits: [],
};

const updateResult = await supabase.from('subscription_plans').update(payload).eq('id', growth.data.id).select('*').single();
console.log('UPDATE_RESULT', JSON.stringify(updateResult, null, 2));

const testPlan = await supabase.from('subscription_plans').insert({
  code: 'test-delete-plan',
  name: 'Test Delete Plan',
  description: 'Temporary plan for delete validation',
  monthly_price_mad: 99,
  annual_price_mad: 990,
  order_limit: 250,
  order_period: 'month',
  workspace_limit: 1,
  team_member_limit: 5,
  integration_limit: null,
  is_popular: false,
  is_active: true,
  is_public: true,
  is_official: true,
  display_order: 999,
  badge_text: '',
  cta_text: 'Start with test',
  monthly_billing_enabled: true,
  annual_billing_enabled: true,
  custom_limits: {},
  custom_benefits: [],
}).select('*').single();
console.log('INSERT_TEST_PLAN', JSON.stringify(testPlan, null, 2));

const deleteResult = await supabase.from('subscription_plans').delete().eq('id', testPlan.data.id);
console.log('DELETE_RESULT', JSON.stringify(deleteResult, null, 2));
