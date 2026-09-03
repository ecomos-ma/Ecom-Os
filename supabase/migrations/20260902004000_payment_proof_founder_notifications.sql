-- Payment proof submissions are platform-wide work. Add them to the protected
-- founder notification feed so the admin bell shows every receipt awaiting review.
create or replace function public.founder_list_notifications_v2(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.is_founder() then
    raise exception 'FOUNDER_ACCESS_REQUIRED';
  end if;

  with notices as (
    select
      'payment'::text as source,
      request.id as source_id,
      'Payment proof needs review'::text as title,
      concat(
        coalesce(nullif(trim(profile.full_name), ''), nullif(trim(profile.email), ''), 'A seller'),
        ' submitted ',
        coalesce(nullif(trim(plan.name), ''), 'a subscription payment'),
        ' · ',
        to_char(request.expected_amount_mad, 'FM999G999G999D00'),
        ' ',
        coalesce(request.currency, 'MAD'),
        ' · ',
        request.reference
      ) as detail,
      request.submitted_at as created_at,
      'warning'::text as severity
    from public.subscription_payment_requests request
    left join public.profiles profile on profile.id = request.owner_user_id
    left join public.subscription_plans plan on plan.id = request.requested_plan_id
    where request.status in ('submitted', 'reviewing')
      and request.proof_path is not null

    union all

    select 'support_ticket'::text, ticket.id, 'Support ticket: ' || ticket.subject, ticket.message, ticket.updated_at, ticket.status
    from public.support_tickets ticket
    where ticket.status in ('open', 'in_progress', 'waiting_on_customer')

    union all

    select 'provider_failure'::text, log.id, 'Tools provider request failed', coalesce(log.error_message, log.action || 'Tools API'), log.created_at, 'warning'
    from public.tool_api_usage_logs log
    where log.success = false and log.created_at > now() - interval '7 days'

    union all

    select 'audit'::text, event.id, replace(event.action, '_', ' '), coalesce(event.reason, event.target_type, 'Founder action'), event.created_at, 'info'
    from public.founder_audit_events event
    where event.created_at > now() - interval '7 days'
  ),
  limited as (
    select * from notices
    order by created_at desc nulls last
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', notice.source,
        'source_id', notice.source_id,
        'title', notice.title,
        'detail', notice.detail,
        'created_at', notice.created_at,
        'severity', notice.severity,
        'read', read_receipt.id is not null
      ) order by notice.created_at desc nulls last)
      from limited notice
      left join public.founder_notification_reads read_receipt
        on read_receipt.profile_id = auth.uid()
        and read_receipt.source = notice.source
        and read_receipt.source_id = notice.source_id
    ), '[]'::jsonb),
    'unread', (
      select count(*)
      from notices notice
      where not exists (
        select 1
        from public.founder_notification_reads read_receipt
        where read_receipt.profile_id = auth.uid()
          and read_receipt.source = notice.source
          and read_receipt.source_id = notice.source_id
      )
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.founder_list_notifications_v2(integer) from public, anon;
grant execute on function public.founder_list_notifications_v2(integer) to authenticated;
