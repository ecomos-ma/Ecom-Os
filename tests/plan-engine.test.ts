import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlanRecord, getPriceForBilling, getPlanPrice } from '../src/lib/planEngine.ts';

test('normalizePlanRecord resolves database fields into UI-friendly plan metadata', () => {
  const plan = normalizePlanRecord({
    code: 'growth',
    name: 'Growth Plus',
    description: 'Scaling sellers',
    monthly_price_mad: 449,
    annual_price_mad: 4490,
    order_limit: 8000,
    order_period: 'month',
    workspace_limit: 5,
    team_member_limit: 15,
    integration_limit: null,
    is_popular: true,
    is_active: true,
    is_public: true,
    display_order: 20,
    entitlements: {
      mobile_app: true,
      whatsapp_automation: false,
      ai_whatsapp_confirmation_agent: true,
      sawty_os: true,
      landing_page_os: true,
      premium_support: true,
    },
  });

  assert.equal(plan.code, 'growth');
  assert.equal(plan.name, 'Growth Plus');
  assert.equal(plan.monthlyPrice, 449);
  assert.equal(plan.yearlyPrice, 4490);
  assert.equal(plan.limits.ordersMonthly, 8000);
  assert.equal(plan.limits.workspaces, 5);
  assert.equal(plan.limits.teamMembers, 15);
  assert.equal(plan.features.whatsappAutomation, false);
  assert.equal(plan.badgeText, 'Most popular');
});

test('getPlanPrice uses monthly or annual price depending on billing cycle', () => {
  const plan = { code: 'starter', monthlyPrice: 199, yearlyPrice: 1990 } as any;
  assert.equal(getPlanPrice(plan, 'monthly'), 199);
  assert.equal(getPlanPrice(plan, 'yearly'), 1990);
});

test('getPriceForBilling falls back safely for missing billing values', () => {
  assert.equal(getPriceForBilling({ monthlyPrice: 399, yearlyPrice: 3990 } as any, 'monthly'), 399);
  assert.equal(getPriceForBilling({ monthlyPrice: 399, yearlyPrice: 3990 } as any, 'yearly'), 3990);
});
