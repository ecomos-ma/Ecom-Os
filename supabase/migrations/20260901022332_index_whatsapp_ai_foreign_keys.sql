-- Supporting indexes for every non-leading WhatsApp AI foreign key.
create index if not exists whatsapp_ai_actions_order_id_idx
  on public.whatsapp_ai_actions(order_id);
create index if not exists whatsapp_ai_actions_inbound_message_id_idx
  on public.whatsapp_ai_actions(inbound_message_id)
  where inbound_message_id is not null;
create index if not exists whatsapp_order_changes_order_id_idx
  on public.whatsapp_order_changes(order_id);
create index if not exists whatsapp_order_changes_ai_action_id_idx
  on public.whatsapp_order_changes(ai_action_id)
  where ai_action_id is not null;
create index if not exists order_items_product_variant_id_idx
  on public.order_items(product_variant_id)
  where product_variant_id is not null;
