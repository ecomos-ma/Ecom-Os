begin;

create or replace function public.list_official_plans_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', plan.code,
    'name', plan.name,
    'description', plan.description,
    'monthly_price_mad', plan.monthly_price_mad,
    'annual_price_mad', plan.annual_price_mad,
    'order_limit', plan.order_limit,
    'order_period', plan.order_period,
    'workspace_limit', plan.workspace_limit,
    'team_member_limit', plan.team_member_limit,
    'integration_limit', plan.integration_limit,
    'entitlements', jsonb_build_object(
      'mobile_app', coalesce(plan.mobile_app, false),
      'whatsapp_automation', coalesce(plan.whatsapp_automation, false),
      'ai_whatsapp_confirmation_agent', coalesce(plan.ai_whatsapp_confirmation_agent, false),
      'sawty_os', coalesce(plan.sawty_os, false),
      'landing_page_os', coalesce(plan.landing_page_os, false),
      'premium_support', coalesce(plan.premium_support, false)
    ),
    'is_popular', coalesce(plan.is_popular, false),
    'is_active', coalesce(plan.is_active, false),
    'is_public', coalesce(plan.is_public, true),
    'badge_text', plan.badge_text,
    'cta_text', plan.cta_text,
    'monthly_billing_enabled', coalesce(plan.monthly_billing_enabled, true),
    'annual_billing_enabled', coalesce(plan.annual_billing_enabled, true),
    'custom_limits', coalesce(plan.custom_limits, '{}'::jsonb),
    'custom_benefits', coalesce(plan.custom_benefits, '[]'::jsonb),
    'display_order', coalesce(plan.display_order, 100),
    'paypal_product_id', plan.paypal_product_id,
    'paypal_monthly_plan_id', plan.paypal_monthly_plan_id,
    'paypal_annual_plan_id', plan.paypal_annual_plan_id
  ) order by plan.display_order), '[]'::jsonb)
  from public.subscription_plans plan
  where plan.is_official
    and plan.is_active
    and coalesce(plan.is_public, true)
    and plan.archived_at is null;
$$;

commit;
