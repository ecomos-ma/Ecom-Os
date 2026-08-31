-- Two confirmation modes:
--   1. Confirmation only: reply 1 is handled by the existing reply action.
--   2. Confirmation + address: reply 1 opens address collection, and a valid
--      address confirms both the address and the order in one durable queue job.
--
-- Keep existing seller-authored confirmation text/audio as the opening message
-- for mode 2.  Older flows replaced it with a separate address-start template.

update public.whatsapp_address_automation_settings
set start_aliases = array['1']::text[],
    updated_at = now()
where enabled = true
  and start_aliases = array['3']::text[];

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
  -- The confirmation rule (including any ordered text and voice-note steps) is
  -- the first message in the address mode as well.  This removes only the old
  -- override, never a seller's message content.
  if new.payload ->> 'address_step' = 'start' then
    new.payload := coalesce(new.payload, '{}'::jsonb) - 'text_template';
    return new;
  end if;

  -- The existing inbound RPC saves a valid address then queues this internal
  -- confirm-address response.  Convert that one queued response into the final
  -- success response before it can be claimed by the worker.  The update and
  -- message stay in the same database transaction, so no extra confirmation
  -- reply or duplicate customer message is possible.
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

revoke all on function public.prepare_whatsapp_address_flow_queue() from public, anon, authenticated;
