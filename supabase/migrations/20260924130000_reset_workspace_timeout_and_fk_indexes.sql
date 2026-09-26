-- The service-only workspace reset touches many child tables. PostgREST's
-- default 8-second statement timeout cancels it while FK triggers inspect
-- whatsapp_events for each deleted order. Keep the exception scoped to this
-- confirmed owner-only routine instead of raising the timeout for every API.
create index if not exists whatsapp_events_order_id_reset_idx
  on public.whatsapp_events (order_id);
create index if not exists whatsapp_manual_reviews_order_id_reset_idx
  on public.whatsapp_manual_reviews (order_id);
create index if not exists whatsapp_messages_conversation_id_reset_idx
  on public.whatsapp_messages (conversation_id);
create index if not exists whatsapp_messages_reply_to_message_id_reset_idx
  on public.whatsapp_messages (reply_to_message_id);
create index if not exists customers_source_integration_id_reset_idx
  on public.customers (source_integration_id);
create index if not exists product_variants_source_integration_id_reset_idx
  on public.product_variants (source_integration_id);
create index if not exists products_source_integration_id_reset_idx
  on public.products (source_integration_id);

alter function public.reset_workspace_data_v2(uuid, uuid, text)
  set statement_timeout = '90s';
