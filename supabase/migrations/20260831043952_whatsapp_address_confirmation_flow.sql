-- Extend the existing WhatsApp address collection path.  This migration keeps
-- the established queue, message and inbound RPC contracts in place; it adds a
-- configurable address-confirmation branch for the existing confirmation rule.

create table if not exists public.whatsapp_address_automation_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  initial_message text not null default E'Salam {{customer_name}} 👋\n\nBach nkemlo confirmation dyal commande, kteb 3.',
  start_aliases text[] not null default array['3'],
  address_prompt text not null default E'Mzyan ✅ kteb lina l\'adresse kamla dyalk.',
  address_retry_message text not null default E'Smah lina, kteb l\'adresse kamla b chi tafasil (quartier, rue, ville).',
  address_confirmation_message text not null default E'📍 L\'adresse dyalk:\n{{address}}\n\nIla s7i7a, kteb 4 bach n2akdo talab.',
  confirmation_aliases text[] not null default array['4', 'confirm', 'oui', 'نعم'],
  change_address_enabled boolean not null default true,
  change_address_aliases text[] not null default array['5', 'change', 'modifier'],
  success_message text not null default E'Tm taكيد talab ✅',
  max_retries integer not null default 3 check (max_retries between 1 and 10),
  expires_after_minutes integer not null default 1440 check (expires_after_minutes between 5 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_address_collection
  add column if not exists automation_settings_id uuid references public.whatsapp_address_automation_settings(id) on delete set null,
  add column if not exists status text not null default 'waiting_for_address',
  add column if not exists address text,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_inbound_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_address_collection
  drop constraint if exists whatsapp_address_collection_status_check;

alter table public.whatsapp_address_collection
  add constraint whatsapp_address_collection_status_check check (
    status in (
      'waiting_for_start_reply',
      'waiting_for_address',
      'waiting_for_address_confirmation',
      'completed',
      'expired',
      'cancelled',
      -- Legacy values remain readable while old sessions naturally expire.
      'waiting_address',
      'waiting_confirmation'
    )
  );

create index if not exists whatsapp_address_collection_workspace_order_idx
  on public.whatsapp_address_collection (workspace_id, order_id, requested_at desc);

create unique index if not exists whatsapp_address_collection_active_phone_idx
  on public.whatsapp_address_collection (workspace_id, normalized_phone)
  where status in ('waiting_for_start_reply', 'waiting_for_address', 'waiting_for_address_confirmation');

create or replace function public.normalize_whatsapp_flow_reply(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(replace(replace(coalesce(p_value, ''), chr(65039), ''), chr(8419), '')))
$$;

create or replace function public.enqueue_whatsapp_address_flow_message(
  p_workspace_id uuid,
  p_order_id uuid,
  p_phone text,
  p_normalized_phone text,
  p_automation_settings_id uuid,
  p_collection_id uuid,
  p_step text,
  p_template text,
  p_idempotency_key text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.whatsapp_queue (
    workspace_id, order_id, phone, normalized_phone, message_type,
    automation_event, idempotency_key, channel_sequence, payload, status,
    scheduled_for, expires_at, attempts, max_attempts
  ) values (
    p_workspace_id, p_order_id, p_phone, p_normalized_phone, 'reply',
    'address_confirmation', p_idempotency_key, array['text'],
    jsonb_build_object(
      'text_template', p_template,
      'address_flow_id', p_automation_settings_id,
      'address_collection_id', p_collection_id,
      'address_step', p_step
    ),
    'pending', now(), p_expires_at, 0, 3
  ) on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.whatsapp_queue
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

create or replace function public.process_whatsapp_address_inbound(
  p_workspace_id uuid,
  p_provider_event_id text,
  p_remote_jid text,
  p_phone text,
  p_body text,
  p_quoted_message_id text default null,
  p_received_at timestamptz default now(),
  p_raw_payload jsonb default '{}'::jsonb,
  p_message_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_body text := trim(coalesce(p_body, ''));
  v_body_normalized text := public.normalize_whatsapp_flow_reply(p_body);
  v_settings public.whatsapp_address_automation_settings%rowtype;
  v_collection public.whatsapp_address_collection%rowtype;
  v_candidates uuid[];
  v_order_id uuid;
  v_message_id uuid;
  v_retry_count integer;
  v_is_opt_out boolean := false;
  v_is_valid_address boolean := false;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace';
  end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null then
    raise exception 'Invalid Moroccan mobile number';
  end if;

  select * into v_settings
  from public.whatsapp_address_automation_settings
  where workspace_id = p_workspace_id;

  if not found then
    return jsonb_build_object('handled', false);
  end if;

  -- STOP remains global: hand it back to the established inbound handler.
  select exists (
    select 1
    from public.whatsapp_reply_actions a
    cross join lateral unnest(a.keywords) keyword
    where a.workspace_id = p_workspace_id
      and a.enabled
      and a.action = 'opt_out'
      and public.normalize_whatsapp_flow_reply(keyword) = v_body_normalized
  ) into v_is_opt_out;
  if v_is_opt_out then
    return jsonb_build_object('handled', false);
  end if;

  select * into v_collection
  from public.whatsapp_address_collection c
  where c.workspace_id = p_workspace_id
    and c.normalized_phone = v_phone
    and c.automation_settings_id = v_settings.id
    and c.status in ('waiting_for_start_reply', 'waiting_for_address', 'waiting_for_address_confirmation')
  order by c.requested_at desc
  limit 1
  for update;

  if found then
    if v_collection.expires_at <= now() then
      update public.whatsapp_address_collection
      set status = 'expired', updated_at = now()
      where id = v_collection.id;
      insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
      values (p_workspace_id, v_collection.order_id, 'address_flow_expired', 'warning',
        'Address confirmation expired before the reply was received',
        jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id));
      return jsonb_build_object('handled', true, 'expired', true, 'order_id', v_collection.order_id);
    end if;

    -- A paused flow never falls through to unrelated global actions.
    if not v_settings.enabled then
      return jsonb_build_object('handled', true, 'paused', true, 'order_id', v_collection.order_id);
    end if;

    insert into public.whatsapp_messages (
      workspace_id, order_id, phone, normalized_phone, remote_jid, direction, message_type,
      body, wa_message_id, provider_event_id, status, raw_payload, created_at
    ) values (
      p_workspace_id, v_collection.order_id, p_phone, v_phone, p_remote_jid, 'inbound', 'reply',
      p_body, p_provider_event_id, p_provider_event_id, 'received', coalesce(p_raw_payload, '{}'::jsonb), p_received_at
    ) on conflict (workspace_id, provider_event_id) where provider_event_id is not null do nothing
    returning id into v_message_id;

    if v_message_id is null then
      return jsonb_build_object('handled', true, 'duplicate', true, 'order_id', v_collection.order_id);
    end if;

    if v_collection.status = 'waiting_for_start_reply' then
      if exists (
        select 1 from unnest(v_settings.start_aliases) alias
        where public.normalize_whatsapp_flow_reply(alias) = v_body_normalized
      ) then
        update public.whatsapp_address_collection
        set status = 'waiting_for_address', last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;
        perform public.enqueue_whatsapp_address_flow_message(
          p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
          'ask_address', v_settings.address_prompt,
          'address-flow:' || v_collection.id::text || ':ask:' || coalesce(p_provider_event_id, v_message_id::text),
          v_collection.expires_at
        );
        update public.whatsapp_messages
        set reply_action = 'address_flow_start', processed_at = now()
        where id = v_message_id;
        insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        values (p_workspace_id, v_collection.order_id, 'address_requested', 'info',
          'Customer started address collection',
          jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id, 'provider_event_id', p_provider_event_id));
        return jsonb_build_object('handled', true, 'action', 'address_flow_start', 'reply_queued', true, 'order_id', v_collection.order_id);
      end if;

      update public.whatsapp_messages
      set reply_action = 'address_flow_wrong_start_reply', processed_at = now()
      where id = v_message_id;
      return jsonb_build_object('handled', true, 'action', 'address_flow_wrong_start_reply', 'order_id', v_collection.order_id);
    end if;

    if v_collection.status = 'waiting_for_address' then
      v_is_valid_address := coalesce(p_message_type, 'conversation') in ('conversation', 'extendedTextMessage')
        and char_length(v_body) >= 5
        and v_body ~ '[[:alnum:]]';

      if not v_is_valid_address then
        v_retry_count := v_collection.attempts + 1;
        update public.whatsapp_address_collection
        set attempts = v_retry_count,
            last_inbound_id = v_message_id,
            status = case when v_retry_count >= v_settings.max_retries then 'expired' else 'waiting_for_address' end,
            updated_at = now()
        where id = v_collection.id;
        update public.whatsapp_messages
        set reply_action = 'address_flow_invalid_address', processed_at = now()
        where id = v_message_id;
        perform public.enqueue_whatsapp_address_flow_message(
          p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
          'address_retry', v_settings.address_retry_message,
          'address-flow:' || v_collection.id::text || ':retry:' || coalesce(p_provider_event_id, v_message_id::text),
          v_collection.expires_at
        );
        insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        values (p_workspace_id, v_collection.order_id,
          case when v_retry_count >= v_settings.max_retries then 'address_flow_needs_review' else 'address_rejected' end,
          case when v_retry_count >= v_settings.max_retries then 'warning' else 'info' end,
          case when v_retry_count >= v_settings.max_retries then 'Address collection reached its retry limit' else 'Customer response was not a valid address' end,
          jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id, 'attempt', v_retry_count, 'message_type', p_message_type));
        if v_retry_count >= v_settings.max_retries then
          insert into public.whatsapp_manual_reviews (workspace_id, order_id, normalized_phone, provider_event_id, reason, inbound_body)
          values (p_workspace_id, v_collection.order_id, v_phone, p_provider_event_id, 'Address collection retry limit reached', p_body)
          on conflict (workspace_id, provider_event_id) do nothing;
        end if;
        return jsonb_build_object('handled', true, 'action', 'address_flow_invalid_address', 'reply_queued', true, 'order_id', v_collection.order_id);
      end if;

      update public.orders
      set address = v_body,
          address_source = 'whatsapp_automation',
          whatsapp_replied_at = now(),
          whatsapp_last_action = 'address_updated',
          whatsapp_last_inbound_id = v_message_id,
          updated_at = now()
      where workspace_id = p_workspace_id and "Order ID" = v_collection.order_id;

      update public.whatsapp_address_collection
      set address = v_body,
          attempts = 0,
          status = 'waiting_for_address_confirmation',
          last_inbound_id = v_message_id,
          updated_at = now()
      where id = v_collection.id;
      update public.whatsapp_messages
      set reply_action = 'address_flow_address_saved', processed_at = now()
      where id = v_message_id;
      perform public.enqueue_whatsapp_address_flow_message(
        p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
        'confirm_address', v_settings.address_confirmation_message,
        'address-flow:' || v_collection.id::text || ':confirm-address:' || coalesce(p_provider_event_id, v_message_id::text),
        v_collection.expires_at
      );
      insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
      values (p_workspace_id, v_collection.order_id, 'order_address_updated', 'info',
        'Order address updated by WhatsApp Automation',
        jsonb_build_object('source', 'whatsapp_automation', 'automation_id', v_settings.id, 'collection_id', v_collection.id, 'provider_event_id', p_provider_event_id));
      insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
      values (p_workspace_id, v_collection.order_id, 'address_confirmation_requested', 'info',
        'Address confirmation requested from customer',
        jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id));
      return jsonb_build_object('handled', true, 'action', 'address_flow_address_saved', 'reply_queued', true, 'order_id', v_collection.order_id);
    end if;

    if v_collection.status = 'waiting_for_address_confirmation' then
      if v_settings.change_address_enabled and exists (
        select 1 from unnest(v_settings.change_address_aliases) alias
        where public.normalize_whatsapp_flow_reply(alias) = v_body_normalized
      ) then
        update public.whatsapp_address_collection
        set status = 'waiting_for_address', attempts = 0, last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;
        perform public.enqueue_whatsapp_address_flow_message(
          p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
          'ask_address_again', v_settings.address_prompt,
          'address-flow:' || v_collection.id::text || ':ask-again:' || coalesce(p_provider_event_id, v_message_id::text),
          v_collection.expires_at
        );
        update public.whatsapp_messages
        set reply_action = 'address_flow_change_address', processed_at = now()
        where id = v_message_id;
        insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        values (p_workspace_id, v_collection.order_id, 'address_confirmation_reopened', 'info',
          'Customer requested an address change',
          jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id));
        return jsonb_build_object('handled', true, 'action', 'address_flow_change_address', 'reply_queued', true, 'order_id', v_collection.order_id);
      end if;

      if exists (
        select 1 from unnest(v_settings.confirmation_aliases) alias
        where public.normalize_whatsapp_flow_reply(alias) = v_body_normalized
      ) then
        update public.orders
        set status = 'confirmed',
            confirmation_method = 'whatsapp',
            confirmed_at = coalesce(confirmed_at, now()),
            whatsapp_replied_at = now(),
            whatsapp_last_action = 'confirmed_by_address_automation',
            whatsapp_last_inbound_id = v_message_id,
            updated_at = now()
        where workspace_id = p_workspace_id and "Order ID" = v_collection.order_id;

        update public.whatsapp_queue
        set status = 'cancelled',
            last_error = 'Order confirmed by WhatsApp address automation',
            error_code = 'order_confirmed',
            updated_at = now()
        where workspace_id = p_workspace_id
          and order_id = v_collection.order_id
          and status = 'pending'
          and automation_event in ('confirmation', 'address_confirmation');

        update public.whatsapp_address_collection
        set status = 'completed', completed_at = now(), last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;
        update public.whatsapp_messages
        set reply_action = 'address_flow_confirm_order', processed_at = now()
        where id = v_message_id;
        perform public.enqueue_whatsapp_address_flow_message(
          p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
          'success', v_settings.success_message,
          'address-flow:' || v_collection.id::text || ':success:' || coalesce(p_provider_event_id, v_message_id::text),
          now() + interval '24 hours'
        );
        insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        values (p_workspace_id, v_collection.order_id, 'order_confirmed', 'info',
          'Order confirmed by WhatsApp Automation',
          jsonb_build_object('source', 'whatsapp_automation', 'automation_id', v_settings.id, 'collection_id', v_collection.id, 'provider_event_id', p_provider_event_id));
        insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        values (p_workspace_id, v_collection.order_id, 'address_flow_completed', 'info',
          'Address confirmation automation completed',
          jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id));
        return jsonb_build_object('handled', true, 'action', 'address_flow_confirm_order', 'reply_queued', true, 'order_id', v_collection.order_id);
      end if;

      update public.whatsapp_messages
      set reply_action = 'address_flow_wrong_confirmation_reply', processed_at = now()
      where id = v_message_id;
      return jsonb_build_object('handled', true, 'action', 'address_flow_wrong_confirmation_reply', 'order_id', v_collection.order_id);
    end if;
  end if;

  -- No active run: a configured start reply can only start from this workflow's
  -- own sent initial message, never from an unrelated customer conversation.
  if not v_settings.enabled or not exists (
    select 1 from unnest(v_settings.start_aliases) alias
    where public.normalize_whatsapp_flow_reply(alias) = v_body_normalized
  ) then
    return jsonb_build_object('handled', false);
  end if;

  select coalesce(array_agg(distinct q.order_id), '{}'::uuid[]) into v_candidates
  from public.whatsapp_queue q
  where q.workspace_id = p_workspace_id
    and q.normalized_phone = v_phone
    and q.status in ('sent', 'delivered', 'read')
    and q.sent_at >= now() - make_interval(mins => v_settings.expires_after_minutes)
    and q.payload ->> 'address_flow_id' = v_settings.id::text
    and (p_quoted_message_id is null or q.wa_message_id = p_quoted_message_id);

  if cardinality(v_candidates) <> 1 then
    if cardinality(v_candidates) > 1 then
      insert into public.whatsapp_manual_reviews (workspace_id, normalized_phone, provider_event_id, reason, inbound_body, candidate_order_ids)
      values (p_workspace_id, v_phone, p_provider_event_id, 'Ambiguous address automation start reply', p_body, v_candidates)
      on conflict (workspace_id, provider_event_id) do nothing;
      return jsonb_build_object('handled', true, 'manual_review', true, 'action', 'address_flow_ambiguous');
    end if;
    return jsonb_build_object('handled', false);
  end if;

  v_order_id := v_candidates[1];
  insert into public.whatsapp_address_collection (
    workspace_id, order_id, normalized_phone, automation_settings_id, status, requested_at, expires_at
  ) values (
    p_workspace_id, v_order_id, v_phone, v_settings.id, 'waiting_for_address', now(),
    now() + make_interval(mins => v_settings.expires_after_minutes)
  ) on conflict do nothing
  returning id into v_message_id;

  -- A run is normally inserted alongside the outbound initial message by the
  -- order trigger.  This fallback only supports deployments with an already
  -- sent legacy queue row and never replaces an existing run.
  if v_message_id is null then
    return jsonb_build_object('handled', true, 'manual_review', true, 'action', 'address_flow_start_conflict', 'order_id', v_order_id);
  end if;

  select * into v_collection from public.whatsapp_address_collection where id = v_message_id;
  insert into public.whatsapp_messages (
    workspace_id, order_id, phone, normalized_phone, remote_jid, direction, message_type,
    body, wa_message_id, provider_event_id, status, raw_payload, created_at
  ) values (
    p_workspace_id, v_order_id, p_phone, v_phone, p_remote_jid, 'inbound', 'reply',
    p_body, p_provider_event_id, p_provider_event_id, 'received', coalesce(p_raw_payload, '{}'::jsonb), p_received_at
  ) on conflict (workspace_id, provider_event_id) where provider_event_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('handled', true, 'duplicate', true, 'order_id', v_order_id);
  end if;

  update public.whatsapp_address_collection
  set last_inbound_id = v_message_id, updated_at = now()
  where id = v_collection.id;
  update public.whatsapp_messages
  set reply_action = 'address_flow_start', processed_at = now()
  where id = v_message_id;
  perform public.enqueue_whatsapp_address_flow_message(
    p_workspace_id, v_order_id, p_phone, v_phone, v_settings.id, v_collection.id,
    'ask_address', v_settings.address_prompt,
    'address-flow:' || v_collection.id::text || ':ask:' || coalesce(p_provider_event_id, v_message_id::text),
    v_collection.expires_at
  );
  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (p_workspace_id, v_order_id, 'address_requested', 'info', 'Customer started address collection',
    jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id, 'provider_event_id', p_provider_event_id));
  return jsonb_build_object('handled', true, 'action', 'address_flow_start', 'reply_queued', true, 'order_id', v_order_id);
end;
$$;

create or replace function public.queue_whatsapp_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.whatsapp_settings%rowtype;
  v_rule public.whatsapp_automation_rules%rowtype;
  v_address_flow public.whatsapp_address_automation_settings%rowtype;
  v_new_status text;
  v_old_status text;
  v_phone text;
  v_order_json jsonb := to_jsonb(new);
  v_payload jsonb;
  v_queue_id uuid;
  v_collection_id uuid;
  v_use_address_flow boolean;
begin
  if new.workspace_id is null then return new; end if;

  select * into v_settings
  from public.whatsapp_settings
  where workspace_id = new.workspace_id and enabled = true and connection_status = 'ready';
  if not found then return new; end if;

  if lower(coalesce(v_order_json ->> 'whatsapp_opt_out', 'false')) = 'true' then return new; end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(new.phone);
  if v_phone is null then
    insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
    values (new.workspace_id, new."Order ID", 'queue_skipped', 'warning', 'Invalid Moroccan mobile number', jsonb_build_object('phone', new.phone));
    return new;
  end if;

  if exists (select 1 from public.whatsapp_opt_outs o where o.workspace_id = new.workspace_id and o.normalized_phone = v_phone) then return new; end if;

  for v_rule in select * from public.whatsapp_automation_rules where workspace_id = new.workspace_id and enabled = true loop
    v_new_status := public.normalize_whatsapp_status(v_order_json ->> v_rule.status_source);
    v_old_status := case when tg_op = 'UPDATE' then public.normalize_whatsapp_status(to_jsonb(old) ->> v_rule.status_source) else null end;

    if v_new_status = any (select public.normalize_whatsapp_status(x) from unnest(v_rule.trigger_statuses) x)
       and (tg_op = 'INSERT' or v_old_status is distinct from v_new_status) then
      v_payload := jsonb_build_object('status_source', v_rule.status_source, 'status', v_new_status);
      v_use_address_flow := false;
      v_collection_id := null;

      if v_rule.event_type = 'confirmation' then
        select * into v_address_flow from public.whatsapp_address_automation_settings
        where workspace_id = new.workspace_id and enabled = true;
        -- The legacy table has a workspace + phone uniqueness contract. Keep a
        -- completed/expired run visible until the next order, then clear it so
        -- the same customer can safely begin a new confirmation later.
        delete from public.whatsapp_address_collection c
        where c.workspace_id = new.workspace_id
          and c.normalized_phone = v_phone
          and (c.expires_at <= now() or c.status in ('completed', 'expired', 'cancelled'));
        if v_address_flow.id is not null and not exists (
          select 1 from public.whatsapp_address_collection c
          where c.workspace_id = new.workspace_id
            and c.normalized_phone = v_phone
            and c.status in ('waiting_for_start_reply', 'waiting_for_address', 'waiting_for_address_confirmation', 'waiting_address', 'waiting_confirmation')
            and c.expires_at > now()
        ) then
          v_use_address_flow := true;
          v_payload := v_payload || jsonb_build_object(
            'text_template', v_address_flow.initial_message,
            'address_flow_id', v_address_flow.id,
            'address_step', 'start'
          );
        end if;
      end if;

      insert into public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, rule_id, idempotency_key, channel_sequence,
        audio_recording_id, payload, status, scheduled_for, expires_at,
        attempts, max_attempts
      ) values (
        new.workspace_id, new."Order ID", new.phone, v_phone, v_rule.event_type,
        v_rule.event_type, v_rule.id,
        new.workspace_id::text || ':' || new."Order ID"::text || ':' || v_rule.id::text,
        v_rule.channel_sequence, v_rule.audio_recording_id, v_payload, 'pending',
        public.next_whatsapp_send_at(new.workspace_id, now() + make_interval(mins => v_rule.delay_minutes)),
        now() + make_interval(mins => v_rule.expires_after_minutes), 0, 3
      ) on conflict (idempotency_key) do nothing
      returning id into v_queue_id;

      if v_queue_id is not null and v_use_address_flow then
        insert into public.whatsapp_address_collection (
          workspace_id, order_id, normalized_phone, automation_settings_id, status, requested_at, expires_at
        ) values (
          new.workspace_id, new."Order ID", v_phone, v_address_flow.id, 'waiting_for_start_reply', now(),
          now() + make_interval(mins => v_address_flow.expires_after_minutes)
        ) on conflict do nothing
        returning id into v_collection_id;

        if v_collection_id is not null then
          insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
          values (new.workspace_id, new."Order ID", 'address_flow_triggered', 'info',
            'New order address confirmation automation triggered',
            jsonb_build_object('automation_id', v_address_flow.id, 'collection_id', v_collection_id, 'queue_id', v_queue_id));
        end if;
      end if;
    end if;
  end loop;

  return new;
exception when others then
  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (new.workspace_id, new."Order ID", 'trigger_error', 'error', sqlerrm, jsonb_build_object('sqlstate', sqlstate));
  return new;
end;
$$;

alter table public.whatsapp_address_automation_settings enable row level security;
alter table public.whatsapp_address_collection enable row level security;

drop policy if exists whatsapp_address_flow_settings_read on public.whatsapp_address_automation_settings;
create policy whatsapp_address_flow_settings_read on public.whatsapp_address_automation_settings
for select to authenticated using (public.whatsapp_is_workspace_member(workspace_id));
drop policy if exists whatsapp_address_flow_settings_manage on public.whatsapp_address_automation_settings;
create policy whatsapp_address_flow_settings_manage on public.whatsapp_address_automation_settings
for all to authenticated using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_address_collection_read on public.whatsapp_address_collection;
create policy whatsapp_address_collection_read on public.whatsapp_address_collection
for select to authenticated using (public.whatsapp_is_workspace_member(workspace_id));
drop policy if exists whatsapp_address_collection_manage on public.whatsapp_address_collection;
create policy whatsapp_address_collection_manage on public.whatsapp_address_collection
for update to authenticated using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

revoke all on function public.normalize_whatsapp_flow_reply(text) from public, anon;
revoke all on function public.enqueue_whatsapp_address_flow_message(uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.process_whatsapp_address_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.process_whatsapp_address_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant select, insert, update on public.whatsapp_address_automation_settings to service_role;
grant select, insert, update on public.whatsapp_address_collection to service_role;
