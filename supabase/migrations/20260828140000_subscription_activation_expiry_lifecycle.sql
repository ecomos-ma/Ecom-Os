begin;

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, dedupe_strategy, cooldown_seconds, can_bypass_quiet_hours,
  sound_allowed, sensitive_preview_allowed
)
values
  ('subscription.renewal_due', 'system', 'Subscription renewal due', 'high', array['in_app','push'], true, true, false, array['owner','supervisor','admin','manager'], 'source_event', 0, true, false, false),
  ('subscription.expired', 'system', 'Subscription expired', 'critical', array['in_app','push'], true, true, false, array['owner','supervisor','admin','manager'], 'source_event', 0, true, false, false)
on conflict (event_key) do update set
  default_title = excluded.default_title,
  default_priority = excluded.default_priority,
  available_channels = excluded.available_channels,
  default_in_app_enabled = excluded.default_in_app_enabled,
  default_push_enabled = excluded.default_push_enabled,
  allowed_roles = excluded.allowed_roles,
  updated_at = now();

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
declare expires_at timestamptz;
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
  expires_at := nullif(effective ->> 'current_period_end', '')::timestamptz;
  if effective ->> 'status' = 'active' and expires_at is not null and expires_at <= now() then
    effective := effective || jsonb_build_object(
      'status', 'expired',
      'payment_status', 'unpaid',
      'operational_access', false,
      'access_reason', 'subscription_expired'
    );
  end if;
  return jsonb_build_object(
    'allowed', coalesce((effective ->> 'operational_access')::boolean, false),
    'reason', effective ->> 'access_reason',
    'workspace_id', p_workspace_id,
    'workspace_owner_id', owner_id,
    'subscription', effective
  );
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
    update public.subscription_payment_requests
    set status = 'rejected', amount_received_mad = p_amount_received_mad,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
        reviewer_id = (select auth.uid()), reviewed_at = now(), updated_at = now()
    where id = payment.id returning * into payment;
    update public.user_subscriptions
    set status = 'pending_payment', payment_status = 'rejected', updated_at = now()
    where id = subscription.id returning * into subscription;
    new_payment_status := 'rejected';
  else
    if normalized_decision = 'approve' and coalesce(p_amount_received_mad, payment.expected_amount_mad) < payment.expected_amount_mad then
      raise exception 'AMOUNT_RECEIVED_BELOW_EXPECTED' using errcode = '22023';
    end if;
    period_start_value := clock_timestamp();
    period_end_value := period_start_value + interval '1 month';
    new_payment_status := case when normalized_decision = 'waive' then 'waived' else 'paid' end;
    update public.subscription_payment_requests
    set status = new_payment_status,
        amount_received_mad = case when normalized_decision = 'waive' then 0 else coalesce(p_amount_received_mad, expected_amount_mad) end,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
        reviewer_id = (select auth.uid()), reviewed_at = period_start_value, updated_at = period_start_value
    where id = payment.id returning * into payment;
    update public.user_subscriptions
    set plan_id = payment.requested_plan_id,
        billing_cycle = 'monthly',
        status = 'active',
        payment_status = new_payment_status,
        current_period_start = period_start_value,
        current_period_end = period_end_value,
        grace_until = null,
        activated_at = period_start_value,
        activated_by = (select auth.uid()),
        migration_state = 'assigned',
        updated_at = period_start_value
    where id = subscription.id returning * into subscription;
  end if;
  insert into public.subscription_activity(subscription_id, actor_id, action, old_state, new_state, metadata)
  values (subscription.id, (select auth.uid()), 'payment_request_' || new_payment_status, old_state, to_jsonb(subscription), jsonb_build_object('payment_request_id', payment.id, 'reference', payment.reference, 'decision', normalized_decision, 'admin_note', p_admin_note));
  perform public.record_platform_audit('payment_request_' || new_payment_status, 'subscription_payment_request', payment.id, payment.reference, jsonb_build_object('subscription_id', subscription.id, 'owner_user_id', subscription.owner_user_id, 'requested_plan_id', payment.requested_plan_id, 'billing_cycle', 'monthly', 'amount_received_mad', payment.amount_received_mad, 'subscription_start_date', period_start_value, 'subscription_end_date', period_end_value));
  return jsonb_build_object('id', payment.id, 'reference', payment.reference, 'status', payment.status, 'subscription_id', subscription.id, 'subscription_status', subscription.status, 'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'idempotent', false);
end;
$$;

create or replace function public.process_subscription_lifecycle_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare expired_count integer := 0;
declare renewal_count integer := 0;
declare item record;
declare workspace_id_value uuid;
begin
  for item in
    select subscription.id, subscription.owner_user_id, subscription.current_period_end,
           owner.workspace_id, profile.full_name
    from public.user_subscriptions subscription
    join public.workspace_subscription_owners owner on owner.owner_user_id = subscription.owner_user_id
    join public.profiles profile on profile.id = subscription.owner_user_id
    where subscription.status = 'active' and subscription.current_period_end is not null
  loop
    workspace_id_value := item.workspace_id;
    if item.current_period_end <= now() then
      update public.user_subscriptions
      set status = 'expired', payment_status = 'unpaid', updated_at = now()
      where id = item.id and status = 'active';
      if found then
        expired_count := expired_count + 1;
        perform private.emit_notification_event(
          workspace_id_value, 'subscription.expired', 'subscription', item.id,
          jsonb_build_object('title', 'Subscription expired', 'message', 'Your subscription expired. Submit a payment to reactivate your account.', 'action_url', '/choose-plan'),
          'subscription.expired:' || item.id || ':' || item.current_period_end::text, item.owner_user_id, item.id::text
        );
      end if;
    elsif item.current_period_end > now() + interval '1 day'
      and item.current_period_end <= now() + interval '2 days' then
      perform private.emit_notification_event(
        workspace_id_value, 'subscription.renewal_due', 'subscription', item.id,
        jsonb_build_object('title', 'Subscription renewal due soon', 'message', 'Your subscription expires in 2 days. Submit a renewal payment to keep access.', 'action_url', '/choose-plan'),
        'subscription.renewal_due:' || item.id || ':' || item.current_period_end::date::text, item.owner_user_id, item.id::text
      );
      renewal_count := renewal_count + 1;
    end if;
  end loop;
  return jsonb_build_object('expired', expired_count, 'renewal_notifications', renewal_count);
end;
$$;

grant execute on function public.process_subscription_lifecycle_v1() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'subscription-lifecycle' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('subscription-lifecycle', '*/15 * * * *', 'select public.process_subscription_lifecycle_v1();');
end;
$$;

commit;
