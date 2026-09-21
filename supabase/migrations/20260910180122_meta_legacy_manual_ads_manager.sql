-- Separate, manual-token Meta Ads connection. This intentionally does not
-- share credentials or lifecycle with the OAuth-based Meta Ads V2 manager.
create table if not exists public.meta_legacy_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  configured_by uuid references auth.users(id) on delete set null,
  ad_account_id text not null,
  access_token_encrypted text,
  account_name text,
  currency text,
  timezone_name text,
  account_status integer,
  status text not null default 'connected'
    check (status in ('connected', 'syncing', 'sync_failed', 'reauth_required', 'disconnected')),
  token_checked_at timestamptz,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_legacy_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_legacy_connections(id) on delete cascade,
  meta_campaign_id text not null,
  campaign_name text not null,
  status text not null default 'UNKNOWN',
  budget numeric(16, 2),
  spend numeric(16, 2) not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(12, 4) not null default 0,
  cpc numeric(16, 4) not null default 0,
  cpm numeric(16, 4) not null default 0,
  frequency numeric(12, 4) not null default 0,
  results numeric(16, 2) not null default 0,
  cost_per_result numeric(16, 4) not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, meta_campaign_id)
);

create index if not exists meta_legacy_campaigns_workspace_spend_idx
  on public.meta_legacy_campaigns (workspace_id, spend desc);
create index if not exists meta_legacy_campaigns_connection_idx
  on public.meta_legacy_campaigns (connection_id);

drop trigger if exists set_meta_legacy_connections_updated_at on public.meta_legacy_connections;
create trigger set_meta_legacy_connections_updated_at
  before update on public.meta_legacy_connections
  for each row execute function public.meta_set_updated_at();

drop trigger if exists set_meta_legacy_campaigns_updated_at on public.meta_legacy_campaigns;
create trigger set_meta_legacy_campaigns_updated_at
  before update on public.meta_legacy_campaigns
  for each row execute function public.meta_set_updated_at();

alter table public.meta_legacy_connections enable row level security;
alter table public.meta_legacy_campaigns enable row level security;

-- Credentials are server-only. Even the encrypted value is never exposed to
-- browser roles; status is returned by the authenticated Edge Function.
revoke all on public.meta_legacy_connections from public, anon, authenticated;
revoke all on public.meta_legacy_campaigns from public, anon, authenticated;
grant select on public.meta_legacy_campaigns to authenticated;

drop policy if exists meta_legacy_campaigns_select on public.meta_legacy_campaigns;
create policy meta_legacy_campaigns_select
  on public.meta_legacy_campaigns
  for select
  to authenticated
  using ((select public.meta_can_access_workspace(workspace_id)));
