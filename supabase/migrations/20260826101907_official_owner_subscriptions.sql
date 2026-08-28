begin;

-- Extend the historical plan catalog in place. Legacy columns remain for old
-- invoice history, while every new decision uses the canonical fields below.
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
  add column if not exists is_official boolean not null default false,
  add column if not exists display_order integer not null default 100;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_code_check;
alter table public.subscription_plans
  add constraint subscription_plans_code_check
  check (code is null or code in ('starter', 'growth', 'pro', 'scale'));
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

-- Reconcile matching historical rows first so the old unique name constraint
-- cannot create a second Starter/Pro record.
update public.subscription_plans
set code = 'starter', name = 'Starter', currency = 'MAD', price_cents = 19900,
    monthly_price_mad = 199, annual_price_mad = 1990,
    order_limit = 15, order_period = 'day', workspace_limit = 1,
    team_member_limit = 2, integration_limit = 2,
    mobile_app = false, whatsapp_automation = false,
    ai_whatsapp_confirmation_agent = false, sawty_os = false,
    landing_page_os = false, premium_support = false,
    is_popular = false, is_active = true, is_official = true,
    display_order = 10, updated_at = now()
where lower(name) = 'starter';

update public.subscription_plans
set code = 'growth', name = 'Growth', currency = 'MAD', price_cents = 39900,
    monthly_price_mad = 399, annual_price_mad = 3990,
    order_limit = 5000, order_period = 'month', workspace_limit = 3,
    team_member_limit = 10, integration_limit = null,
    mobile_app = true, whatsapp_automation = true,
    ai_whatsapp_confirmation_agent = true, sawty_os = true,
    landing_page_os = true, premium_support = true,
    is_popular = true, is_active = true, is_official = true,
    display_order = 20, updated_at = now()
where lower(name) = 'growth';

update public.subscription_plans
set code = 'pro', name = 'Pro', currency = 'MAD', price_cents = 79900,
    monthly_price_mad = 799, annual_price_mad = 7990,
    order_limit = 20000, order_period = 'month', workspace_limit = 10,
    team_member_limit = 25, integration_limit = null,
    mobile_app = true, whatsapp_automation = true,
    ai_whatsapp_confirmation_agent = true, sawty_os = true,
    landing_page_os = true, premium_support = true,
    is_popular = false, is_active = true, is_official = true,
    display_order = 30, updated_at = now()
where lower(name) = 'pro';

update public.subscription_plans
set code = 'scale', name = 'Scale', currency = 'MAD', price_cents = 149900,
    monthly_price_mad = 1499, annual_price_mad = 14990,
    order_limit = 50000, order_period = 'month', workspace_limit = null,
    team_member_limit = 50, integration_limit = null,
    mobile_app = true, whatsapp_automation = true,
    ai_whatsapp_confirmation_agent = true, sawty_os = true,
    landing_page_os = true, premium_support = true,
    is_popular = false, is_active = true, is_official = true,
    display_order = 40, updated_at = now()
where lower(name) = 'scale';

insert into public.subscription_plans(
  name, description, orders_limit, products_limit, members_limit,
  storage_limit_gb, integrations_limit, price_cents, currency,
  code, monthly_price_mad, annual_price_mad, order_limit, order_period,
  workspace_limit, team_member_limit, integration_limit,
  mobile_app, whatsapp_automation, ai_whatsapp_confirmation_agent,
  sawty_os, landing_page_os, premium_support,
  is_popular, is_active, is_official, display_order
)
select * from (values
  ('Starter', 'For solo sellers starting Moroccan COD operations.', 15, 1000, 2, 10, 2, 19900, 'MAD', 'starter', 199::numeric, 1990::numeric, 15, 'day', 1, 2, 2, false, false, false, false, false, false, false, true, true, 10),
  ('Growth', 'For growing stores scaling COD volume.', 5000, 1000, 10, 10, 0, 39900, 'MAD', 'growth', 399::numeric, 3990::numeric, 5000, 'month', 3, 10, null, true, true, true, true, true, true, true, true, true, 20),
  ('Pro', 'For established high-volume operations.', 20000, 1000, 25, 10, 0, 79900, 'MAD', 'pro', 799::numeric, 7990::numeric, 20000, 'month', 10, 25, null, true, true, true, true, true, true, false, true, true, 30),
  ('Scale', 'For agencies and multi-brand COD operations.', 50000, 1000, 50, 10, 0, 149900, 'MAD', 'scale', 1499::numeric, 14990::numeric, 50000, 'month', null, 50, null, true, true, true, true, true, true, false, true, true, 40)
) seed(
  name, description, orders_limit, products_limit, members_limit,
  storage_limit_gb, integrations_limit, price_cents, currency,
  code, monthly_price_mad, annual_price_mad, order_limit, order_period,
  workspace_limit, team_member_limit, integration_limit,
  mobile_app, whatsapp_automation, ai_whatsapp_confirmation_agent,
  sawty_os, landing_page_os, premium_support,
  is_popular, is_active, is_official, display_order
)
where not exists (
  select 1 from public.subscription_plans existing where existing.code = seed.code
)
on conflict do nothing;

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
create index if not exists subscription_limit_overrides_active_idx
  on public.subscription_limit_overrides(subscription_id, starts_at, ends_at)
  where revoked_at is null;

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
create index if not exists subscription_entitlement_overrides_active_idx
  on public.subscription_entitlement_overrides(subscription_id, entitlement_key, starts_at, ends_at)
  where revoked_at is null;

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

create table if not exists public.subscription_activity (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  old_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscription_activity_subscription_idx
  on public.subscription_activity(subscription_id, created_at desc);

create table if not exists public.subscription_usage_counters (
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  order_count bigint not null default 0,
  notified_thresholds integer[] not null default '{}'::integer[],
  updated_at timestamptz not null default now(),
  primary key (subscription_id, period_start),
  constraint subscription_usage_counters_period_check check (period_end > period_start and order_count >= 0)
);

create table if not exists public.plan_blocked_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  provider text not null,
  external_id text not null,
  payload_hash text,
  payload_reference text,
  reason text not null,
  received_at timestamptz not null default now(),
  replayed_at timestamptz,
  replay_result text,
  unique (provider, workspace_id, external_id)
);
create index if not exists plan_blocked_ingestion_events_pending_idx
  on public.plan_blocked_ingestion_events(received_at)
  where replayed_at is null;

-- Private payment proofs. Object names must start with the authenticated owner
-- id; request ownership is validated again when the proof is attached.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('subscription-proofs', 'subscription-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.subscription_plans enable row level security;
alter table public.workspace_subscription_owners enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_limit_overrides enable row level security;
alter table public.subscription_entitlement_overrides enable row level security;
alter table public.subscription_payment_requests enable row level security;
alter table public.subscription_activity enable row level security;
alter table public.subscription_usage_counters enable row level security;
alter table public.plan_blocked_ingestion_events enable row level security;

do $$
declare policy_name text;
begin
  for policy_name in select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'subscription_plans'
  loop execute format('drop policy if exists %I on public.subscription_plans', policy_name); end loop;
end
$$;
create policy subscription_plans_official_read
  on public.subscription_plans for select to anon, authenticated
  using (is_official and is_active);

drop policy if exists user_subscriptions_owner_read on public.user_subscriptions;
create policy user_subscriptions_owner_read
  on public.user_subscriptions for select to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists payment_requests_owner_read on public.subscription_payment_requests;
create policy payment_requests_owner_read
  on public.subscription_payment_requests for select to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists subscription_activity_owner_read on public.subscription_activity;
create policy subscription_activity_owner_read
  on public.subscription_activity for select to authenticated
  using (exists (select 1 from public.user_subscriptions subscription where subscription.id = subscription_id and subscription.owner_user_id = (select auth.uid())));

revoke insert, update, delete on public.subscription_plans from anon, authenticated;
revoke insert, update, delete on public.workspace_subscription_owners from anon, authenticated;
revoke insert, update, delete on public.user_subscriptions from anon, authenticated;
revoke insert, update, delete on public.subscription_limit_overrides from anon, authenticated;
revoke insert, update, delete on public.subscription_entitlement_overrides from anon, authenticated;
revoke insert, update, delete on public.subscription_payment_requests from anon, authenticated;
revoke insert, update, delete on public.subscription_activity from anon, authenticated;
revoke insert, update, delete on public.subscription_usage_counters from anon, authenticated;
revoke all on public.plan_blocked_ingestion_events from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant select on public.user_subscriptions to authenticated;
grant select on public.subscription_payment_requests to authenticated;
grant select on public.subscription_activity to authenticated;

drop policy if exists subscription_proofs_owner_insert on storage.objects;
drop policy if exists subscription_proofs_owner_read on storage.objects;
drop policy if exists subscription_proofs_admin_read on storage.objects;
create policy subscription_proofs_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'subscription-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy subscription_proofs_owner_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'subscription-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy subscription_proofs_admin_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'subscription-proofs'
    and (select public.has_platform_permission('billing.read'))
  );

-- Seed legacy subscriptions first because the owner insert has a capacity
-- trigger that requires a subscription record to exist.
insert into public.user_subscriptions(
  owner_user_id, plan_id, billing_cycle, status, payment_status,
  timezone, migration_state
)
select distinct membership.profile_id, null::uuid, null, 'grace', 'unpaid',
  'Africa/Casablanca', 'needs_plan_assignment'
from public.profile_workspaces membership
where membership.status = 'active'
  and (membership.is_owner or lower(coalesce(membership.role, '')) = 'owner')
on conflict (owner_user_id) do nothing;

create temp table _owner_subscription_states on commit drop as
select subscription.id, subscription.status, subscription.grace_until,
       subscription.payment_status
from public.user_subscriptions subscription
join (
  select distinct on (membership.workspace_id)
    membership.workspace_id, membership.profile_id
  from public.profile_workspaces membership
  where membership.status = 'active'
    and (membership.is_owner or lower(coalesce(membership.role, '')) = 'owner')
  order by membership.workspace_id, membership.is_owner desc, membership.created_at asc
) candidate on candidate.profile_id = subscription.owner_user_id
left join public.workspace_subscription_owners owner on owner.workspace_id = candidate.workspace_id
where owner.workspace_id is null
  and not (
    subscription.status = 'active'
    or (subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()))
  );

update public.user_subscriptions subscription
set status = 'grace', grace_until = now() + interval '1 minute', updated_at = now()
where subscription.id in (select id from _owner_subscription_states);

insert into public.workspace_subscription_owners(workspace_id, owner_user_id, reason)
select candidate.workspace_id, candidate.profile_id, 'Existing owner membership migration'
from (
  select distinct on (membership.workspace_id)
    membership.workspace_id,
    membership.profile_id
  from public.profile_workspaces membership
  where membership.status = 'active'
    and (membership.is_owner or lower(coalesce(membership.role, '')) = 'owner')
  order by membership.workspace_id, membership.is_owner desc, membership.created_at asc
) candidate
on conflict (workspace_id) do nothing;

update public.user_subscriptions subscription
set status = states.status,
    grace_until = states.grace_until,
    payment_status = states.payment_status,
    updated_at = now()
from _owner_subscription_states states
where subscription.id = states.id;

-- Existing sellers receive explicit legacy access without pretending they paid
-- for Scale or any other official plan.
insert into public.user_subscriptions(
  owner_user_id, plan_id, billing_cycle, status, payment_status,
  timezone, migration_state
)
select distinct owner.owner_user_id, null::uuid, null, 'grace', 'unpaid',
  'Africa/Casablanca', 'needs_plan_assignment'
from public.workspace_subscription_owners owner
on conflict (owner_user_id) do nothing;

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
      'mobile_app', plan.mobile_app,
      'whatsapp_automation', plan.whatsapp_automation,
      'ai_whatsapp_confirmation_agent', plan.ai_whatsapp_confirmation_agent,
      'sawty_os', plan.sawty_os,
      'landing_page_os', plan.landing_page_os,
      'premium_support', plan.premium_support
    ),
    'is_popular', plan.is_popular,
    'display_order', plan.display_order
  ) order by plan.display_order), '[]'::jsonb)
  from public.subscription_plans plan
  where plan.is_official and plan.is_active;
$$;

create or replace function public.get_effective_subscription_v1(p_owner_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subscription public.user_subscriptions;
  plan public.subscription_plans;
  limit_override public.subscription_limit_overrides;
  local_now timestamp;
  usage_period_start timestamptz;
  usage_period_end timestamptz;
  usage_count bigint := 0;
  order_limit_value integer;
  order_period_value text;
  workspace_limit_value integer;
  team_limit_value integer;
  integration_limit_value integer;
  operational_access boolean;
  access_reason text;
  entitlements jsonb;
begin
  if p_owner_user_id <> (select auth.uid())
     and not public.has_platform_permission('billing.read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SUBSCRIPTION_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into subscription
  from public.user_subscriptions item
  where item.owner_user_id = p_owner_user_id;

  if not found then
    return jsonb_build_object(
      'owner_user_id', p_owner_user_id,
      'subscription_id', null,
      'plan', null,
      'status', 'missing',
      'payment_status', 'unpaid',
      'migration_state', 'needs_plan_assignment',
      'operational_access', false,
      'access_reason', 'subscription_missing',
      'limits', null,
      'entitlements', '{}'::jsonb,
      'usage', '{}'::jsonb
    );
  end if;

  if subscription.plan_id is not null then
    select * into plan from public.subscription_plans item where item.id = subscription.plan_id and item.is_official;
  end if;

  select * into limit_override
  from public.subscription_limit_overrides item
  where item.subscription_id = subscription.id
    and item.revoked_at is null
    and item.starts_at <= now()
    and (item.ends_at is null or item.ends_at > now())
  order by item.created_at desc
  limit 1;

  order_limit_value := coalesce(limit_override.order_limit, plan.order_limit);
  order_period_value := coalesce(limit_override.order_period, plan.order_period);
  workspace_limit_value := coalesce(limit_override.workspace_limit, plan.workspace_limit);
  team_limit_value := coalesce(limit_override.team_member_limit, plan.team_member_limit);
  integration_limit_value := coalesce(limit_override.integration_limit, plan.integration_limit);

  local_now := now() at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  if order_period_value = 'day' then
    usage_period_start := date_trunc('day', local_now) at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
    usage_period_end := (date_trunc('day', local_now) + interval '1 day') at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  else
    usage_period_start := date_trunc('month', local_now) at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
    usage_period_end := (date_trunc('month', local_now) + interval '1 month') at time zone coalesce(subscription.timezone, 'Africa/Casablanca');
  end if;

  select coalesce(counter.order_count, 0) into usage_count
  from public.subscription_usage_counters counter
  where counter.subscription_id = subscription.id and counter.period_start = usage_period_start;
  usage_count := coalesce(usage_count, 0);

  operational_access := subscription.migration_state in ('legacy_access', 'needs_plan_assignment')
    or subscription.status = 'active'
    or (subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()));
  access_reason := case
    when subscription.migration_state in ('legacy_access', 'needs_plan_assignment') then 'legacy_access_needs_plan_assignment'
    when subscription.status = 'active' then 'active_subscription'
    when subscription.status = 'grace' and (subscription.grace_until is null or subscription.grace_until > now()) then 'grace_period'
    else 'subscription_' || subscription.status
  end;

  entitlements := jsonb_build_object(
    'mobile_app', coalesce(plan.mobile_app, false),
    'whatsapp_automation', coalesce(plan.whatsapp_automation, false),
    'ai_whatsapp_confirmation_agent', coalesce(plan.ai_whatsapp_confirmation_agent, false),
    'sawty_os', coalesce(plan.sawty_os, false),
    'landing_page_os', coalesce(plan.landing_page_os, false),
    'premium_support', coalesce(plan.premium_support, false)
  );

  select entitlements || coalesce(jsonb_object_agg(active_override.entitlement_key, active_override.enabled), '{}'::jsonb)
  into entitlements
  from (
    select distinct on (override.entitlement_key)
      override.entitlement_key,
      override.enabled
    from public.subscription_entitlement_overrides override
    where override.subscription_id = subscription.id
      and override.revoked_at is null
      and override.starts_at <= now()
      and (override.ends_at is null or override.ends_at > now())
    order by override.entitlement_key, override.created_at desc
  ) active_override;

  return jsonb_build_object(
    'owner_user_id', subscription.owner_user_id,
    'subscription_id', subscription.id,
    'plan', case when plan.id is null then null else jsonb_build_object('id', plan.id, 'code', plan.code, 'name', plan.name) end,
    'billing_cycle', subscription.billing_cycle,
    'status', subscription.status,
    'payment_status', subscription.payment_status,
    'migration_state', subscription.migration_state,
    'current_period_start', subscription.current_period_start,
    'current_period_end', subscription.current_period_end,
    'grace_until', subscription.grace_until,
    'timezone', subscription.timezone,
    'operational_access', operational_access,
    'access_reason', access_reason,
    'limits', jsonb_build_object(
      'orders', order_limit_value,
      'order_period', order_period_value,
      'workspaces', workspace_limit_value,
      'team_members', team_limit_value,
      'integrations', integration_limit_value
    ),
    'entitlements', entitlements,
    'usage', jsonb_build_object(
      'period_start', usage_period_start,
      'period_end', usage_period_end,
      'orders', usage_count,
      'orders_remaining', case when order_limit_value is null then null else greatest(order_limit_value - usage_count, 0) end,
      'orders_percent', case when order_limit_value is null or order_limit_value = 0 then null else round(usage_count::numeric / order_limit_value * 100, 2) end,
      'workspaces', (select count(*) from public.workspace_subscription_owners owner where owner.owner_user_id = subscription.owner_user_id),
      'team_members', (select count(distinct membership.profile_id) from public.workspace_subscription_owners owner join public.profile_workspaces membership on membership.workspace_id = owner.workspace_id and membership.status = 'active' where owner.owner_user_id = subscription.owner_user_id),
      'integrations', (select count(*) from public.workspace_subscription_owners owner join public.integrations integration on integration.workspace_id = owner.workspace_id where owner.owner_user_id = subscription.owner_user_id)
    ),
    'active_limit_override_id', limit_override.id
  );
end;
$$;

create or replace function public.get_workspace_subscription_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if not public.is_active_workspace_member(p_workspace_id)
     and not public.has_platform_permission('billing.read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'WORKSPACE_SUBSCRIPTION_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;
  if owner_id is null then
    return jsonb_build_object('workspace_id', p_workspace_id, 'owner_user_id', null, 'operational_access', false, 'access_reason', 'workspace_billing_owner_missing');
  end if;
  return jsonb_build_object('workspace_id', p_workspace_id, 'owner_user_id', owner_id, 'effective_subscription', public.get_effective_subscription_v1(owner_id));
end;
$$;

create or replace function public.resolve_workspace_access_v1(p_user_id uuid, p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare owner_id uuid;
declare effective jsonb;
declare member_access boolean;
begin
  if p_user_id <> (select auth.uid())
     and not public.has_platform_permission('support.impersonate_read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'WORKSPACE_ACCESS_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id = p_user_id and membership.workspace_id = p_workspace_id and membership.status = 'active'
  ) into member_access;
  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;
  if not member_access then return jsonb_build_object('allowed', false, 'reason', 'not_active_workspace_member'); end if;
  if owner_id is null then return jsonb_build_object('allowed', false, 'reason', 'workspace_billing_owner_missing'); end if;
  effective := public.get_effective_subscription_v1(owner_id);
  return jsonb_build_object(
    'allowed', coalesce((effective ->> 'operational_access')::boolean, false),
    'reason', effective ->> 'access_reason',
    'workspace_id', p_workspace_id,
    'workspace_owner_id', owner_id,
    'subscription', effective
  );
end;
$$;

create or replace function public.has_workspace_entitlement_v1(p_workspace_id uuid, p_entitlement_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result := public.get_workspace_subscription_v1(p_workspace_id);
  return coalesce((result #>> array['effective_subscription', 'operational_access'])::boolean, false)
    and coalesce((result #>> array['effective_subscription', 'entitlements', p_entitlement_key])::boolean, false);
end;
$$;

create or replace function public.check_order_capacity_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare effective jsonb;
declare order_limit_value bigint;
declare used_value bigint;
begin
  result := public.get_workspace_subscription_v1(p_workspace_id);
  effective := result -> 'effective_subscription';
  if not coalesce((effective ->> 'operational_access')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', effective ->> 'access_reason', 'effective_subscription', effective);
  end if;
  order_limit_value := (effective #>> array['limits', 'orders'])::bigint;
  used_value := coalesce((effective #>> array['usage', 'orders'])::bigint, 0);
  return jsonb_build_object(
    'allowed', order_limit_value is null or used_value < order_limit_value,
    'reason', case when order_limit_value is null or used_value < order_limit_value then 'capacity_available' else 'order_limit_reached' end,
    'limit', order_limit_value,
    'used', used_value,
    'remaining', case when order_limit_value is null then null else greatest(order_limit_value - used_value, 0) end,
    'period_start', effective #>> array['usage', 'period_start'],
    'period_end', effective #>> array['usage', 'period_end']
  );
end;
$$;

create or replace function public.consume_order_capacity_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
declare effective jsonb;
declare subscription_id uuid;
declare order_limit_value bigint;
declare period_start_value timestamptz;
declare period_end_value timestamptz;
declare new_count bigint;
begin
  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;
  if owner_id is null then raise exception 'WORKSPACE_BILLING_OWNER_MISSING' using errcode = '42501'; end if;
  effective := public.get_effective_subscription_v1(owner_id);
  if not coalesce((effective ->> 'operational_access')::boolean, false) then
    raise exception 'SUBSCRIPTION_OPERATIONAL_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  subscription_id := (effective ->> 'subscription_id')::uuid;
  order_limit_value := (effective #>> array['limits', 'orders'])::bigint;
  period_start_value := (effective #>> array['usage', 'period_start'])::timestamptz;
  period_end_value := (effective #>> array['usage', 'period_end'])::timestamptz;
  if order_limit_value is null then
    return jsonb_build_object('allowed', true, 'unlimited', true, 'subscription_id', subscription_id);
  end if;
  insert into public.subscription_usage_counters(subscription_id, period_start, period_end, order_count)
  values (subscription_id, period_start_value, period_end_value, 0)
  on conflict (subscription_id, period_start) do nothing;
  update public.subscription_usage_counters counter
  set order_count = counter.order_count + 1, updated_at = now()
  where counter.subscription_id = subscription_id
    and counter.period_start = period_start_value
    and counter.order_count < order_limit_value
  returning counter.order_count into new_count;
  if new_count is null then raise exception 'ORDER_CAPACITY_REACHED' using errcode = 'P0001'; end if;
  return jsonb_build_object('allowed', true, 'subscription_id', subscription_id, 'used', new_count, 'limit', order_limit_value, 'remaining', greatest(order_limit_value - new_count, 0), 'period_start', period_start_value, 'period_end', period_end_value);
end;
$$;

create or replace function public.create_subscription_payment_request_v1(
  p_plan_code text,
  p_billing_cycle text,
  p_request_type text default 'initial_activation',
  p_payment_method text default null,
  p_transaction_reference text default null,
  p_user_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.subscription_plans;
declare subscription public.user_subscriptions;
declare payment public.subscription_payment_requests;
declare expected_amount numeric(12,2);
declare normalized_cycle text := lower(trim(coalesce(p_billing_cycle, '')));
declare normalized_type text := lower(trim(coalesce(p_request_type, '')));
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  if normalized_cycle not in ('monthly', 'annual') then raise exception 'INVALID_BILLING_CYCLE' using errcode = '22023'; end if;
  if normalized_type not in ('initial_activation', 'renewal', 'upgrade', 'downgrade', 'billing_cycle_change') then raise exception 'INVALID_PAYMENT_REQUEST_TYPE' using errcode = '22023'; end if;
  select * into plan from public.subscription_plans item where item.code = lower(trim(p_plan_code)) and item.is_official and item.is_active;
  if not found then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  expected_amount := case when normalized_cycle = 'annual' then plan.annual_price_mad else plan.monthly_price_mad end;
  insert into public.user_subscriptions(owner_user_id, status, payment_status, migration_state)
  values ((select auth.uid()), 'pending_payment', 'unpaid', 'assigned')
  on conflict (owner_user_id) do nothing;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = (select auth.uid()) for update;
  if exists (
    select 1 from public.subscription_payment_requests existing
    where existing.subscription_id = subscription.id and existing.status in ('unpaid', 'submitted', 'reviewing')
  ) then raise exception 'PAYMENT_REQUEST_ALREADY_UNDER_REVIEW' using errcode = '23505'; end if;
  insert into public.subscription_payment_requests(
    reference, owner_user_id, subscription_id, request_type, current_plan_id,
    requested_plan_id, billing_cycle, expected_amount_mad, currency,
    payment_method, transaction_reference, status, user_note
  ) values (
    'ECOM-' || to_char(now() at time zone 'Africa/Casablanca', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    (select auth.uid()), subscription.id, normalized_type, subscription.plan_id,
    plan.id, normalized_cycle, expected_amount, 'MAD',
    nullif(trim(coalesce(p_payment_method, '')), ''),
    nullif(trim(coalesce(p_transaction_reference, '')), ''),
    'unpaid', nullif(trim(coalesce(p_user_note, '')), '')
  ) returning * into payment;
  update public.user_subscriptions set status = 'pending_payment', payment_status = 'unpaid', updated_at = now() where id = subscription.id;
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_created', jsonb_build_object('payment_request_id', payment.id, 'requested_plan', plan.code, 'billing_cycle', normalized_cycle, 'expected_amount_mad', expected_amount));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'requested_plan', plan.code, 'billing_cycle', payment.billing_cycle, 'expected_amount_mad', payment.expected_amount_mad, 'currency', payment.currency, 'status', payment.status);
end;
$$;

create or replace function public.attach_subscription_payment_proof_v1(
  p_request_id uuid,
  p_proof_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare payment public.subscription_payment_requests;
begin
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') or p_size_bytes not between 1 and 10485760 then
    raise exception 'INVALID_PAYMENT_PROOF' using errcode = '22023';
  end if;
  if not starts_with(p_proof_path, (select auth.uid())::text || '/') then raise exception 'INVALID_PAYMENT_PROOF_PATH' using errcode = '42501'; end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'subscription-proofs'
      and object.name = p_proof_path
      and (storage.foldername(object.name))[1] = (select auth.uid())::text
  ) then raise exception 'PAYMENT_PROOF_OBJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.subscription_payment_requests request
  set proof_path = p_proof_path, proof_mime_type = p_mime_type, proof_size_bytes = p_size_bytes,
      status = 'submitted', submitted_at = now(), updated_at = now()
  where request.id = p_request_id and request.owner_user_id = (select auth.uid()) and request.status in ('unpaid', 'rejected')
  returning * into payment;
  if not found then raise exception 'PAYMENT_REQUEST_NOT_ATTACHABLE' using errcode = '42501'; end if;
  update public.user_subscriptions set status = 'under_review', payment_status = 'submitted', updated_at = now() where id = payment.subscription_id;
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (payment.subscription_id, (select auth.uid()), 'payment_proof_submitted', jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'submitted_at', payment.submitted_at);
end;
$$;

create or replace function public.platform_list_payment_requests_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default null,
  p_request_type text default null,
  p_query text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare current_page integer := greatest(coalesce(p_page, 1), 1);
declare size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_platform_permission('billing.read') then raise exception 'BILLING_READ_REQUIRED' using errcode = '42501'; end if;
  with filtered as (
    select request.*, profile.full_name, coalesce(auth_user.email, profile.email) as owner_email,
      current_plan.code as current_plan_code, requested_plan.code as requested_plan_code,
      reviewer.email as reviewer_email
    from public.subscription_payment_requests request
    join public.profiles profile on profile.id = request.owner_user_id
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.subscription_plans current_plan on current_plan.id = request.current_plan_id
    join public.subscription_plans requested_plan on requested_plan.id = request.requested_plan_id
    left join auth.users reviewer on reviewer.id = request.reviewer_id
    where (p_status is null or trim(p_status) = '' or request.status = lower(trim(p_status)))
      and (p_request_type is null or trim(p_request_type) = '' or request.request_type = lower(trim(p_request_type)))
      and (p_query is null or trim(p_query) = '' or request.reference ilike '%' || trim(p_query) || '%' or coalesce(profile.full_name, '') ilike '%' || trim(p_query) || '%' or coalesce(auth_user.email, profile.email, '') ilike '%' || trim(p_query) || '%')
  ), paged as (
    select * from filtered order by submitted_at desc nulls last, created_at desc limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'reference', item.reference, 'owner_user_id', item.owner_user_id,
      'seller_name', item.full_name, 'seller_email', item.owner_email,
      'current_plan', item.current_plan_code, 'requested_plan', item.requested_plan_code,
      'request_type', item.request_type, 'billing_cycle', item.billing_cycle,
      'expected_amount_mad', item.expected_amount_mad, 'amount_received_mad', item.amount_received_mad,
      'currency', item.currency, 'payment_method', item.payment_method,
      'transaction_reference', item.transaction_reference, 'proof_path', item.proof_path,
      'proof_mime_type', item.proof_mime_type, 'proof_size_bytes', item.proof_size_bytes,
      'status', item.status, 'user_note', item.user_note, 'admin_note', item.admin_note,
      'submitted_at', item.submitted_at, 'reviewed_at', item.reviewed_at,
      'reviewer_email', item.reviewer_email, 'created_at', item.created_at
    ) order by item.submitted_at desc nulls last, item.created_at desc) from paged item), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', current_page, 'page_size', size_value
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_review_payment_request_v1(
  p_request_id uuid,
  p_decision text,
  p_amount_received_mad numeric default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare payment public.subscription_payment_requests;
declare subscription public.user_subscriptions;
declare old_state jsonb;
declare normalized_decision text := lower(trim(coalesce(p_decision, '')));
declare new_payment_status text;
declare period_start_value timestamptz;
declare period_end_value timestamptz;
begin
  if not public.has_platform_permission('billing.approve') then raise exception 'BILLING_APPROVE_REQUIRED' using errcode = '42501'; end if;
  if normalized_decision not in ('approve', 'reject', 'waive') then raise exception 'INVALID_PAYMENT_DECISION' using errcode = '22023'; end if;
  select * into payment from public.subscription_payment_requests request where request.id = p_request_id for update;
  if not found then raise exception 'PAYMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment.status in ('paid', 'waived') and normalized_decision in ('approve', 'waive') then
    return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'idempotent', true);
  end if;
  if payment.status = 'rejected' and normalized_decision = 'reject' then
    return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'idempotent', true);
  end if;
  if payment.status not in ('submitted', 'reviewing') then raise exception 'PAYMENT_REQUEST_NOT_REVIEWABLE' using errcode = '42501'; end if;
  select * into subscription from public.user_subscriptions item where item.id = payment.subscription_id for update;
  old_state := to_jsonb(subscription);
  if normalized_decision = 'reject' then
    update public.subscription_payment_requests set status = 'rejected', amount_received_mad = p_amount_received_mad, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''), reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now() where id = payment.id returning * into payment;
    update public.user_subscriptions set status = 'pending_payment', payment_status = 'rejected', updated_at = now() where id = subscription.id returning * into subscription;
    new_payment_status := 'rejected';
  else
    if normalized_decision = 'approve' and coalesce(p_amount_received_mad, payment.expected_amount_mad) < payment.expected_amount_mad then raise exception 'AMOUNT_RECEIVED_BELOW_EXPECTED' using errcode = '22023'; end if;
    if payment.request_type = 'renewal' and subscription.current_period_end is not null and subscription.current_period_end > now() then
      period_start_value := coalesce(subscription.current_period_start, now());
      period_end_value := case when payment.billing_cycle = 'annual' then subscription.current_period_end + interval '1 year' else subscription.current_period_end + interval '1 month' end;
    else
      period_start_value := now();
      period_end_value := case when payment.billing_cycle = 'annual' then period_start_value + interval '1 year' else period_start_value + interval '1 month' end;
    end if;
    new_payment_status := case when normalized_decision = 'waive' then 'waived' else 'paid' end;
    update public.subscription_payment_requests set status = new_payment_status, amount_received_mad = case when normalized_decision = 'waive' then 0 else coalesce(p_amount_received_mad, expected_amount_mad) end, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''), reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now() where id = payment.id returning * into payment;
    update public.user_subscriptions set plan_id = payment.requested_plan_id, billing_cycle = payment.billing_cycle, status = 'active', payment_status = new_payment_status, current_period_start = period_start_value, current_period_end = period_end_value, grace_until = null, activated_at = coalesce(activated_at, now()), activated_by = (select auth.uid()), migration_state = 'assigned', updated_at = now() where id = subscription.id returning * into subscription;
  end if;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_' || new_payment_status, old_state, to_jsonb(subscription), jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference, 'decision', normalized_decision, 'admin_note', p_admin_note));
  perform public.record_platform_audit('payment_request_' || new_payment_status, 'subscription_payment_request', payment.id, payment.reference, jsonb_build_object('subscription_id', subscription.id, 'owner_user_id', subscription.owner_user_id, 'requested_plan_id', payment.requested_plan_id, 'billing_cycle', payment.billing_cycle, 'amount_received_mad', payment.amount_received_mad));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'subscription_id', subscription.id, 'subscription_status', subscription.status, 'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'idempotent', false);
end;
$$;

create or replace function public.platform_list_subscriptions_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_status text default null,
  p_plan_code text default null,
  p_migration_state text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
declare current_page integer := greatest(coalesce(p_page, 1), 1);
declare size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if not public.has_platform_permission('billing.read') then raise exception 'BILLING_READ_REQUIRED' using errcode = '42501'; end if;
  with filtered as (
    select subscription.*, profile.full_name, coalesce(auth_user.email, profile.email) as owner_email,
      plan.code as plan_code, plan.name as plan_name,
      (select count(*) from public.workspace_subscription_owners owner where owner.owner_user_id = subscription.owner_user_id) as workspace_count
    from public.user_subscriptions subscription
    join public.profiles profile on profile.id = subscription.owner_user_id
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    where (p_query is null or trim(p_query) = '' or coalesce(profile.full_name, '') ilike '%' || trim(p_query) || '%' or coalesce(auth_user.email, profile.email, '') ilike '%' || trim(p_query) || '%')
      and (p_status is null or trim(p_status) = '' or subscription.status = lower(trim(p_status)))
      and (p_plan_code is null or trim(p_plan_code) = '' or plan.code = lower(trim(p_plan_code)))
      and (p_migration_state is null or trim(p_migration_state) = '' or subscription.migration_state = lower(trim(p_migration_state)))
  ), paged as (
    select * from filtered order by updated_at desc, created_at desc limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'owner_user_id', item.owner_user_id,
      'seller_name', item.full_name, 'seller_email', item.owner_email,
      'plan_code', item.plan_code, 'plan_name', item.plan_name,
      'billing_cycle', item.billing_cycle, 'status', item.status,
      'payment_status', item.payment_status,
      'current_period_start', item.current_period_start,
      'current_period_end', item.current_period_end,
      'grace_until', item.grace_until, 'timezone', item.timezone,
      'migration_state', item.migration_state,
      'workspace_count', item.workspace_count,
      'effective', public.get_effective_subscription_v1(item.owner_user_id),
      'created_at', item.created_at, 'updated_at', item.updated_at
    ) order by item.updated_at desc) from paged item), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', current_page, 'page_size', size_value
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_assign_subscription_v1(
  p_owner_user_id uuid,
  p_plan_code text,
  p_billing_cycle text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan public.subscription_plans;
declare subscription public.user_subscriptions;
declare old_state jsonb := '{}'::jsonb;
declare normalized_cycle text := lower(trim(coalesce(p_billing_cycle, '')));
begin
  if not public.has_platform_permission('billing.manage') then raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501'; end if;
  if normalized_cycle not in ('monthly', 'annual') then raise exception 'INVALID_BILLING_CYCLE' using errcode = '22023'; end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then raise exception 'INVALID_SUBSCRIPTION_PERIOD' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'SUBSCRIPTION_ASSIGNMENT_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into plan from public.subscription_plans item where item.code = lower(trim(p_plan_code)) and item.is_official and item.is_active;
  if not found then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = p_owner_user_id for update;
  if found then old_state := to_jsonb(subscription); end if;
  insert into public.user_subscriptions(
    owner_user_id, plan_id, billing_cycle, status, payment_status,
    current_period_start, current_period_end, grace_until,
    activated_at, activated_by, migration_state, updated_at
  ) values (
    p_owner_user_id, plan.id, normalized_cycle, 'active', 'waived',
    p_period_start, p_period_end, null, now(), (select auth.uid()), 'assigned', now()
  ) on conflict (owner_user_id) do update
  set plan_id = excluded.plan_id, billing_cycle = excluded.billing_cycle,
      status = 'active', payment_status = 'waived',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_until = null, activated_at = coalesce(user_subscriptions.activated_at, now()),
      activated_by = (select auth.uid()), migration_state = 'assigned', updated_at = now()
  returning * into subscription;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'manual_subscription_assigned', old_state, to_jsonb(subscription), jsonb_build_object('plan_code', plan.code, 'billing_cycle', normalized_cycle, 'reason', trim(p_reason)));
  perform public.record_platform_audit('manual_subscription_assigned', 'user_subscription', subscription.id, plan.code, jsonb_build_object('owner_user_id', p_owner_user_id, 'billing_cycle', normalized_cycle, 'period_start', p_period_start, 'period_end', p_period_end, 'reason', trim(p_reason)));
  return public.get_effective_subscription_v1(p_owner_user_id);
end;
$$;

create or replace function public.platform_grant_subscription_grace_v1(
  p_owner_user_id uuid,
  p_grace_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare subscription public.user_subscriptions;
declare old_state jsonb;
begin
  if not public.has_platform_permission('billing.manage') then raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501'; end if;
  if p_grace_until is null or p_grace_until <= now() or p_grace_until > now() + interval '2 months' then raise exception 'INVALID_GRACE_EXPIRY' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then raise exception 'GRACE_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into subscription from public.user_subscriptions item where item.owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0002'; end if;
  old_state := to_jsonb(subscription);
  update public.user_subscriptions set status = 'grace', grace_until = p_grace_until, updated_at = now() where id = subscription.id returning * into subscription;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'subscription_grace_granted', old_state, to_jsonb(subscription), jsonb_build_object('grace_until', p_grace_until, 'reason', trim(p_reason)));
  perform public.record_platform_audit('subscription_grace_granted', 'user_subscription', subscription.id, null, jsonb_build_object('owner_user_id', p_owner_user_id, 'grace_until', p_grace_until, 'reason', trim(p_reason)));
  return public.get_effective_subscription_v1(p_owner_user_id);
end;
$$;

create or replace function public.platform_billing_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_platform_permission('billing.read') then
    raise exception 'BILLING_READ_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'active_count', count(*) filter (where subscription.status = 'active'),
    'pending_payment_count', count(*) filter (where subscription.status = 'pending_payment'),
    'under_review_count', count(*) filter (where subscription.status = 'under_review'),
    'grace_count', count(*) filter (where subscription.status = 'grace'),
    'expiring_count', count(*) filter (
      where subscription.current_period_end >= now()
        and subscription.current_period_end < now() + interval '7 days'
        and subscription.status in ('active', 'grace')
    ),
    'expired_count', count(*) filter (where subscription.status = 'expired'),
    'suspended_count', count(*) filter (where subscription.status = 'suspended'),
    'unassigned_count', count(*) filter (where subscription.plan_id is null),
    'monthly_recurring_revenue_mad', coalesce(sum(
      case
        when subscription.status = 'active' and subscription.billing_cycle = 'monthly' then plan.monthly_price_mad
        when subscription.status = 'active' and subscription.billing_cycle = 'annual' then round(plan.annual_price_mad / 12, 2)
        else 0
      end
    ), 0),
    'annualized_recurring_revenue_mad', coalesce(sum(
      case
        when subscription.status = 'active' and subscription.billing_cycle = 'monthly' then plan.monthly_price_mad * 12
        when subscription.status = 'active' and subscription.billing_cycle = 'annual' then plan.annual_price_mad
        else 0
      end
    ), 0),
    'payments_awaiting_review', (
      select count(*) from public.subscription_payment_requests request
      where request.status in ('submitted', 'reviewing')
    ),
    'official_subscriptions', true,
    'payments', true
  ) into result
  from public.user_subscriptions subscription
  left join public.subscription_plans plan on plan.id = subscription.plan_id;

  return result;
end;
$$;

revoke all on function public.list_official_plans_v1() from public;
grant execute on function public.list_official_plans_v1() to anon, authenticated, service_role;
revoke all on function public.get_effective_subscription_v1(uuid) from public, anon;
revoke all on function public.get_workspace_subscription_v1(uuid) from public, anon;
revoke all on function public.resolve_workspace_access_v1(uuid, uuid) from public, anon;
revoke all on function public.has_workspace_entitlement_v1(uuid, text) from public, anon;
revoke all on function public.check_order_capacity_v1(uuid) from public, anon;
revoke all on function public.consume_order_capacity_v1(uuid) from public, anon, authenticated;
revoke all on function public.create_subscription_payment_request_v1(text, text, text, text, text, text) from public, anon;
revoke all on function public.attach_subscription_payment_proof_v1(uuid, text, text, bigint) from public, anon;
revoke all on function public.platform_list_payment_requests_v1(integer, integer, text, text, text) from public, anon;
revoke all on function public.platform_review_payment_request_v1(uuid, text, numeric, text) from public, anon;
revoke all on function public.platform_list_subscriptions_v1(integer, integer, text, text, text, text) from public, anon;
revoke all on function public.platform_assign_subscription_v1(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.platform_grant_subscription_grace_v1(uuid, timestamptz, text) from public, anon;
revoke all on function public.platform_billing_summary_v1() from public, anon;

grant execute on function public.get_effective_subscription_v1(uuid) to authenticated, service_role;
grant execute on function public.get_workspace_subscription_v1(uuid) to authenticated, service_role;
grant execute on function public.resolve_workspace_access_v1(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_workspace_entitlement_v1(uuid, text) to authenticated, service_role;
grant execute on function public.check_order_capacity_v1(uuid) to authenticated, service_role;
grant execute on function public.consume_order_capacity_v1(uuid) to service_role;
grant execute on function public.create_subscription_payment_request_v1(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.attach_subscription_payment_proof_v1(uuid, text, text, bigint) to authenticated, service_role;
grant execute on function public.platform_list_payment_requests_v1(integer, integer, text, text, text) to authenticated, service_role;
grant execute on function public.platform_review_payment_request_v1(uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.platform_list_subscriptions_v1(integer, integer, text, text, text, text) to authenticated, service_role;
grant execute on function public.platform_assign_subscription_v1(uuid, text, text, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.platform_grant_subscription_grace_v1(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.platform_billing_summary_v1() to authenticated, service_role;

commit;
