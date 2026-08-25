-- ============================================================
-- EcomOS · Multi-Tenant Infinite Recursion Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ensure get_my_workspace_id is defined correctly (security definer is key to bypassing recursion)
create or replace function public.get_my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;

-- 2. Drop the recursively written policies on workspaces
drop policy if exists "Users can read own workspace" on public.workspaces;
drop policy if exists "Users can update own workspace" on public.workspaces;

-- 3. Drop the recursively written policies on profiles
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can read profiles in their workspace" on public.profiles;

-- 4. Create new NON-RECURSIVE policies for workspaces
create policy "Users can read own workspace"
  on public.workspaces for select using ( id = public.get_my_workspace_id() );
create policy "Users can update own workspace"
  on public.workspaces for update using ( id = public.get_my_workspace_id() );

-- 5. Create new NON-RECURSIVE policies for profiles
create policy "Users can read profiles in their workspace"
  on public.profiles for select using ( 
    id = auth.uid() or workspace_id = public.get_my_workspace_id() 
  );
create policy "Users can update own profile"
  on public.profiles for update using ( id = auth.uid() );
