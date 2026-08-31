begin;

-- Forward migration for the real plan control center.
-- This is intentionally idempotent and safe to apply on top of any earlier plan migration.
-- It ensures the canonical database schema used by the admin UI and entitlement logic is present
-- before any frontend mutation is trusted.

alter table public.subscription_plans
  add column if not exists code text,
  add column if not exists monthly_price_mad numeric(12,2),
  add column if not exists annual_price_mad numeric(12,2),
  add column if not exists order_limit integer,
  add column if not exists order_period text,
  add column if not exists workspace_limit integer,
  add column if not exists team_member_limit integer,
  add column if not exists integration_limit integer,
  add column if not exists mobile_app boolean not null default false,
  add column if not exists whatsapp_automation boolean not null default false,
  add column if not exists ai_whatsapp_confirmation_agent boolean not null default false,
  add column if not exists sawty_os boolean not null default false,
  add column if not exists landing_page_os boolean not null default false,
  add column if not exists premium_support boolean not null default false,
  add column if not exists is_popular boolean not null default false,
  add column if not exists is_active boolean not null default false,
  add column if not exists is_public boolean not null default true,
  add column if not exists is_official boolean not null default false,
  add column if not exists display_order integer not null default 100,
  add column if not exists badge_text text,
  add column if not exists cta_text text,
  add column if not exists monthly_billing_enabled boolean not null default true,
  add column if not exists annual_billing_enabled boolean not null default true,
  add column if not exists hidden_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists custom_limits jsonb not null default '{}'::jsonb,
  add column if not exists custom_benefits jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_code_check;
alter table public.subscription_plans
  add constraint subscription_plans_code_check
  check (code is null or code in ('starter', 'growth', 'pro', 'scale', 'business', 'free'));

alter table public.subscription_plans
  drop constraint if exists subscription_plans_order_period_check;
alter table public.subscription_plans
  add constraint subscription_plans_order_period_check
  check (order_period is null or order_period in ('day', 'month'));

alter table public.subscription_plans
  drop constraint if exists subscription_plans_canonical_limits_check;
alter table public.subscription_plans
  add constraint subscription_plans_canonical_limits_check check (
    (order_limit is null or order_limit > 0)
    and (workspace_limit is null or workspace_limit > 0)
    and (team_member_limit is null or team_member_limit > 0)
    and (integration_limit is null or integration_limit > 0)
  );

create unique index if not exists subscription_plans_code_uidx
  on public.subscription_plans (code)
  where code is not null;

create index if not exists subscription_plans_public_active_idx
  on public.subscription_plans (is_official, is_active, is_public, archived_at, display_order);

create table if not exists public.workspace_subscription_owners (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  reason text,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_subscription_owners_owner_idx
  on public.workspace_subscription_owners(owner_user_id, workspace_id);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete restrict,
  plan_id uuid references public.subscription_plans(id) on delete restrict,
  billing_cycle text,
  status text not null default 'pending_payment',
  payment_status text not null default 'unpaid',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  timezone text not null default 'Africa/Casablanca',
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  migration_state text not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_billing_cycle_check check (billing_cycle is null or billing_cycle in ('monthly', 'annual')),
  constraint user_subscriptions_status_check check (status in ('pending_payment', 'under_review', 'active', 'grace', 'expired', 'suspended', 'cancelled')),
  constraint user_subscriptions_payment_status_check check (payment_status in ('unpaid', 'submitted', 'reviewing', 'paid', 'rejected', 'waived')),
  constraint user_subscriptions_migration_state_check check (migration_state in ('assigned', 'legacy_access', 'needs_plan_assignment')),
  constraint user_subscriptions_period_check check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions(status, payment_status, current_period_end);

create table if not exists public.subscription_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  order_limit integer,
  order_period text,
  workspace_limit integer,
  team_member_limit integer,
  integration_limit integer,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint subscription_limit_overrides_order_period_check check (order_period is null or order_period in ('day', 'month')),
  constraint subscription_limit_overrides_dates_check check (ends_at is null or ends_at > starts_at),
  constraint subscription_limit_overrides_values_check check (
    (order_limit is null or order_limit > 0)
    and (workspace_limit is null or workspace_limit > 0)
    and (team_member_limit is null or team_member_limit > 0)
    and (integration_limit is null or integration_limit > 0)
  )
);

create table if not exists public.subscription_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  entitlement_key text not null,
  enabled boolean not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint subscription_entitlement_key_check check (entitlement_key in ('mobile_app', 'whatsapp_automation', 'ai_whatsapp_confirmation_agent', 'sawty_os', 'landing_page_os', 'premium_support')),
  constraint subscription_entitlement_dates_check check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  subscription_id uuid not null references public.user_subscriptions(id) on delete restrict,
  request_type text not null,
  current_plan_id uuid references public.subscription_plans(id) on delete restrict,
  requested_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  billing_cycle text not null,
  expected_amount_mad numeric(12,2) not null,
  amount_received_mad numeric(12,2),
  currency text not null default 'MAD',
  payment_method text,
  transaction_reference text,
  proof_path text,
  proof_mime_type text,
  proof_size_bytes bigint,
  status text not null default 'unpaid',
  user_note text,
  admin_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payment_requests_type_check check (request_type in ('initial_activation', 'renewal', 'upgrade', 'downgrade', 'billing_cycle_change')),
  constraint subscription_payment_requests_cycle_check check (billing_cycle in ('monthly', 'annual')),
  constraint subscription_payment_requests_status_check check (status in ('unpaid', 'submitted', 'reviewing', 'paid', 'rejected', 'waived')),
  constraint subscription_payment_requests_amount_check check (expected_amount_mad >= 0 and (amount_received_mad is null or amount_received_mad >= 0)),
  constraint subscription_payment_requests_currency_check check (currency = 'MAD'),
  constraint subscription_payment_requests_proof_check check (proof_size_bytes is null or proof_size_bytes between 1 and 10485760)
);

create index if not exists subscription_payment_requests_queue_idx
  on public.subscription_payment_requests(status, submitted_at, created_at);
create index if not exists subscription_payment_requests_owner_idx
  on public.subscription_payment_requests(owner_user_id, created_at desc);

alter table public.subscription_plans enable row level security;

-- Public read policy: only official, active, public, unarchived plans are visible.
drop policy if exists subscription_plans_official_read on public.subscription_plans;
create policy subscription_plans_official_read
  on public.subscription_plans for select to anon, authenticated
  using (is_official and is_active and coalesce(is_public, true) and archived_at is null);

-- Admin mutation policy: explicit billing.manage permission required.
drop policy if exists subscription_plans_admin_manage on public.subscription_plans;
create policy subscription_plans_admin_manage
  on public.subscription_plans for all to authenticated
  using (public.has_platform_permission('billing.manage'))
  with check (public.has_platform_permission('billing.manage'));

revoke insert, update, delete on public.subscription_plans from anon, authenticated;
revoke select on public.subscription_plans from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;

create or replace function public.list_official_plans_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plan.id,
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
    'display_order', coalesce(plan.display_order, 100)
  ) order by plan.display_order), '[]'::jsonb)
  from public.subscription_plans plan
  where plan.is_official
    and plan.is_active
    and coalesce(plan.is_public, true)
    and plan.archived_at is null;
$$;

revoke all on function public.list_official_plans_v1() from public;
grant execute on function public.list_official_plans_v1() to anon, authenticated, service_role;

commit;
