-- YouCan V2 production advisor reconciliation.
-- Keep operational queues server-only and add the foreign-key indexes used by cleanup/reconciliation.

revoke all on table public.youcan_tokens from public, anon, authenticated;
revoke all on table public.youcan_order_counters from public, anon, authenticated;
grant all on table public.youcan_tokens to service_role;
grant all on table public.youcan_order_counters to service_role;

revoke all on table public.youcan_order_items from public, anon, authenticated;
revoke all on table public.integration_field_mappings from public, anon, authenticated;
revoke all on table public.youcan_financial_snapshots from public, anon, authenticated;
grant select on table public.youcan_order_items to authenticated;
grant select on table public.integration_field_mappings to authenticated;
grant select on table public.youcan_financial_snapshots to authenticated;

revoke all on function public.activate_youcan_integration(uuid) from public, anon, authenticated;
revoke all on function public.deactivate_youcan_integration(uuid) from public, anon, authenticated;
revoke all on function public.is_youcan_integration_active(uuid) from public, anon, authenticated;
revoke all on function public.get_next_youcan_order_number(uuid) from public, anon, authenticated;
grant execute on function public.activate_youcan_integration(uuid) to service_role;
grant execute on function public.deactivate_youcan_integration(uuid) to service_role;
grant execute on function public.is_youcan_integration_active(uuid) to service_role;
grant execute on function public.get_next_youcan_order_number(uuid) to service_role;
alter function public.get_next_youcan_order_number(uuid) set search_path = public, pg_temp;

create index if not exists youcan_order_items_integration_idx
  on public.youcan_order_items(integration_id);
create index if not exists youcan_order_items_order_idx
  on public.youcan_order_items(order_id);
create index if not exists youcan_sync_jobs_integration_idx
  on public.youcan_sync_jobs(integration_id);
create index if not exists youcan_webhook_deliveries_workspace_idx
  on public.youcan_webhook_deliveries(workspace_id);
create index if not exists youcan_webhook_subscriptions_integration_idx
  on public.youcan_webhook_subscriptions(integration_id);
create index if not exists youcan_tokens_workspace_idx
  on public.youcan_tokens(workspace_id);

-- These tables intentionally have RLS with no browser policies. The service role bypasses RLS.
comment on table public.youcan_sync_jobs is
  'Server-only YouCan reconciliation queue. RLS has no browser policies by design.';
comment on table public.youcan_webhook_deliveries is
  'Server-only signed webhook delivery ledger. RLS has no browser policies by design.';
comment on table public.youcan_webhook_subscriptions is
  'Server-only provider webhook registry. RLS has no browser policies by design.';
