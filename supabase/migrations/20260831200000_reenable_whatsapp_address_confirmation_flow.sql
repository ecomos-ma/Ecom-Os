-- ============================================================================
-- 20260831200000: Re-enable the WhatsApp address confirmation flow
-- ============================================================================
-- This restores the behavior the business wants:
--   1) customer replies with the confirmation number
--   2) bot asks for their address
--   3) customer sends address
--   4) order address field is updated and order is marked confirmed
--
-- This migration is intentionally explicit and idempotent.

begin;

create table if not exists public.whatsapp_address_automation_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  initial_message text not null default E'Salam {{customer_name}} 👋\n\nBach nkemlo confirmation dyal commande, kteb 3.',
  start_aliases text[] not null default array['3'],
  address_prompt text not null default E'Mzyan ✅ kteb lina l''adresse kamla dyalk.',
  address_retry_message text not null default E'Smah lina, kteb l''adresse kamla b chi tafasil (quartier, rue, ville).',
  address_confirmation_message text not null default E'📍 L''adresse dyalk:\n{{address}}\n\nIla s7i7a, kteb 4 bach n2akdo talab.',
  confirmation_aliases text[] not null default array['4', 'confirm', 'oui', 'نعم'],
  change_address_enabled boolean not null default true,
  change_address_aliases text[] not null default array['5', 'change', 'modifier'],
  success_message text not null default E'Tm taكيد talab ✅',
  max_retries integer not null default 3 check (max_retries between 1 and 10),
  expires_after_minutes integer not null default 1440 check (expires_after_minutes between 5 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_address_automation_settings (
  workspace_id,
  enabled,
  start_aliases,
  address_prompt,
  address_retry_message,
  address_confirmation_message,
  confirmation_aliases,
  change_address_enabled,
  change_address_aliases,
  success_message,
  max_retries,
  expires_after_minutes
)
select
  ws.id,
  true,
  array['1']::text[],
  'Mzyan ✅ kteb lina l''adresse kamla dyalk.',
  'Smah lina, kteb l''adresse kamla b chi tafasil (quartier, rue, ville).',
  '📍 L''adresse dyalk:\n{{address}}\n\nIla s7i7a, kteb 4 bach n2akdo talab.',
  array['4', 'confirm', 'oui', 'نعم']::text[],
  true,
  array['5', 'change', 'modifier']::text[],
  'Tm taكيد talab ✅',
  3,
  1440
from public.workspaces ws
on conflict (workspace_id) do update
set enabled = true,
    start_aliases = excluded.start_aliases,
    address_prompt = excluded.address_prompt,
    address_retry_message = excluded.address_retry_message,
    address_confirmation_message = excluded.address_confirmation_message,
    confirmation_aliases = excluded.confirmation_aliases,
    change_address_enabled = excluded.change_address_enabled,
    change_address_aliases = excluded.change_address_aliases,
    success_message = excluded.success_message,
    max_retries = excluded.max_retries,
    expires_after_minutes = excluded.expires_after_minutes,
    updated_at = now();

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

create or replace function public.prepare_whatsapp_address_flow_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection_id uuid;
  v_collection public.whatsapp_address_collection%rowtype;
  v_settings public.whatsapp_address_automation_settings%rowtype;
begin
  if new.payload ->> 'address_step' = 'start' then
    new.payload := coalesce(new.payload, '{}'::jsonb) - 'text_template';
    return new;
  end if;

  if new.payload ->> 'address_step' <> 'confirm_address' then
    return new;
  end if;

  v_collection_id := nullif(new.payload ->> 'address_collection_id', '')::uuid;
  if v_collection_id is null then
    return new;
  end if;

  select c.* into v_collection
  from public.whatsapp_address_collection c
  where c.id = v_collection_id
    and c.workspace_id = new.workspace_id
  for update;
  if not found or v_collection.status <> 'waiting_for_address_confirmation' then
    return new;
  end if;

  select s.* into v_settings
  from public.whatsapp_address_automation_settings s
  where s.id = v_collection.automation_settings_id
    and s.workspace_id = new.workspace_id
    and s.enabled = true;
  if not found then
    return new;
  end if;

  update public.orders
  set status = 'confirmed',
      confirmation_method = 'whatsapp',
      confirmed_at = coalesce(confirmed_at, now()),
      whatsapp_replied_at = now(),
      whatsapp_last_action = 'confirmed_with_address_by_whatsapp',
      whatsapp_last_inbound_id = v_collection.last_inbound_id,
      updated_at = now()
  where workspace_id = new.workspace_id
    and "Order ID" = v_collection.order_id;

  if not found then
    raise exception 'Address automation could not find its order';
  end if;

  update public.whatsapp_address_collection
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = v_collection.id;

  update public.whatsapp_messages
  set reply_action = 'address_flow_confirm_order',
      processed_at = now()
  where id = v_collection.last_inbound_id;

  new.payload := (coalesce(new.payload, '{}'::jsonb) - 'text_template') || jsonb_build_object(
    'text_template', v_settings.success_message,
    'address_step', 'success',
    'order_confirmed_after_address', true
  );

  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (
    new.workspace_id,
    v_collection.order_id,
    'address_flow_completed',
    'info',
    'Address and order confirmed by WhatsApp Automation',
    jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id)
  );

  return new;
end;
$$;

drop trigger if exists whatsapp_prepare_address_flow_queue on public.whatsapp_queue;
create trigger whatsapp_prepare_address_flow_queue
before insert on public.whatsapp_queue
for each row execute function public.prepare_whatsapp_address_flow_queue();

create or replace function public.process_whatsapp_inbound(
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
        return jsonb_build_object('handled', true, 'action', 'address_flow_confirm_order', 'reply_queued', true, 'order_id', v_collection.order_id);
      end if;

      update public.whatsapp_messages
      set reply_action = 'address_flow_wrong_confirmation_reply', processed_at = now()
      where id = v_message_id;
      return jsonb_build_object('handled', true, 'action', 'address_flow_wrong_confirmation_reply', 'order_id', v_collection.order_id);
    end if;
  end if;

  if not exists (
    select 1 from unnest(v_settings.start_aliases) alias
    where public.normalize_whatsapp_flow_reply(alias) = v_body_normalized
  ) then
    return jsonb_build_object('handled', false);
  end if;

  insert into public.whatsapp_address_collection (
    workspace_id, order_id, normalized_phone, automation_settings_id, status, requested_at, expires_at
  )
  select q.workspace_id,
         q.order_id,
         v_phone,
         v_settings.id,
         'waiting_for_address',
         now(),
         now() + make_interval(mins => v_settings.expires_after_minutes)
  from public.whatsapp_queue q
  where q.workspace_id = p_workspace_id
    and q.normalized_phone = v_phone
    and q.status in ('sent', 'delivered', 'read')
    and q.sent_at >= now() - make_interval(mins => v_settings.expires_after_minutes)
    and q.automation_event = 'confirmation'
  order by q.sent_at desc
  limit 1
  on conflict do nothing
  returning * into v_collection;

  if not found then
    return jsonb_build_object('handled', true, 'manual_review', true, 'action', 'address_flow_start_conflict');
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

  update public.whatsapp_address_collection
  set last_inbound_id = v_message_id, updated_at = now()
  where id = v_collection.id;

  update public.whatsapp_messages
  set reply_action = 'address_flow_start', processed_at = now()
  where id = v_message_id;

  perform public.enqueue_whatsapp_address_flow_message(
    p_workspace_id, v_collection.order_id, p_phone, v_phone, v_settings.id, v_collection.id,
    'ask_address', v_settings.address_prompt,
      'address-flow:' || v_collection.id::text || ':ask:' || coalesce(p_provider_event_id, v_message_id::text),
    v_collection.expires_at
  );

  return jsonb_build_object(
    'handled', true,
    'action', 'address_flow_start',
    'reply_queued', true,
    'order_id', v_collection.order_id
  );
end;
$$;

revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  to service_role;

commit;
