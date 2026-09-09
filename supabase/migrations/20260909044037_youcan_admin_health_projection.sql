-- Extend the safe admin-only YouCan projection with provider account health.

drop function if exists public.admin_get_youcan_integrations_v2();
create function public.admin_get_youcan_integrations_v2()
returns table (
  workspace_id uuid,
  connected boolean,
  status text,
  store_name text,
  external_store_id text,
  store_domain text,
  store_currency text,
  webhook_health text,
  webhook_last_received_at timestamptz,
  last_full_sync_at timestamptz,
  needs_reconnect boolean,
  balance numeric,
  due_amount numeric,
  unpaid_invoices_amount numeric,
  last_finance_sync_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.workspace_id,
    i.status = 'active',
    i.status,
    i.store_name,
    i.external_store_id,
    i.store_domain,
    i.store_currency,
    i.webhook_health,
    i.webhook_last_received_at,
    i.last_full_sync_at,
    i.needs_reconnect,
    finance.balance,
    finance.due_amount,
    finance.unpaid_invoices_amount,
    finance.captured_at
  from public.integrations i
  left join lateral (
    select snapshot.balance, snapshot.due_amount, snapshot.unpaid_invoices_amount, snapshot.captured_at
    from public.youcan_financial_snapshots snapshot
    where snapshot.integration_id = i.id
    order by snapshot.captured_at desc
    limit 1
  ) finance on true
  where i.provider = 'youcan'
    and public.has_platform_permission('workspaces.read');
$$;
revoke all on function public.admin_get_youcan_integrations_v2() from public, anon;
grant execute on function public.admin_get_youcan_integrations_v2() to authenticated, service_role;
