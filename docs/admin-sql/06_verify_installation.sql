-- Ecom OS Admin Control Center - Step 6 (read-only verification)
-- Run only after SQL steps 1 through 5 completed successfully.

with checks(check_name, ok) as (values
  ('canonical platform permission function', to_regprocedure('public.has_platform_permission(text)') is not null),
  ('platform authorization RPC', to_regprocedure('public.platform_get_my_authorization_v1()') is not null),
  ('command center RPC', to_regprocedure('public.platform_command_center_v1(date,date)') is not null),
  ('workspace admin RPC', to_regprocedure('public.platform_list_workspaces_v1(integer,integer,text,text,text,text,uuid)') is not null),
  ('official plans RPC', to_regprocedure('public.list_official_plans_v1()') is not null),
  ('billing summary RPC', to_regprocedure('public.platform_billing_summary_v1()') is not null),
  ('support session RPC', to_regprocedure('public.platform_start_support_session_v1(uuid,uuid,text,integer)') is not null),
  ('support RLS resolver', to_regprocedure('public.has_active_support_session_for_workspace(uuid,boolean)') is not null),
  ('seller list RPC', to_regprocedure('public.platform_list_sellers_v1(integer,integer,text,text,text,text,date,date)') is not null),
  ('product list RPC', to_regprocedure('public.platform_list_products_v1(integer,integer,text,text,uuid,text)') is not null),
  ('campaign list RPC', to_regprocedure('public.platform_list_campaigns_v1(integer,integer,text,text,text,uuid)') is not null),
  ('user list RPC', to_regprocedure('public.platform_list_users_v1(integer,integer,text,text,text,text,text,boolean,date,date)') is not null),
  ('account control internal RPC', to_regprocedure('public.platform_record_auth_action_internal_v1(uuid,uuid,text,text,jsonb)') is not null)
)
select check_name, ok, case when ok then 'PASS' else 'MISSING' end as result
from checks
order by ok, check_name;

select
  count(*) filter (where code = 'starter' and name = 'Starter' and is_official) as starter,
  count(*) filter (where code = 'growth' and name = 'Growth' and is_official) as growth,
  count(*) filter (where code = 'pro' and name = 'Pro' and is_official) as pro,
  count(*) filter (where code = 'scale' and name = 'Scale' and is_official) as scale,
  count(*) filter (where is_official) as official_total
from public.subscription_plans;

select
  to_regclass('public.platform_admin_roles') is not null as platform_roles,
  to_regclass('public.user_subscriptions') is not null as owner_subscriptions,
  to_regclass('public.subscription_payment_requests') is not null as payment_requests,
  to_regclass('public.platform_auth_controls') is not null as auth_controls;
