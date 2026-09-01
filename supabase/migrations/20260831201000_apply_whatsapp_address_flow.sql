-- ============================================================================
-- FINAL: Apply WhatsApp Address Confirmation Automation
-- ============================================================================
-- This is a clean, idempotent migration that ensures the WhatsApp
-- address automation is properly configured and working.

create table if not exists public.whatsapp_address_automation_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  initial_message text not null default 'Salam {{customer_name}} - Bach nkemlo confirmation dyal commande, kteb 3.',
  start_aliases text[] not null default array['3'],
  address_prompt text not null default 'Mzyan kteb lina l''adresse kamla dyalk.',
  address_retry_message text not null default 'Smah lina, kteb l''adresse kamla b chi tafasil (quartier, rue, ville).',
  address_confirmation_message text not null default 'L''adresse dyalk: {{address}} - Ila s7i7a, kteb 4 bach n2akdo talab.',
  confirmation_aliases text[] not null default array['4', 'confirm', 'oui'],
  change_address_enabled boolean not null default true,
  change_address_aliases text[] not null default array['5', 'change', 'modifier'],
  success_message text not null default 'Tm ta7fat talab',
  max_retries integer not null default 3 check (max_retries between 1 and 10),
  expires_after_minutes integer not null default 1440 check (expires_after_minutes between 5 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert or update automation settings for all workspaces
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
  'Mzyan kteb lina l''adresse kamla dyalk.',
  'Smah lina, kteb l''adresse kamla b chi tafasil (quartier, rue, ville).',
  'L''adresse dyalk: {{address}} - Ila s7i7a, kteb 4 bach n2akdo talab.',
  array['4', 'confirm', 'oui']::text[],
  true,
  array['5', 'change', 'modifier']::text[],
  'Tm ta7fat talab',
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

-- Main WhatsApp inbound processing function
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
  v_body_normalized text;
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

  v_body_normalized := lower(trim(replace(replace(coalesce(p_body, ''), chr(65039), ''), chr(8419), '')));

  select * into v_settings
  from public.whatsapp_address_automation_settings
  where workspace_id = p_workspace_id and enabled = true;

  if not found then
    return jsonb_build_object('handled', false, 'reason', 'automation_disabled');
  end if;

  -- Check for opt-out actions
  select exists (
    select 1
    from public.whatsapp_reply_actions a
    cross join lateral unnest(a.keywords) keyword
    where a.workspace_id = p_workspace_id
      and a.enabled
      and a.action = 'opt_out'
      and lower(trim(keyword)) = v_body_normalized
  ) into v_is_opt_out;
  
  if v_is_opt_out then
    return jsonb_build_object('handled', false, 'reason', 'opted_out');
  end if;

  -- Look for existing address collection flow
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
    -- Check if expired
    if v_collection.expires_at <= now() then
      update public.whatsapp_address_collection
      set status = 'expired', updated_at = now()
      where id = v_collection.id;
      return jsonb_build_object('handled', true, 'expired', true, 'order_id', v_collection.order_id);
    end if;

    -- Process inbound message
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

    -- Handle waiting for start reply (confirmation number)
    if v_collection.status = 'waiting_for_start_reply' then
      if exists (
        select 1 from unnest(v_settings.start_aliases) alias
        where lower(trim(alias)) = v_body_normalized
      ) then
        update public.whatsapp_address_collection
        set status = 'waiting_for_address', last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;

        insert into public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, channel_sequence, payload, status,
          scheduled_for, expires_at, attempts, max_attempts
        ) values (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', array['text'],
          jsonb_build_object(
            'text_template', v_settings.address_prompt,
            'address_flow_id', v_settings.id,
            'address_collection_id', v_collection.id,
            'address_step', 'ask_address'
          ),
          'pending', now(), v_collection.expires_at, 0, 3
        );

        update public.whatsapp_messages
        set reply_action = 'address_flow_start', processed_at = now()
        where id = v_message_id;
        
        return jsonb_build_object('handled', true, 'action', 'address_flow_start', 'order_id', v_collection.order_id);
      end if;

      update public.whatsapp_messages
      set reply_action = 'address_flow_wrong_start', processed_at = now()
      where id = v_message_id;
      return jsonb_build_object('handled', true, 'action', 'wrong_start_reply', 'order_id', v_collection.order_id);
    end if;

    -- Handle waiting for address
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
        set reply_action = 'address_flow_invalid', processed_at = now()
        where id = v_message_id;

        insert into public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, channel_sequence, payload, status,
          scheduled_for, expires_at, attempts, max_attempts
        ) values (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', array['text'],
          jsonb_build_object(
            'text_template', v_settings.address_retry_message,
            'address_flow_id', v_settings.id,
            'address_collection_id', v_collection.id,
            'address_step', 'retry_address'
          ),
          'pending', now(), v_collection.expires_at, 0, 3
        );

        return jsonb_build_object('handled', true, 'action', 'address_flow_invalid', 'order_id', v_collection.order_id);
      end if;

      -- Address is valid - save it
      update public.orders
      set address = v_body,
          address_source = 'whatsapp_automation',
          whatsapp_replied_at = now(),
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
      set reply_action = 'address_flow_saved', processed_at = now()
      where id = v_message_id;

      insert into public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, channel_sequence, payload, status,
        scheduled_for, expires_at, attempts, max_attempts
      ) values (
        p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
        'address_confirmation', array['text'],
        jsonb_build_object(
          'text_template', replace(v_settings.address_confirmation_message, '{{address}}', v_body),
          'address_flow_id', v_settings.id,
          'address_collection_id', v_collection.id,
          'address_step', 'confirm_address'
        ),
        'pending', now(), v_collection.expires_at, 0, 3
      );

      return jsonb_build_object('handled', true, 'action', 'address_flow_saved', 'order_id', v_collection.order_id);
    end if;

    -- Handle waiting for address confirmation
    if v_collection.status = 'waiting_for_address_confirmation' then
      -- Check if user wants to change address
      if v_settings.change_address_enabled and exists (
        select 1 from unnest(v_settings.change_address_aliases) alias
        where lower(trim(alias)) = v_body_normalized
      ) then
        update public.whatsapp_address_collection
        set status = 'waiting_for_address', attempts = 0, last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;

        update public.whatsapp_messages
        set reply_action = 'address_flow_change', processed_at = now()
        where id = v_message_id;

        insert into public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, channel_sequence, payload, status,
          scheduled_for, expires_at, attempts, max_attempts
        ) values (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', array['text'],
          jsonb_build_object(
            'text_template', v_settings.address_prompt,
            'address_flow_id', v_settings.id,
            'address_collection_id', v_collection.id,
            'address_step', 'ask_address_again'
          ),
          'pending', now(), v_collection.expires_at, 0, 3
        );

        return jsonb_build_object('handled', true, 'action', 'address_flow_change', 'order_id', v_collection.order_id);
      end if;

      -- Check if user confirms
      if exists (
        select 1 from unnest(v_settings.confirmation_aliases) alias
        where lower(trim(alias)) = v_body_normalized
      ) then
        update public.orders
        set status = 'confirmed',
            confirmation_method = 'whatsapp',
            confirmed_at = coalesce(confirmed_at, now()),
            whatsapp_replied_at = now(),
            updated_at = now()
        where workspace_id = p_workspace_id and "Order ID" = v_collection.order_id;

        update public.whatsapp_address_collection
        set status = 'completed', completed_at = now(), last_inbound_id = v_message_id, updated_at = now()
        where id = v_collection.id;

        update public.whatsapp_messages
        set reply_action = 'address_flow_confirmed', processed_at = now()
        where id = v_message_id;

        insert into public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, channel_sequence, payload, status,
          scheduled_for, expires_at, attempts, max_attempts
        ) values (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', array['text'],
          jsonb_build_object(
            'text_template', v_settings.success_message,
            'address_flow_id', v_settings.id,
            'address_collection_id', v_collection.id,
            'address_step', 'success'
          ),
          'pending', now(), now() + interval '24 hours', 0, 3
        );

        return jsonb_build_object('handled', true, 'action', 'address_flow_confirmed', 'order_id', v_collection.order_id);
      end if;

      update public.whatsapp_messages
      set reply_action = 'address_flow_wrong_confirmation', processed_at = now()
      where id = v_message_id;
      return jsonb_build_object('handled', true, 'action', 'wrong_confirmation', 'order_id', v_collection.order_id);
    end if;
  end if;

  return jsonb_build_object('handled', false, 'reason', 'no_active_flow');
end;
$$;

-- Grant permissions
revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  to service_role;
