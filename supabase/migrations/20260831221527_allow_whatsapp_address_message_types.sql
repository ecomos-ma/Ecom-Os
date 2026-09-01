-- Preserve the existing message-type vocabulary and add the three durable
-- stages emitted by Confirmation + Address.
alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_type_v2_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_type_v2_check check (
    message_type is null or message_type in (
      'confirmation', 'delivery', 'status_update', 'confirmed', 'callback',
      'opt_out', 'confirm', 'cancelled', 'modification', 'custom', 'test',
      'reply', 'unmatched', 'address', 'address_empty', 'address_error'
    )
  );
