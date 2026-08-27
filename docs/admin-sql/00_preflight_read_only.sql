-- Ecom OS Admin Control Center - Step 0 (read-only)
-- Paste this entire file into a NEW Supabase SQL Editor query and press Run.
-- It changes nothing. Keep the result for troubleshooting.

select
  current_database() as database_name,
  current_user as executing_role,
  now() as checked_at,
  current_setting('server_version') as postgres_version;

select required_object, object_exists
from (values
  ('public.profiles', to_regclass('public.profiles') is not null),
  ('public.workspaces', to_regclass('public.workspaces') is not null),
  ('public.profile_workspaces', to_regclass('public.profile_workspaces') is not null),
  ('public.orders', to_regclass('public.orders') is not null),
  ('public.products', to_regclass('public.products') is not null),
  ('public.subscription_plans', to_regclass('public.subscription_plans') is not null),
  ('public.platform_audit_logs', to_regclass('public.platform_audit_logs') is not null),
  ('public.founder_support_sessions', to_regclass('public.founder_support_sessions') is not null)
) checks(required_object, object_exists)
order by required_object;

select
  plan.id,
  plan.name,
  to_jsonb(plan) ->> 'code' as existing_code,
  plan.currency,
  plan.price_cents,
  plan.created_at
from public.subscription_plans plan
order by lower(plan.name), plan.created_at;

