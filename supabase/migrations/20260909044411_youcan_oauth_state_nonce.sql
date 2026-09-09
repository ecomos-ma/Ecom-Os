-- Opaque, expiring, single-use YouCan OAuth state bound to user and workspace.

create table if not exists public.youcan_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists youcan_oauth_states_expiry_idx
  on public.youcan_oauth_states(expires_at)
  where consumed_at is null;
create index if not exists youcan_oauth_states_user_idx
  on public.youcan_oauth_states(user_id);
create index if not exists youcan_oauth_states_workspace_idx
  on public.youcan_oauth_states(workspace_id);

alter table public.youcan_oauth_states enable row level security;
revoke all on table public.youcan_oauth_states from public, anon, authenticated;
grant all on table public.youcan_oauth_states to service_role;

comment on table public.youcan_oauth_states is
  'Server-only hashes of short-lived, single-use YouCan OAuth nonces.';
