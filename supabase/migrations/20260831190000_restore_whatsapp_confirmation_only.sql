-- Restore the single, normal WhatsApp confirmation flow.
-- A reply of "1" is matched to its confirmation job, marks that order
-- confirmed, and returns the seller's configured confirmation reply.

begin;

-- Address collection is retired. Preserve historical records but stop every
-- live run and prevent any new order from entering that flow.
update public.whatsapp_address_automation_settings
set enabled = false,
    updated_at = now()
where enabled = true;

delete from public.whatsapp_address_collection
where status in (
  'waiting_for_start_reply',
  'waiting_for_address',
  'waiting_for_address_confirmation',
  'waiting_address',
  'waiting_confirmation'
);

update public.whatsapp_queue
set payload = coalesce(payload, '{}'::jsonb)
    - 'address_flow_id'
    - 'address_collection_id'
    - 'address_step'
    - 'text_template',
    updated_at = now()
where automation_event = 'confirmation'
  and (
    coalesce(payload, '{}'::jsonb) ? 'address_flow_id'
    or coalesce(payload, '{}'::jsonb) ? 'address_collection_id'
    or coalesce(payload, '{}'::jsonb) ? 'address_step'
  );

update public.whatsapp_queue
set status = 'cancelled',
    last_error = 'Address flow retired; normal confirmation only',
    error_code = 'ADDRESS_FLOW_RETIRED',
    updated_at = now()
where status in ('pending', 'processing')
  and automation_event = 'address_confirmation';

delete from public.whatsapp_reply_actions
where action = 'address';

drop trigger if exists whatsapp_prepare_address_flow_queue on public.whatsapp_queue;

create or replace function public.queue_whatsapp_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.whatsapp_settings%rowtype;
  v_rule public.whatsapp_automation_rules%rowtype;
  v_new_status text;
  v_old_status text;
  v_phone text;
  v_order_json jsonb := to_jsonb(new);
begin
  if new.workspace_id is null then
    return new;
  end if;

  select * into v_settings
  from public.whatsapp_settings
  where workspace_id = new.workspace_id
    and enabled = true
    and connection_status = 'ready';
  if not found then
    return new;
  end if;

  if lower(coalesce(v_order_json ->> 'whatsapp_opt_out', 'false')) = 'true' then
    return new;
  end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(new.phone);
  if v_phone is null then
    insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
    values (new.workspace_id, new."Order ID", 'queue_skipped', 'warning', 'Invalid Moroccan mobile number', jsonb_build_object('phone', new.phone));
    return new;
  end if;

  if exists (
    select 1 from public.whatsapp_opt_outs o
    where o.workspace_id = new.workspace_id and o.normalized_phone = v_phone
  ) then
    return new;
  end if;

  for v_rule in
    select *
    from public.whatsapp_automation_rules
    where workspace_id = new.workspace_id and enabled = true
  loop
    v_new_status := public.normalize_whatsapp_status(v_order_json ->> v_rule.status_source);
    v_old_status := case when tg_op = 'UPDATE'
      then public.normalize_whatsapp_status(to_jsonb(old) ->> v_rule.status_source)
      else null
    end;

    if v_new_status = any (
      select public.normalize_whatsapp_status(value)
      from unnest(v_rule.trigger_statuses) as value
    ) and (tg_op = 'INSERT' or v_old_status is distinct from v_new_status) then
      insert into public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, rule_id, idempotency_key, channel_sequence,
        audio_recording_id, payload, status, scheduled_for, expires_at,
        attempts, max_attempts
      ) values (
        new.workspace_id, new."Order ID", new.phone, v_phone, v_rule.event_type,
        v_rule.event_type, v_rule.id,
        new.workspace_id::text || ':' || new."Order ID"::text || ':' || v_rule.id::text,
        v_rule.channel_sequence, v_rule.audio_recording_id,
        jsonb_build_object('status_source', v_rule.status_source, 'status', v_new_status),
        'pending',
        public.next_whatsapp_send_at(new.workspace_id, now() + make_interval(mins => v_rule.delay_minutes)),
        now() + make_interval(mins => v_rule.expires_after_minutes),
        0, 3
      ) on conflict (idempotency_key) do nothing;
    end if;
  end loop;

  return new;
exception when others then
  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (new.workspace_id, new."Order ID", 'trigger_error', 'error', sqlerrm, jsonb_build_object('sqlstate', sqlstate));
  return new;
end;
$$;

create or replace function public.process_whatsapp_inbound(
  p_workspace_id uuid,
  p_provider_event_id text,
  p_remote_jid text,
  p_phone text,
  p_body text,
  p_quoted_message_id text default null,
  p_received_at timestamptz default now(),
  p_raw_payload jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_body text := public.normalize_whatsapp_keyword(coalesce(p_body, ''));
  v_action public.whatsapp_reply_actions%rowtype;
  v_message_id uuid;
  v_job public.whatsapp_queue%rowtype;
  v_job_found boolean := false;
  v_candidates uuid[] := '{}';
  v_rows integer := 0;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace';
  end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null then
    raise exception 'Invalid Moroccan mobile number';
  end if;

  insert into public.whatsapp_messages (
    workspace_id, phone, normalized_phone, remote_jid, direction, message_type,
    body, wa_message_id, provider_event_id, status, raw_payload, created_at
  ) values (
    p_workspace_id, p_phone, v_phone, p_remote_jid, 'inbound', 'reply',
    p_body, p_provider_event_id, p_provider_event_id, 'received',
    coalesce(p_raw_payload, '{}'::jsonb), p_received_at
  ) on conflict (workspace_id, provider_event_id) where provider_event_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  select * into v_action
  from public.whatsapp_reply_actions a
  where a.workspace_id = p_workspace_id
    and a.enabled = true
    and exists (
      select 1
      from unnest(a.keywords) keyword
      where public.normalize_whatsapp_keyword(keyword) = v_body
    )
  order by a.priority asc, a.created_at asc
  limit 1;

  if not found then
    update public.whatsapp_messages
    set message_type = 'unmatched', processed_at = now()
    where id = v_message_id;
    return jsonb_build_object('duplicate', false, 'action', 'unmatched', 'manual_review', true);
  end if;

  if v_action.action_type = 'opt_out' then
    insert into public.whatsapp_opt_outs (workspace_id, normalized_phone, source)
    values (p_workspace_id, v_phone, 'customer_reply')
    on conflict (workspace_id, normalized_phone)
    do update set opted_out_at = now(), source = excluded.source;

    update public.orders
    set whatsapp_opt_out = true,
        updated_at = now()
    where workspace_id = p_workspace_id
      and public.normalize_moroccan_whatsapp_phone(phone) = v_phone;

    update public.whatsapp_queue
    set status = 'cancelled', last_error = 'Customer opted out', error_code = 'OPT_OUT', updated_at = now()
    where workspace_id = p_workspace_id and normalized_phone = v_phone and status = 'pending';

    update public.whatsapp_messages
    set message_type = 'opt_out', reply_action = 'opt_out', processed_at = now()
    where id = v_message_id;
    return jsonb_build_object('duplicate', false, 'action', 'opt_out', 'reply_text', v_action.response_template);
  end if;

  if p_quoted_message_id is not null then
    select q.* into v_job
    from public.whatsapp_queue q
    where q.workspace_id = p_workspace_id
      and q.wa_message_id = p_quoted_message_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
    order by q.sent_at desc nulls last
    limit 1;
    v_job_found := found;
  end if;

  if not v_job_found then
    select coalesce(array_agg(distinct q.order_id), '{}') into v_candidates
    from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id = q.workspace_id
    where q.workspace_id = p_workspace_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
      and q.status in ('sent', 'delivered', 'read')
      and q.sent_at >= now() - make_interval(hours => s.reply_context_hours);

    if cardinality(v_candidates) = 1 then
      select q.* into v_job
      from public.whatsapp_queue q
      where q.workspace_id = p_workspace_id
        and q.order_id = v_candidates[1]
        and q.normalized_phone = v_phone
        and q.automation_event = 'confirmation'
      order by q.sent_at desc nulls last
      limit 1;
      v_job_found := found;
    end if;
  end if;

  if not v_job_found then
    insert into public.whatsapp_manual_reviews (
      workspace_id, normalized_phone, provider_event_id, reason, inbound_body, candidate_order_ids
    ) values (
      p_workspace_id, v_phone, p_provider_event_id,
      case when cardinality(v_candidates) = 0 then 'No matching confirmation message' else 'Ambiguous phone-to-order match' end,
      p_body, v_candidates
    ) on conflict (workspace_id, provider_event_id) do nothing;

    update public.whatsapp_messages
    set message_type = 'unmatched', reply_action = v_action.action_type, processed_at = now()
    where id = v_message_id;
    return jsonb_build_object('duplicate', false, 'action', v_action.action_type, 'manual_review', true);
  end if;

  if v_action.action_type = 'confirm_order' then
    update public.orders
    set status = 'confirmed',
        confirmation_method = 'whatsapp',
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now(),
        whatsapp_replied_at = now(),
        whatsapp_last_action = 'confirm_order',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id
      and workspace_id = p_workspace_id;
    get diagnostics v_rows = row_count;
  elsif v_action.action_type = 'request_callback' then
    update public.orders
    set status = 'scheduled',
        updated_at = now(),
        whatsapp_replied_at = now(),
        whatsapp_last_action = 'request_callback',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id
      and workspace_id = p_workspace_id;
    get diagnostics v_rows = row_count;
  else
    v_rows := 1;
  end if;

  update public.whatsapp_messages
  set order_id = v_job.order_id,
      message_type = case v_action.action_type
        when 'confirm_order' then 'confirm'
        when 'request_callback' then 'callback'
        when 'opt_out' then 'opt_out'
        else 'reply'
      end,
      reply_action = v_action.action_type,
      processed_at = now()
  where id = v_message_id;

  if v_rows = 0 then
    return jsonb_build_object('duplicate', false, 'action', v_action.action_type, 'manual_review', true);
  end if;

  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (
    p_workspace_id, v_job.order_id, 'inbound_action_applied', 'info',
    'WhatsApp reply action applied to order',
    jsonb_build_object('action_type', v_action.action_type, 'inbound_id', v_message_id, 'source', 'whatsapp')
  );

  return jsonb_build_object(
    'duplicate', false,
    'action', v_action.action_type,
    'order_id', v_job.order_id,
    'reply_text', v_action.response_template,
    'reply_action_id', v_action.id
  );
end;
$$;

revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  to service_role;

commit;
