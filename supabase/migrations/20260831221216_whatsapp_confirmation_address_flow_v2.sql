-- Add Confirmation + Address to the existing WhatsApp pipeline without
-- changing any workspace's current Confirmation Only behavior.

begin;

alter table public.whatsapp_settings
  add column if not exists confirmation_mode text not null default 'confirmation_only',
  add column if not exists address_request_message text not null default 'Please write your full address.',
  add column if not exists address_success_message text not null default E'✅ Your order is confirmed.\n📍 Address: {{address}}';

alter table public.whatsapp_settings
  drop constraint if exists whatsapp_settings_confirmation_mode_check;
alter table public.whatsapp_settings
  add constraint whatsapp_settings_confirmation_mode_check
  check (confirmation_mode in ('confirmation_only', 'confirmation_address'));

-- Reuse the existing durable address conversation row. These columns add the
-- exact state and provider context required by the new two-step flow.
alter table public.whatsapp_address_collection
  add column if not exists conversation_state text not null default 'idle',
  add column if not exists remote_jid text,
  add column if not exists confirmation_queue_id uuid references public.whatsapp_queue(id) on delete set null;

alter table public.whatsapp_address_collection
  drop constraint if exists whatsapp_address_collection_conversation_state_check;
alter table public.whatsapp_address_collection
  add constraint whatsapp_address_collection_conversation_state_check
  check (conversation_state in ('idle', 'awaiting_confirmation', 'awaiting_address', 'completed'));

create index if not exists whatsapp_address_collection_state_lookup_idx
  on public.whatsapp_address_collection (
    workspace_id,
    normalized_phone,
    conversation_state,
    expires_at desc
  );

create index if not exists whatsapp_address_collection_confirmation_queue_idx
  on public.whatsapp_address_collection (workspace_id, confirmation_queue_id)
  where confirmation_queue_id is not null;

-- A sent confirmation message is the persisted awaiting_confirmation state.
create or replace function public.sync_whatsapp_address_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.whatsapp_settings%rowtype;
begin
  if new.automation_event is distinct from 'confirmation'
     or new.status not in ('sent', 'delivered', 'read')
     or new.normalized_phone is null then
    return new;
  end if;

  select s.* into v_settings
  from public.whatsapp_settings s
  where s.workspace_id = new.workspace_id
    and s.confirmation_mode = 'confirmation_address';

  if not found then
    return new;
  end if;

  insert into public.whatsapp_address_collection (
    workspace_id, order_id, normalized_phone, status, conversation_state,
    remote_jid, confirmation_queue_id, requested_at, expires_at, updated_at
  ) values (
    new.workspace_id, new.order_id, new.normalized_phone, 'waiting_confirmation',
    'awaiting_confirmation', new.remote_jid, new.id, coalesce(new.sent_at, now()),
    coalesce(new.sent_at, now()) + make_interval(mins => greatest(v_settings.reply_context_hours * 60, 5)),
    now()
  )
  on conflict (workspace_id, normalized_phone) do update
  set order_id = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.order_id
        else excluded.order_id
      end,
      status = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.status
        else 'waiting_confirmation'
      end,
      conversation_state = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.conversation_state
        else 'awaiting_confirmation'
      end,
      remote_jid = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.remote_jid
        else excluded.remote_jid
      end,
      confirmation_queue_id = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.confirmation_queue_id
        else excluded.confirmation_queue_id
      end,
      requested_at = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.requested_at
        else excluded.requested_at
      end,
      expires_at = case
        when public.whatsapp_address_collection.conversation_state = 'awaiting_address'
          then public.whatsapp_address_collection.expires_at
        else excluded.expires_at
      end,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists whatsapp_sync_address_conversation on public.whatsapp_queue;
create trigger whatsapp_sync_address_conversation
after insert or update of status, remote_jid, wa_message_id on public.whatsapp_queue
for each row execute function public.sync_whatsapp_address_conversation();

-- Remove only the obsolete 3/4/5 queue mutator.
drop trigger if exists whatsapp_prepare_address_flow_queue on public.whatsapp_queue;

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
  v_action text;
  v_job public.whatsapp_queue%rowtype;
  v_candidates uuid[] := '{}';
  v_reply text;
  v_agent_id uuid;
  v_message_id uuid;
  v_rows integer := 0;
  v_settings public.whatsapp_settings%rowtype;
  v_flow public.whatsapp_address_collection%rowtype;
  v_error_message text;
  v_error_state text;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace';
  end if;

  if nullif(p_provider_event_id, '') is null then
    raise exception 'Inbound provider event id is required';
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
    coalesce(p_body, ''), p_provider_event_id, p_provider_event_id, 'received',
    coalesce(p_raw_payload, '{}'::jsonb), p_received_at
  ) on conflict (workspace_id, provider_event_id)
    where provider_event_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  select s.* into v_settings
  from public.whatsapp_settings s
  where s.workspace_id = p_workspace_id;

  -- In awaiting_address, the next non-empty text belongs to the same order.
  select c.* into v_flow
  from public.whatsapp_address_collection c
  where c.workspace_id = p_workspace_id
    and c.normalized_phone = v_phone
    and c.conversation_state = 'awaiting_address'
    and c.expires_at > now()
    and (c.remote_jid is null or c.remote_jid = p_remote_jid)
  limit 1
  for update;

  if found and v_settings.confirmation_mode = 'confirmation_address' then
    if nullif(btrim(coalesce(p_body, '')), '') is null then
      update public.whatsapp_messages
      set order_id = v_flow.order_id, message_type = 'address_empty',
          reply_action = 'request_address', processed_at = now()
      where id = v_message_id;

      return jsonb_build_object(
        'duplicate', false, 'action', 'request_address', 'order_id', v_flow.order_id,
        'conversation_state', 'awaiting_address', 'reply_text', v_settings.address_request_message
      );
    end if;

    begin
      -- The address and confirmation update are one atomic subtransaction.
      update public.orders
      set address = p_body,
          status = 'confirmed',
          confirmation_method = 'whatsapp',
          confirmed_at = coalesce(confirmed_at, now()),
          updated_at = now(),
          whatsapp_replied_at = now(),
          whatsapp_last_action = 'confirmed_with_address_by_whatsapp',
          whatsapp_last_inbound_id = v_message_id
      where workspace_id = p_workspace_id
        and "Order ID" = v_flow.order_id;
      get diagnostics v_rows = row_count;

      if v_rows <> 1 then
        raise exception 'Address flow order was not found in its workspace';
      end if;

      update public.whatsapp_address_collection
      set status = 'completed', conversation_state = 'completed', address = p_body,
          last_inbound_id = v_message_id, completed_at = now(), updated_at = now()
      where id = v_flow.id
        and workspace_id = p_workspace_id
        and order_id = v_flow.order_id;

      update public.whatsapp_messages
      set order_id = v_flow.order_id, message_type = 'address',
          reply_action = 'confirm_with_address', processed_at = now()
      where id = v_message_id;

      insert into public.whatsapp_events (
        workspace_id, order_id, event_type, severity, message, metadata
      ) values (
        p_workspace_id, v_flow.order_id, 'address_flow_completed', 'info',
        'Order address saved and order confirmed from WhatsApp',
        jsonb_build_object('conversation_id', v_flow.id, 'inbound_id', v_message_id, 'conversation_state', 'completed')
      );
    exception when others then
      get stacked diagnostics v_error_message = message_text, v_error_state = returned_sqlstate;

      insert into public.whatsapp_events (
        workspace_id, order_id, event_type, severity, message, metadata
      ) values (
        p_workspace_id, v_flow.order_id, 'address_save_failed', 'error', v_error_message,
        jsonb_build_object('sqlstate', v_error_state, 'conversation_id', v_flow.id,
                           'inbound_id', v_message_id, 'conversation_state', 'awaiting_address')
      );

      update public.whatsapp_messages
      set order_id = v_flow.order_id, message_type = 'address_error',
          reply_action = 'address_save_failed', processed_at = now()
      where id = v_message_id;

      return jsonb_build_object(
        'duplicate', false, 'action', 'address_save_failed', 'order_id', v_flow.order_id,
        'conversation_state', 'awaiting_address', 'manual_review', true
      );
    end;

    return jsonb_build_object(
      'duplicate', false, 'action', 'confirm_with_address', 'order_id', v_flow.order_id,
      'conversation_state', 'completed', 'address', p_body,
      'reply_text', v_settings.address_success_message
    );
  end if;

  select a.action, a.response_template
  into v_action, v_reply
  from public.whatsapp_reply_actions a
  where a.workspace_id = p_workspace_id
    and a.enabled = true
    and exists (
      select 1 from unnest(a.keywords) keyword
      where public.normalize_whatsapp_keyword(keyword) = v_body
    )
  order by case a.action when 'opt_out' then 0 when 'confirm' then 1 else 2 end,
           a.priority asc, a.created_at asc
  limit 1;

  if v_action = 'opt_out' then
    insert into public.whatsapp_opt_outs (workspace_id, normalized_phone, source)
    values (p_workspace_id, v_phone, 'customer_reply')
    on conflict (workspace_id, normalized_phone)
    do update set opted_out_at = now(), source = excluded.source;

    update public.orders
    set whatsapp_opt_out = true, updated_at = now()
    where workspace_id = p_workspace_id
      and public.normalize_moroccan_whatsapp_phone(phone) = v_phone;

    update public.whatsapp_queue
    set status = 'cancelled', last_error = 'Customer opted out', error_code = 'OPT_OUT', updated_at = now()
    where workspace_id = p_workspace_id and normalized_phone = v_phone and status = 'pending';

    update public.whatsapp_address_collection
    set status = 'cancelled', conversation_state = 'idle', updated_at = now()
    where workspace_id = p_workspace_id and normalized_phone = v_phone;

    update public.whatsapp_messages
    set message_type = 'opt_out', reply_action = 'opt_out', processed_at = now()
    where id = v_message_id;

    return jsonb_build_object('duplicate', false, 'action', 'opt_out', 'reply_text', v_reply);
  end if;

  -- A quoted provider id is the strongest link to the exact order.
  if p_quoted_message_id is not null then
    select q.* into v_job
    from public.whatsapp_queue q
    where q.workspace_id = p_workspace_id
      and q.wa_message_id = p_quoted_message_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
    order by q.sent_at desc nulls last
    limit 1;
  end if;

  -- Preserve the existing fallback inside this workspace and reply window.
  if v_job.id is null then
    select coalesce(array_agg(distinct q.order_id), '{}') into v_candidates
    from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id = q.workspace_id
    where q.workspace_id = p_workspace_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
      and q.status in ('sent', 'delivered', 'read')
      and q.sent_at >= now() - make_interval(hours => s.reply_context_hours);

    if cardinality(v_candidates) >= 1 then
      select q.* into v_job
      from public.whatsapp_queue q
      join public.orders o on o.workspace_id = q.workspace_id and o."Order ID" = q.order_id
      where q.workspace_id = p_workspace_id
        and q.order_id = any(v_candidates)
        and q.normalized_phone = v_phone
        and q.automation_event = 'confirmation'
      order by o.created_at desc, q.sent_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_job.id is null then
    insert into public.whatsapp_manual_reviews (
      workspace_id, normalized_phone, provider_event_id, reason, inbound_body, candidate_order_ids
    ) values (
      p_workspace_id, v_phone, p_provider_event_id, 'No matching confirmation message',
      p_body, coalesce(v_candidates, '{}')
    ) on conflict (workspace_id, provider_event_id) do nothing;

    update public.whatsapp_messages
    set message_type = 'unmatched', processed_at = now(), reply_action = v_action
    where id = v_message_id;

    return jsonb_build_object('duplicate', false, 'action', coalesce(v_action, 'unmatched'), 'manual_review', true);
  end if;

  if v_action = 'confirm' and v_settings.confirmation_mode = 'confirmation_address' then
    insert into public.whatsapp_address_collection (
      workspace_id, order_id, normalized_phone, status, conversation_state,
      remote_jid, confirmation_queue_id, requested_at, expires_at,
      last_inbound_id, updated_at
    ) values (
      p_workspace_id, v_job.order_id, v_phone, 'waiting_address', 'awaiting_address',
      p_remote_jid, v_job.id, now(),
      now() + make_interval(hours => greatest(v_settings.reply_context_hours, 1)),
      v_message_id, now()
    )
    on conflict (workspace_id, normalized_phone) do update
    set order_id = excluded.order_id, status = 'waiting_address',
        conversation_state = 'awaiting_address', address = null, attempts = 0,
        remote_jid = excluded.remote_jid, confirmation_queue_id = excluded.confirmation_queue_id,
        requested_at = excluded.requested_at, expires_at = excluded.expires_at,
        last_inbound_id = excluded.last_inbound_id, completed_at = null, updated_at = now()
    returning * into v_flow;

    update public.whatsapp_messages
    set order_id = v_job.order_id, message_type = 'confirm',
        reply_action = 'request_address', processed_at = now()
    where id = v_message_id;

    insert into public.whatsapp_events (
      workspace_id, order_id, event_type, severity, message, metadata
    ) values (
      p_workspace_id, v_job.order_id, 'address_requested', 'info',
      'Customer confirmed and is awaiting address collection',
      jsonb_build_object('conversation_id', v_flow.id, 'confirmation_queue_id', v_job.id,
                         'inbound_id', v_message_id, 'conversation_state', 'awaiting_address')
    );

    return jsonb_build_object(
      'duplicate', false, 'action', 'request_address', 'order_id', v_job.order_id,
      'conversation_state', 'awaiting_address', 'reply_text', v_settings.address_request_message
    );
  elsif v_action = 'confirm' then
    -- Confirmation Only remains the current production behavior.
    update public.orders
    set status = 'confirmed', confirmation_method = 'whatsapp',
        confirmed_at = coalesce(confirmed_at, now())
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;
    get diagnostics v_rows = row_count;
  elsif v_action = 'callback' then
    update public.orders
    set status = 'scheduled'
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;
    get diagnostics v_rows = row_count;

    select o.assigned_to into v_agent_id
    from public.orders o
    where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;

    if v_agent_id is null then
      select pw.profile_id into v_agent_id
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      where pw.workspace_id = p_workspace_id
      order by case lower(coalesce(p.role, '')) when 'owner' then 0 when 'supervisor' then 1 else 2 end
      limit 1;
    end if;

    if v_agent_id is not null then
      insert into public.confirmation_callbacks (
        workspace_id, order_id, customer_id, agent_id, scheduled_at, note
      )
      select p_workspace_id, o."Order ID", o.customer_id, v_agent_id,
             now() + make_interval(mins => s.callback_delay_minutes),
             'Requested from WhatsApp reply'
      from public.orders o
      join public.whatsapp_settings s on s.workspace_id = o.workspace_id
      where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;
    else
      insert into public.whatsapp_manual_reviews (
        workspace_id, order_id, normalized_phone, provider_event_id, reason, inbound_body
      ) values (
        p_workspace_id, v_job.order_id, v_phone, p_provider_event_id,
        'Callback requested but no workspace agent is available', p_body
      ) on conflict (workspace_id, provider_event_id) do nothing;
    end if;
  else
    v_rows := 1;
  end if;

  update public.whatsapp_messages
  set order_id = v_job.order_id,
      message_type = case v_action when 'confirm' then 'confirm' when 'callback' then 'callback'
        when 'opt_out' then 'opt_out' else 'reply' end,
      reply_action = v_action, processed_at = now()
  where id = v_message_id;

  if v_rows = 0 then
    return jsonb_build_object('duplicate', false, 'action', coalesce(v_action, 'unmatched'), 'manual_review', true);
  end if;

  insert into public.whatsapp_events (
    workspace_id, order_id, event_type, severity, message, metadata
  ) values (
    p_workspace_id, v_job.order_id, 'inbound_action_applied', 'info',
    'WhatsApp reply action applied to order',
    jsonb_build_object('action', v_action, 'inbound_id', v_message_id)
  );

  return jsonb_build_object(
    'duplicate', false, 'action', coalesce(v_action, 'unmatched'),
    'order_id', v_job.order_id,
    'reply_text', case when v_action is null then null else v_reply end
  );
end;
$$;

revoke all on function public.sync_whatsapp_address_conversation() from public, anon, authenticated;
revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
