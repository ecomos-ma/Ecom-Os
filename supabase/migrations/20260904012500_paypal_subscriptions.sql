begin;

-- 1. Add paypal columns to subscription_plans
alter table public.subscription_plans
  add column if not exists paypal_product_id text,
  add column if not exists paypal_monthly_plan_id text,
  add column if not exists paypal_annual_plan_id text;

-- 2. Add tracking to user_subscriptions
alter table public.user_subscriptions
  add column if not exists paypal_subscription_id text unique,
  add column if not exists paypal_transaction_id text;

-- 3. Add tracking to subscription_payment_requests
alter table public.subscription_payment_requests
  add column if not exists paypal_subscription_id text,
  add column if not exists original_amount_mad numeric(12,2),
  add column if not exists paypal_amount numeric(12,2),
  add column if not exists paypal_currency text;

-- 4. Create an RPC to safely activate a subscription from the Edge Function
create or replace function public.activate_paypal_subscription_v1(
  p_paypal_subscription_id text,
  p_paypal_transaction_id text,
  p_user_id uuid,
  p_plan_id uuid,
  p_billing_cycle text,
  p_original_amount_mad numeric,
  p_paypal_amount numeric,
  p_paypal_currency text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_payment_status text default 'paid'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
  inserted_request public.subscription_payment_requests;
  reference_val text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  -- Random payment request reference
  reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));
  
  -- Record the transaction
  insert into public.subscription_payment_requests(
    reference, owner_user_id, subscription_id, request_type, 
    current_plan_id, requested_plan_id, billing_cycle,
    expected_amount_mad, amount_received_mad, currency,
    payment_method, transaction_reference,
    paypal_subscription_id, original_amount_mad, paypal_amount, paypal_currency,
    status, submitted_at, reviewed_at
  )
  select 
    reference_val,
    p_user_id,
    subscription.id,
    case when subscription.plan_id = p_plan_id then 'renewal' else 'initial_activation' end,
    subscription.plan_id,
    p_plan_id,
    p_billing_cycle,
    p_original_amount_mad,
    p_original_amount_mad,
    'MAD',
    'paypal',
    p_paypal_transaction_id,
    p_paypal_subscription_id, p_original_amount_mad, p_paypal_amount, p_paypal_currency,
    p_payment_status, p_starts_at, p_starts_at
  from public.user_subscriptions subscription
  where subscription.owner_user_id = p_user_id
  returning * into inserted_request;

  -- Assign plan and unlock workspace
  update public.user_subscriptions
  set status = 'active',
      payment_status = p_payment_status,
      plan_id = p_plan_id,
      billing_cycle = p_billing_cycle,
      paypal_subscription_id = p_paypal_subscription_id,
      paypal_transaction_id = p_paypal_transaction_id,
      current_period_start = p_starts_at,
      current_period_end = p_expires_at,
      grace_until = null,
      migration_state = 'assigned',
      updated_at = now()
  where owner_user_id = p_user_id
  returning * into existing_subscription;

  if found then
    insert into public.subscription_activity(subscription_id, actor_id, action, new_state, metadata)
    values (existing_subscription.id, null, 'paypal_subscription_activated', to_jsonb(existing_subscription), jsonb_build_object('paypal_subscription_id', p_paypal_subscription_id, 'payment_request_id', inserted_request.id));
  end if;

  return jsonb_build_object('success', true, 'subscription_id', existing_subscription.id, 'payment_request_id', inserted_request.id);
end;
$$;

create or replace function public.update_paypal_subscription_renewal_v1(
  p_paypal_subscription_id text,
  p_paypal_transaction_id text,
  p_expires_at timestamptz,
  p_paypal_amount numeric,
  p_paypal_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
  inserted_request public.subscription_payment_requests;
  reference_val text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select * into existing_subscription from public.user_subscriptions where paypal_subscription_id = p_paypal_subscription_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  -- Ensure we process webhooks idempotently
  if exists (select 1 from public.subscription_payment_requests where transaction_reference = p_paypal_transaction_id and payment_method = 'paypal') then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));

  insert into public.subscription_payment_requests(
    reference, owner_user_id, subscription_id, request_type, 
    requested_plan_id, billing_cycle,
    expected_amount_mad, amount_received_mad, currency,
    payment_method, transaction_reference,
    paypal_subscription_id, paypal_amount, paypal_currency,
    status, submitted_at, reviewed_at
  )
  values (
    reference_val, existing_subscription.owner_user_id, existing_subscription.id, 'renewal',
    existing_subscription.plan_id, coalesce(existing_subscription.billing_cycle, 'monthly'),
    0, 0, 'MAD', 
    'paypal', p_paypal_transaction_id,
    p_paypal_subscription_id, p_paypal_amount, p_paypal_currency,
    'paid', now(), now()
  ) returning * into inserted_request;

  update public.user_subscriptions
  set current_period_end = p_expires_at,
      status = 'active',
      payment_status = 'paid',
      updated_at = now()
  where paypal_subscription_id = p_paypal_subscription_id
  returning * into existing_subscription;

  insert into public.subscription_activity(subscription_id, actor_id, action, new_state, metadata)
  values (existing_subscription.id, null, 'paypal_subscription_renewed', to_jsonb(existing_subscription), jsonb_build_object('paypal_subscription_id', p_paypal_subscription_id, 'payment_request_id', inserted_request.id));

  return jsonb_build_object('success', true, 'subscription_id', existing_subscription.id);
end;
$$;

create or replace function public.handle_paypal_subscription_cancellation_v1(
  p_paypal_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select * into existing_subscription from public.user_subscriptions where paypal_subscription_id = p_paypal_subscription_id;
  if not found then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  update public.user_subscriptions
  set paypal_subscription_id = null,
      updated_at = now()
  where paypal_subscription_id = p_paypal_subscription_id
  returning * into existing_subscription;

  if found then
    insert into public.subscription_activity(subscription_id, actor_id, action, new_state, metadata)
    values (existing_subscription.id, null, 'paypal_subscription_cancelled', to_jsonb(existing_subscription), jsonb_build_object('paypal_subscription_id', p_paypal_subscription_id));
  end if;

  return jsonb_build_object('success', true);
end;
$$;

commit;
