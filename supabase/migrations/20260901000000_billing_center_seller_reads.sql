-- Billing Center (Settings > Billing): seller-safe read helpers, realtime for
-- billing tables, and an exemption so an early renewal does not demote an
-- active subscription while the payment waits for admin approval.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seller billing overview: effective subscription + current plan details
--    (even when the plan is archived) + the open payment request, if any.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_billing_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  subscription public.user_subscriptions;
  plan public.subscription_plans;
  open_request public.subscription_payment_requests;
begin
  if uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into subscription
  from public.user_subscriptions item
  where item.owner_user_id = uid;

  if subscription.id is null then
    return jsonb_build_object(
      'subscription', null,
      'plan', null,
      'open_payment_request', null,
      'latest_payment_request', null
    );
  end if;

  if subscription.plan_id is not null then
    select * into plan
    from public.subscription_plans item
    where item.id = subscription.plan_id;
  end if;

  select * into open_request
  from public.subscription_payment_requests item
  where item.owner_user_id = uid
    and item.status in ('unpaid', 'submitted', 'reviewing')
  order by case item.status when 'submitted' then 0 when 'reviewing' then 1 else 2 end,
           item.created_at desc
  limit 1;

  return jsonb_build_object(
    'subscription', public.get_effective_subscription_v1(uid),
    'plan', case when plan.id is null then null else jsonb_build_object(
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
      'monthly_billing_enabled', coalesce(plan.monthly_billing_enabled, true),
      'annual_billing_enabled', coalesce(plan.annual_billing_enabled, true)
    ) end,
    'open_payment_request', case when open_request.id is null then null else jsonb_build_object(
      'id', open_request.id,
      'reference', open_request.reference,
      'request_type', open_request.request_type,
      'billing_cycle', open_request.billing_cycle,
      'expected_amount_mad', open_request.expected_amount_mad,
      'currency', open_request.currency,
      'payment_method', open_request.payment_method,
      'transaction_reference', open_request.transaction_reference,
      'proof_path', open_request.proof_path,
      'proof_mime_type', open_request.proof_mime_type,
      'status', open_request.status,
      'submitted_at', open_request.submitted_at,
      'created_at', open_request.created_at,
      'requested_plan_code', (select p.code from public.subscription_plans p where p.id = open_request.requested_plan_id),
      'requested_plan_name', (select p.name from public.subscription_plans p where p.id = open_request.requested_plan_id)
    ) end,
    'latest_payment_request', (
      select jsonb_build_object(
        'id', item.id,
        'reference', item.reference,
        'request_type', item.request_type,
        'billing_cycle', item.billing_cycle,
        'expected_amount_mad', item.expected_amount_mad,
        'currency', item.currency,
        'status', item.status,
        'submitted_at', item.submitted_at,
        'reviewed_at', item.reviewed_at,
        'created_at', item.created_at,
        'requested_plan_name', (select p.name from public.subscription_plans p where p.id = item.requested_plan_id),
        -- Seller-safe rejection reason: admin_note is only surfaced for rejected requests.
        'rejection_reason', case when item.status = 'rejected' then item.admin_note else null end
      )
      from public.subscription_payment_requests item
      where item.owner_user_id = uid
      order by item.created_at desc
      limit 1
    )
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seller payment history (paginated). Internal admin notes are never
--    returned; rejected requests expose admin_note as the rejection reason.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_my_subscription_payment_requests_v1(
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if uid is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  with filtered as (
    select request.*,
      requested_plan.code as requested_plan_code,
      requested_plan.name as requested_plan_name,
      current_plan.code as current_plan_code
    from public.subscription_payment_requests request
    left join public.subscription_plans requested_plan on requested_plan.id = request.requested_plan_id
    left join public.subscription_plans current_plan on current_plan.id = request.current_plan_id
    where request.owner_user_id = uid
  ), paged as (
    select * from filtered
    order by created_at desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id,
      'reference', item.reference,
      'request_type', item.request_type,
      'requested_plan', item.requested_plan_code,
      'requested_plan_name', item.requested_plan_name,
      'current_plan', item.current_plan_code,
      'billing_cycle', item.billing_cycle,
      'expected_amount_mad', item.expected_amount_mad,
      'amount_received_mad', item.amount_received_mad,
      'currency', item.currency,
      'payment_method', item.payment_method,
      'transaction_reference', item.transaction_reference,
      'proof_path', item.proof_path,
      'proof_mime_type', item.proof_mime_type,
      'proof_size_bytes', item.proof_size_bytes,
      'status', item.status,
      'user_note', item.user_note,
      'submitted_at', item.submitted_at,
      'reviewed_at', item.reviewed_at,
      'created_at', item.created_at,
      -- Seller-safe rejection reason only; admin internal notes are excluded otherwise.
      'rejection_reason', case when item.status = 'rejected' then item.admin_note else null end
    ) order by item.created_at desc) from paged item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', size_value
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_my_billing_overview_v1() from public, anon;
revoke all on function public.list_my_subscription_payment_requests_v1(integer, integer) from public, anon;
grant execute on function public.get_my_billing_overview_v1() to authenticated, service_role;
grant execute on function public.list_my_subscription_payment_requests_v1(integer, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Realtime: publish billing tables so the Billing Center reflects admin
--    approvals, rejections, subscription and plan changes without a reload.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_subscriptions'
  ) then
    alter publication supabase_realtime add table public.user_subscriptions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscription_payment_requests'
  ) then
    alter publication supabase_realtime add table public.subscription_payment_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscription_plans'
  ) then
    alter publication supabase_realtime add table public.subscription_plans;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Payment request creation: an ACTIVE subscription stays active while a
--    renewal/upgrade payment awaits admin approval. New and expired accounts
--    keep the existing pending_payment lock. Duplicate open requests are still
--    rejected server-side (PAYMENT_REQUEST_ALREADY_UNDER_REVIEW).
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Only lock accounts that are not already active: an early renewal keeps the
  -- current subscription running until the admin approves the new payment.
  update public.user_subscriptions
  set status = 'pending_payment', payment_status = 'unpaid', updated_at = now()
  where id = subscription.id
    and status <> 'active';
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_created', jsonb_build_object('payment_request_id', payment.id, 'requested_plan', plan.code, 'billing_cycle', normalized_cycle, 'expected_amount_mad', expected_amount, 'request_type', normalized_type));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'requested_plan', plan.code, 'billing_cycle', payment.billing_cycle, 'expected_amount_mad', payment.expected_amount_mad, 'currency', payment.currency, 'status', payment.status);
end;
$$;

revoke all on function public.create_subscription_payment_request_v1(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_subscription_payment_request_v1(text, text, text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Proof submission: an ACTIVE subscription stays active while its renewal
--    payment is under review; non-active accounts keep the under_review lock.
-- ─────────────────────────────────────────────────────────────────────────────
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
  update public.user_subscriptions
  set status = case when status = 'active' then 'active' else 'under_review' end,
      payment_status = 'submitted', updated_at = now()
  where id = payment.subscription_id;
  insert into public.subscription_activity(subscription_id, actor_id, action, metadata)
  values (payment.subscription_id, (select auth.uid()), 'payment_proof_submitted', jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'submitted_at', payment.submitted_at);
end;
$$;

revoke all on function public.attach_subscription_payment_proof_v1(uuid, text, text, bigint) from public, anon;
grant execute on function public.attach_subscription_payment_proof_v1(uuid, text, text, bigint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Admin review: restore annual-cycle and renewal period extension (the
--    lifecycle migration had hardcoded monthly +1 month), and keep an ACTIVE
--    subscription active when its renewal payment is rejected. Approval,
--    rejection, waive, permission checks and audit records are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
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
    update public.subscription_payment_requests
    set status = 'rejected', amount_received_mad = p_amount_received_mad,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
        reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now()
    where id = payment.id returning * into payment;
    -- Rejecting a renewal of a still-active subscription does not cancel that
    -- subscription; only non-active accounts fall back to pending_payment.
    update public.user_subscriptions
    set status = case when status = 'active' then 'active' else 'pending_payment' end,
        payment_status = 'rejected', updated_at = now()
    where id = subscription.id returning * into subscription;
    new_payment_status := 'rejected';
  else
    if normalized_decision = 'approve' and coalesce(p_amount_received_mad, payment.expected_amount_mad) < payment.expected_amount_mad then
      raise exception 'AMOUNT_RECEIVED_BELOW_EXPECTED' using errcode = '22023';
    end if;
    -- Renewal of an unexpired subscription extends the current period; every
    -- other decision starts a fresh period of the paid cycle length.
    if payment.request_type = 'renewal' and subscription.current_period_end is not null and subscription.current_period_end > now() then
      period_start_value := coalesce(subscription.current_period_start, now());
      period_end_value := case when payment.billing_cycle = 'annual' then subscription.current_period_end + interval '1 year' else subscription.current_period_end + interval '1 month' end;
    else
      period_start_value := now();
      period_end_value := case when payment.billing_cycle = 'annual' then period_start_value + interval '1 year' else period_start_value + interval '1 month' end;
    end if;
    new_payment_status := case when normalized_decision = 'waive' then 'waived' else 'paid' end;
    update public.subscription_payment_requests
    set status = new_payment_status,
        amount_received_mad = case when normalized_decision = 'waive' then 0 else coalesce(p_amount_received_mad, expected_amount_mad) end,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
        reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now()
    where id = payment.id returning * into payment;
    update public.user_subscriptions
    set plan_id = payment.requested_plan_id,
        billing_cycle = payment.billing_cycle,
        status = 'active',
        payment_status = new_payment_status,
        current_period_start = period_start_value,
        current_period_end = period_end_value,
        grace_until = null,
        activated_at = coalesce(activated_at, now()),
        activated_by = (select auth.uid()),
        migration_state = 'assigned',
        updated_at = now()
    where id = subscription.id returning * into subscription;
  end if;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_' || new_payment_status, old_state, to_jsonb(subscription), jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference, 'decision', normalized_decision, 'admin_note', p_admin_note));
  perform public.record_platform_audit('payment_request_' || new_payment_status, 'subscription_payment_request', payment.id, payment.reference, jsonb_build_object('subscription_id', subscription.id, 'owner_user_id', subscription.owner_user_id, 'requested_plan_id', payment.requested_plan_id, 'billing_cycle', payment.billing_cycle, 'amount_received_mad', payment.amount_received_mad, 'subscription_start_date', period_start_value, 'subscription_end_date', period_end_value));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'subscription_id', subscription.id, 'subscription_status', subscription.status, 'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'idempotent', false);
end;
$$;

revoke all on function public.platform_review_payment_request_v1(uuid, text, numeric, text) from public, anon;
grant execute on function public.platform_review_payment_request_v1(uuid, text, numeric, text) to authenticated, service_role;

commit;
