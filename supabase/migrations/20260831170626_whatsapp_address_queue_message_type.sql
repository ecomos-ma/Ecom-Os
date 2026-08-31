-- Address-flow replies use the existing valid queue message type.  The
-- address_step in payload remains the durable workflow discriminator.
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

revoke all on function public.enqueue_whatsapp_address_flow_message(uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_whatsapp_address_flow_message(uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz) to service_role;
