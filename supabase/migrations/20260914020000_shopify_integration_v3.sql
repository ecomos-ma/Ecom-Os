begin;

-- ============================================================================
-- Shopify Integration V3 Schema
--
-- Modular table design with encrypted credentials and strict service_role 
-- isolation. Adheres to the established workspace scoping and RLS patterns.
-- ============================================================================

create table if not exists public.shopify_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_domain text not null,
  access_token_encrypted text not null,
  token_encryption_version integer not null default 0,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, shop_domain)
);

-- Opaque, expiring, single-use Shopify OAuth state bound to user and workspace.
create table if not exists public.shopify_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_domain text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add indexes for lookup performance
create index if not exists shopify_credentials_workspace_idx on public.shopify_credentials(workspace_id);
create index if not exists shopify_oauth_states_expiry_idx on public.shopify_oauth_states(expires_at) where consumed_at is null;

-- Enable RLS
alter table public.shopify_credentials enable row level security;
alter table public.shopify_oauth_states enable row level security;

-- STRICT ISOLATION: 
-- Credentials must NEVER be sent to the frontend, even encrypted.
revoke all on public.shopify_credentials from public, anon, authenticated;
grant all on public.shopify_credentials to service_role;

revoke all on public.shopify_oauth_states from public, anon, authenticated;
grant all on public.shopify_oauth_states to service_role;

-- Helper function so the frontend can check connection status securely 
create or replace function public.get_shopify_connection_status_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cred public.shopify_credentials;
begin
  if not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  select * into cred from public.shopify_credentials
  where workspace_id = p_workspace_id
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('connected', false);
  end if;

  return jsonb_build_object(
    'connected', cred.status = 'active',
    'status', cred.status,
    'shop_domain', cred.shop_domain,
    'scopes', cred.scopes,
    'updated_at', cred.updated_at
  );
end;
$$;
revoke all on function public.get_shopify_connection_status_v1(uuid) from public, anon;
grant execute on function public.get_shopify_connection_status_v1(uuid) to authenticated, service_role;

commit;
