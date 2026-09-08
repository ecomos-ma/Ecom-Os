begin;

-- ============================================================
-- 1. Add conversion_rate column to subscription_payment_requests
--    (already has original_amount_mad / paypal_amount / paypal_currency
--     from the earlier migration, this is purely additive)
-- ============================================================
alter table public.subscription_payment_requests
  add column if not exists conversion_rate numeric(18, 6);

-- ============================================================
-- 2. Webhook event deduplication
--    Stores every processed PayPal event_id so we never handle
--    the same event twice (idempotency).
-- ============================================================
create table if not exists public.paypal_webhook_events (
  id              bigint generated always as identity primary key,
  event_id        text not null unique,
  event_type      text not null,
  processed_at    timestamptz not null default now(),
  payload_digest  text,          -- sha256 of the raw body (for audit, never raw payload)
  result          text           -- 'ok' | 'skipped' | 'error:...'
);

comment on table public.paypal_webhook_events is
  'Idempotency log for processed PayPal webhook events. '
  'Contains NO sensitive payment data – only event IDs and types.';

-- RLS: only service_role can write; no authenticated reads needed for users
alter table public.paypal_webhook_events enable row level security;

-- ============================================================
-- 3. Configurable MAD→USD FX rate in a dedicated KV config table
--    The old `platform_settings` is a single-row fixed-column table
--    and cannot store arbitrary billing constants.
--    We create a minimal `paypal_billing_config` KV table instead.
-- ============================================================
create table if not exists public.paypal_billing_config (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Default MAD → USD rate: 0.10  (100 MAD = 10 USD)
-- This is NOT a live FX feed. Update it manually when the rate changes:
--   UPDATE public.paypal_billing_config SET value = '0.11' WHERE key = 'mad_to_usd_rate';
insert into public.paypal_billing_config (key, value, description)
values (
  'mad_to_usd_rate',
  '0.10',
  'Conversion rate: MAD → USD for PayPal billing plans. '  
  'Example: 0.10 = 100 MAD → 10 USD. Update manually; this is NOT a live FX feed.'
)
on conflict (key) do nothing;

-- ============================================================
-- 4. Store the PayPal currency + conversion_rate per plan
--    so we can verify them later without recomputing
-- ============================================================
alter table public.subscription_plans
  add column if not exists paypal_currency       text default 'USD',
  add column if not exists paypal_conversion_rate numeric(18, 6);

-- ============================================================
-- 5. Update activate_paypal_subscription_v1 to accept
--    conversion_rate and persist it
-- ============================================================
create or replace function public.activate_paypal_subscription_v1(
  p_paypal_subscription_id  text,
  p_paypal_transaction_id   text,
  p_user_id                 uuid,
  p_plan_id                 uuid,
  p_billing_cycle           text,
  p_original_amount_mad     numeric,
  p_paypal_amount           numeric,
  p_paypal_currency         text,
  p_conversion_rate         numeric,
  p_starts_at               timestamptz,
  p_expires_at              timestamptz,
  p_payment_status          text default 'paid'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
  inserted_request      public.subscription_payment_requests;
  reference_val         text;
begin
  -- Service-role only
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  -- Guard: do not activate if already linked to a PayPal sub
  if exists (
    select 1 from public.user_subscriptions
    where owner_user_id = p_user_id
      and paypal_subscription_id = p_paypal_subscription_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'already_activated');
  end if;

  reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));

  -- Record in payment history (NOT in admin approval queue — status = 'paid')
  insert into public.subscription_payment_requests (
    reference, owner_user_id, subscription_id, request_type,
    current_plan_id, requested_plan_id, billing_cycle,
    expected_amount_mad, amount_received_mad, currency,
    payment_method, transaction_reference,
    paypal_subscription_id, original_amount_mad,
    paypal_amount, paypal_currency, conversion_rate,
    status, submitted_at, reviewed_at
  )
  select
    reference_val,
    p_user_id,
    sub.id,
    case when sub.plan_id = p_plan_id then 'renewal' else 'initial_activation' end,
    sub.plan_id,
    p_plan_id,
    p_billing_cycle,
    p_original_amount_mad,
    p_original_amount_mad,
    'MAD',
    'paypal',
    p_paypal_transaction_id,
    p_paypal_subscription_id,
    p_original_amount_mad,
    p_paypal_amount,
    p_paypal_currency,
    p_conversion_rate,
    p_payment_status,     -- 'paid' → bypasses admin queue
    p_starts_at,
    p_starts_at
  from public.user_subscriptions sub
  where sub.owner_user_id = p_user_id
  returning * into inserted_request;

  -- Activate subscription (single source of truth = user_subscriptions)
  update public.user_subscriptions
  set   status               = 'active',
        payment_status       = p_payment_status,
        plan_id              = p_plan_id,
        billing_cycle        = p_billing_cycle,
        paypal_subscription_id = p_paypal_subscription_id,
        paypal_transaction_id  = p_paypal_transaction_id,
        current_period_start = p_starts_at,
        current_period_end   = p_expires_at,
        grace_until          = null,
        migration_state      = 'assigned',
        updated_at           = now()
  where owner_user_id = p_user_id
  returning * into existing_subscription;

  if found then
    insert into public.subscription_activity (
      subscription_id, actor_id, action, new_state, metadata
    ) values (
      existing_subscription.id,
      null,
      'paypal_subscription_activated',
      to_jsonb(existing_subscription),
      jsonb_build_object(
        'paypal_subscription_id', p_paypal_subscription_id,
        'payment_request_id',     inserted_request.id,
        'paypal_currency',        p_paypal_currency,
        'conversion_rate',        p_conversion_rate
      )
    );
  end if;

  return jsonb_build_object(
    'success',             true,
    'subscription_id',     existing_subscription.id,
    'payment_request_id',  inserted_request.id
  );
end;
$$;

-- ============================================================
-- 6. Update renewal RPC to persist conversion_rate too
--    Drop the old 5-arg overload first to avoid overload ambiguity.
-- ============================================================
drop function if exists public.update_paypal_subscription_renewal_v1(
  text, text, timestamptz, numeric, text
);

create or replace function public.update_paypal_subscription_renewal_v1(
  p_paypal_subscription_id text,
  p_paypal_transaction_id  text,
  p_expires_at             timestamptz,
  p_paypal_amount          numeric,
  p_paypal_currency        text,
  p_conversion_rate        numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
  inserted_request      public.subscription_payment_requests;
  reference_val         text;
  mad_amount            numeric;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select * into existing_subscription
  from public.user_subscriptions
  where paypal_subscription_id = p_paypal_subscription_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  -- Deduplication: if this transaction was already recorded, skip
  if exists (
    select 1 from public.subscription_payment_requests
    where transaction_reference = p_paypal_transaction_id
      and payment_method = 'paypal'
  ) then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  -- Reverse-calculate MAD amount for display
  mad_amount := case
    when p_conversion_rate is not null and p_conversion_rate > 0
      then round(p_paypal_amount / p_conversion_rate, 2)
    else 0
  end;

  reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));

  insert into public.subscription_payment_requests (
    reference, owner_user_id, subscription_id, request_type,
    requested_plan_id, billing_cycle,
    expected_amount_mad, amount_received_mad, currency,
    payment_method, transaction_reference,
    paypal_subscription_id, paypal_amount, paypal_currency,
    original_amount_mad, conversion_rate,
    status, submitted_at, reviewed_at
  ) values (
    reference_val,
    existing_subscription.owner_user_id,
    existing_subscription.id,
    'renewal',
    existing_subscription.plan_id,
    coalesce(existing_subscription.billing_cycle, 'monthly'),
    mad_amount,
    mad_amount,
    'MAD',
    'paypal',
    p_paypal_transaction_id,
    p_paypal_subscription_id,
    p_paypal_amount,
    p_paypal_currency,
    mad_amount,
    p_conversion_rate,
    'paid',      -- auto-approved, not in admin queue
    now(),
    now()
  ) returning * into inserted_request;

  -- Extend period; keep status active
  update public.user_subscriptions
  set   current_period_end = p_expires_at,
        status             = 'active',
        payment_status     = 'paid',
        updated_at         = now()
  where paypal_subscription_id = p_paypal_subscription_id
  returning * into existing_subscription;

  insert into public.subscription_activity (
    subscription_id, actor_id, action, new_state, metadata
  ) values (
    existing_subscription.id,
    null,
    'paypal_subscription_renewed',
    to_jsonb(existing_subscription),
    jsonb_build_object(
      'paypal_subscription_id', p_paypal_subscription_id,
      'payment_request_id',     inserted_request.id,
      'paypal_currency',        p_paypal_currency,
      'conversion_rate',        p_conversion_rate
    )
  );

  return jsonb_build_object('success', true, 'subscription_id', existing_subscription.id);
end;
$$;

-- ============================================================
-- 7. Mark failed renewal (suspension behaviour)
--    Does NOT cancel or delete — keeps current_period_end intact
--    so the user retains access until their paid period expires.
-- ============================================================
create or replace function public.handle_paypal_payment_failure_v1(
  p_paypal_subscription_id text,
  p_reason                 text default 'payment_failed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.user_subscriptions;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select * into sub
  from public.user_subscriptions
  where paypal_subscription_id = p_paypal_subscription_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  -- Only change payment_status → 'failed'. Do NOT touch status or period_end.
  -- Ecom OS expiry enforcement will kick in naturally when period_end passes.
  update public.user_subscriptions
  set   payment_status = 'failed',
        updated_at     = now()
  where paypal_subscription_id = p_paypal_subscription_id;

  insert into public.subscription_activity (
    subscription_id, actor_id, action, new_state, metadata
  ) values (
    sub.id, null, 'paypal_payment_failed',
    to_jsonb(sub),
    jsonb_build_object('paypal_subscription_id', p_paypal_subscription_id, 'reason', p_reason)
  );

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- 8. RPC to record idempotency of a webhook event
-- ============================================================
create or replace function public.record_paypal_webhook_event_v1(
  p_event_id      text,
  p_event_type    text,
  p_payload_digest text,
  p_result        text default 'ok'
)
returns boolean   -- returns false if event already existed (duplicate)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  insert into public.paypal_webhook_events (event_id, event_type, payload_digest, result)
  values (p_event_id, p_event_type, p_payload_digest, p_result)
  on conflict (event_id) do nothing;

  return found;   -- true = newly recorded, false = duplicate
end;
$$;

grant execute on function public.record_paypal_webhook_event_v1(text, text, text, text) to service_role;
grant execute on function public.handle_paypal_payment_failure_v1(text, text) to service_role;
grant execute on function public.update_paypal_subscription_renewal_v1(text, text, timestamptz, numeric, text, numeric) to service_role;
grant execute on function public.activate_paypal_subscription_v1(text, text, uuid, uuid, text, numeric, numeric, text, numeric, timestamptz, timestamptz, text) to service_role;

commit;
