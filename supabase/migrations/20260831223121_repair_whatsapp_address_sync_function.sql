-- Atomic repair for the confirmation + address queue sync trigger.
-- Run this file as a whole. The named delimiter prevents accidental confusion
-- with unrelated dollar-quoted text copied into the Supabase SQL editor.
create or replace function public.sync_whatsapp_address_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
    workspace_id,
    order_id,
    normalized_phone,
    status,
    conversation_state,
    remote_jid,
    confirmation_queue_id,
    requested_at,
    expires_at,
    updated_at
  ) values (
    new.workspace_id,
    new.order_id,
    new.normalized_phone,
    'waiting_confirmation',
    'awaiting_confirmation',
    new.remote_jid,
    new.id,
    coalesce(new.sent_at, now()),
    coalesce(new.sent_at, now())
      + make_interval(mins => greatest(v_settings.reply_context_hours * 60, 5)),
    now()
  )
  on conflict (workspace_id, normalized_phone) do update
  set order_id = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.order_id
        else excluded.order_id
      end,
      status = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.status
        else 'waiting_confirmation'
      end,
      conversation_state = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.conversation_state
        else 'awaiting_confirmation'
      end,
      remote_jid = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.remote_jid
        else excluded.remote_jid
      end,
      confirmation_queue_id = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.confirmation_queue_id
        else excluded.confirmation_queue_id
      end,
      requested_at = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.requested_at
        else excluded.requested_at
      end,
      expires_at = case
        when whatsapp_address_collection.conversation_state = 'awaiting_address'
          then whatsapp_address_collection.expires_at
        else excluded.expires_at
      end,
      updated_at = now();

  return new;
end;
$function$;

revoke execute on function public.sync_whatsapp_address_conversation()
  from public, anon, authenticated;

drop trigger if exists whatsapp_sync_address_conversation
  on public.whatsapp_queue;

create trigger whatsapp_sync_address_conversation
after insert or update of status, remote_jid, wa_message_id
on public.whatsapp_queue
for each row
execute function public.sync_whatsapp_address_conversation();

notify pgrst, 'reload schema';
