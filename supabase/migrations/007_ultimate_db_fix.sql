-- ============================================================
-- EcomOS · Final RLS Fix — replaces 007_ultimate_db_fix.sql
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Fix get_my_workspace_id() — use auth.uid() (safe, never returns '')
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Drop every broken policy that used coalesce(...,'')::uuid
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Select own profile"                    on public.profiles;
drop policy if exists "Select workspace profiles"             on public.profiles;
drop policy if exists "Update own profile"                    on public.profiles;
drop policy if exists "Users can read own profile"            on public.profiles;
drop policy if exists "Users can update own profile"          on public.profiles;
drop policy if exists "Users can read profiles in their workspace" on public.profiles;

drop policy if exists "Select own workspace"                  on public.workspaces;
drop policy if exists "Update own workspace"                  on public.workspaces;
drop policy if exists "Users can read own workspace"          on public.workspaces;
drop policy if exists "Users can update own workspace"        on public.workspaces;

-- ─────────────────────────────────────────────────────────────
-- 3. Recreate all policies using auth.uid() only (Idempotent)
-- ─────────────────────────────────────────────────────────────

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using ( id = auth.uid() );

drop policy if exists "profiles_select_workspace" on public.profiles;
create policy "profiles_select_workspace"
  on public.profiles for select
  using ( workspace_id = public.get_my_workspace_id() );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ( id = auth.uid() );

-- Workspaces
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
  on public.workspaces for select
  using ( id = public.get_my_workspace_id() );

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
  on public.workspaces for update
  using ( id = public.get_my_workspace_id() )
  with check ( id = public.get_my_workspace_id() );

-- ─────────────────────────────────────────────────────────────
-- 4. Ensure workspaces also has RLS enabled
-- ─────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 5. Fix handle_new_user trigger (safe & idempotent version)
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User');
  v_workspace_name := coalesce(new.raw_user_meta_data->>'workspace_name', v_full_name || '''s Workspace');

  insert into public.workspaces (name)
  values (v_workspace_name)
  returning id into v_workspace_id;

  insert into public.profiles (id, full_name, role, workspace_id)
  values (new.id, v_full_name, 'owner', v_workspace_id)
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        full_name    = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
