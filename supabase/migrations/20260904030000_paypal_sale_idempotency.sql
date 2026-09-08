begin;

create unique index if not exists subscription_payment_requests_paypal_tx_uidx
  on public.subscription_payment_requests (transaction_reference)
  where payment_method = 'paypal' and transaction_reference is not null;

alter table public.paypal_webhook_events
  add column if not exists error_metadata jsonb not null default '{}'::jsonb;

create or replace function public.activate_paypal_subscription_v1(
  p_paypal_subscription_id text,
  p_paypal_transaction_id text,
  p_user_id uuid,
  p_plan_id uuid,
  p_billing_cycle text,
  p_original_amount_mad numeric,
  p_paypal_amount numeric,
  p_paypal_currency text,
  p_conversion_rate numeric,
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

  if exists (select 1 from public.user_subscriptions
             where owner_user_id = p_user_id
               and paypal_subscription_id = p_paypal_subscription_id) then
    return jsonb_build_object('success', false, 'reason', 'already_activated');
  end if;

  if p_paypal_transaction_id is not null then
    reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));
    insert into public.subscription_payment_requests (
      reference, owner_user_id, subscription_id, request_type,
      current_plan_id, requested_plan_id, billing_cycle,
      expected_amount_mad, amount_received_mad, currency,
      payment_method, transaction_reference, paypal_subscription_id,
      original_amount_mad, paypal_amount, paypal_currency, conversion_rate,
      status, submitted_at, reviewed_at
    )
    select reference_val, p_user_id, sub.id,
      case when sub.plan_id = p_plan_id then 'renewal' else 'initial_activation' end,
      sub.plan_id, p_plan_id, p_billing_cycle, p_original_amount_mad,
      p_original_amount_mad, 'MAD', 'paypal', p_paypal_transaction_id,
      p_paypal_subscription_id, p_original_amount_mad, p_paypal_amount,
      p_paypal_currency, p_conversion_rate, p_payment_status, p_starts_at, p_starts_at
    from public.user_subscriptions sub
    where sub.owner_user_id = p_user_id
    returning * into inserted_request;
  end if;

  update public.user_subscriptions
  set status = 'active', payment_status = p_payment_status,
      plan_id = p_plan_id, billing_cycle = p_billing_cycle,
      paypal_subscription_id = p_paypal_subscription_id,
      paypal_transaction_id = p_paypal_transaction_id,
      current_period_start = p_starts_at, current_period_end = p_expires_at,
      grace_until = null, migration_state = 'assigned', updated_at = now()
  where owner_user_id = p_user_id
  returning * into existing_subscription;

  if found then
    insert into public.subscription_activity (subscription_id, actor_id, action, new_state, metadata)
    values (existing_subscription.id, null, 'paypal_subscription_activated',
      to_jsonb(existing_subscription), jsonb_build_object(
        'paypal_subscription_id', p_paypal_subscription_id,
        'payment_request_id', inserted_request.id,
        'paypal_transaction_id', p_paypal_transaction_id,
        'paypal_currency', p_paypal_currency,
        'conversion_rate', p_conversion_rate));
  end if;

  return jsonb_build_object('success', true, 'subscription_id', existing_subscription.id,
    'payment_request_id', inserted_request.id, 'payment_deferred', p_paypal_transaction_id is null);
end;
$$;

create or replace function public.update_paypal_subscription_renewal_v1(
  p_paypal_subscription_id text,
  p_paypal_transaction_id text,
  p_expires_at timestamptz,
  p_paypal_amount numeric,
  p_paypal_currency text,
  p_conversion_rate numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_subscription public.user_subscriptions;
  inserted_request public.subscription_payment_requests;
  provisional_request public.subscription_payment_requests;
  reference_val text;
  mad_amount numeric;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select * into existing_subscription from public.user_subscriptions
  where paypal_subscription_id = p_paypal_subscription_id;
  if not found then return jsonb_build_object('success', false, 'reason', 'subscription_not_found'); end if;

  if exists (select 1 from public.subscription_payment_requests
             where transaction_reference = p_paypal_transaction_id and payment_method = 'paypal') then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  select * into provisional_request from public.subscription_payment_requests
  where paypal_subscription_id = p_paypal_subscription_id
    and payment_method = 'paypal' and transaction_reference is null
    and status = 'paid'
  order by created_at asc limit 1
  for update;

  mad_amount := case when p_conversion_rate is not null and p_conversion_rate > 0
    then round(p_paypal_amount / p_conversion_rate, 2) else 0 end;

  if provisional_request.id is not null then
    update public.subscription_payment_requests
    set transaction_reference = p_paypal_transaction_id,
        paypal_amount = p_paypal_amount, paypal_currency = p_paypal_currency,
        original_amount_mad = mad_amount, expected_amount_mad = mad_amount,
        amount_received_mad = mad_amount, conversion_rate = p_conversion_rate,
        updated_at = now(), submitted_at = coalesce(submitted_at, now()),
        reviewed_at = coalesce(reviewed_at, now())
    where id = provisional_request.id
    returning * into inserted_request;
  else
    reference_val := 'PYPL-' || upper(substr(md5(random()::text), 1, 8));
    insert into public.subscription_payment_requests (
      reference, owner_user_id, subscription_id, request_type, requested_plan_id,
      billing_cycle, expected_amount_mad, amount_received_mad, currency,
      payment_method, transaction_reference, paypal_subscription_id,
      paypal_amount, paypal_currency, original_amount_mad, conversion_rate,
      status, submitted_at, reviewed_at
    ) values (reference_val, existing_subscription.owner_user_id, existing_subscription.id,
      'renewal', existing_subscription.plan_id, coalesce(existing_subscription.billing_cycle, 'monthly'),
      mad_amount, mad_amount, 'MAD', 'paypal', p_paypal_transaction_id,
      p_paypal_subscription_id, p_paypal_amount, p_paypal_currency, mad_amount,
      p_conversion_rate, 'paid', now(), now()) returning * into inserted_request;
  end if;

  update public.user_subscriptions
  set current_period_end = p_expires_at, status = 'active', payment_status = 'paid', updated_at = now()
  where paypal_subscription_id = p_paypal_subscription_id
  returning * into existing_subscription;

  insert into public.subscription_activity (subscription_id, actor_id, action, new_state, metadata)
  values (existing_subscription.id, null, 'paypal_subscription_renewed', to_jsonb(existing_subscription),
    jsonb_build_object('paypal_subscription_id', p_paypal_subscription_id,
      'payment_request_id', inserted_request.id, 'paypal_transaction_id', p_paypal_transaction_id,
      'paypal_currency', p_paypal_currency, 'conversion_rate', p_conversion_rate));

  return jsonb_build_object('success', true, 'subscription_id', existing_subscription.id,
    'payment_request_id', inserted_request.id);
end;
$$;

drop function if exists public.record_paypal_webhook_event_v1(text, text, text, text);
create or replace function public.record_paypal_webhook_event_v1(
  p_event_id text,
  p_event_type text,
  p_payload_digest text,
  p_result text default 'processing',
  p_error_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_result text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;

  select result into prior_result from public.paypal_webhook_events
  where event_id = p_event_id for update;

  if not found then
    insert into public.paypal_webhook_events (event_id, event_type, payload_digest, result, error_metadata)
    values (p_event_id, p_event_type, p_payload_digest, p_result, p_error_metadata);
    return p_result = 'processing';
  end if;

  if prior_result in ('processed', 'ok') then return false; end if;

  update public.paypal_webhook_events
  set event_type = p_event_type, payload_digest = p_payload_digest,
      result = p_result, error_metadata = p_error_metadata, processed_at = now()
  where event_id = p_event_id;
  return p_result = 'processing';
end;
$$;

grant execute on function public.record_paypal_webhook_event_v1(text, text, text, text, jsonb) to service_role;
grant execute on function public.activate_paypal_subscription_v1(text, text, uuid, uuid, text, numeric, numeric, text, numeric, timestamptz, timestamptz, text) to service_role;
grant execute on function public.update_paypal_subscription_renewal_v1(text, text, timestamptz, numeric, text, numeric) to service_role;

commit;