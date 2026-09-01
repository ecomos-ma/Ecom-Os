-- Fix RLS policies to resolve "Database error granting user" during login
-- This ensures users can access their own profiles and workspaces

-- Drop all existing RLS policies on profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_workspace" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read profiles in their workspace" ON public.profiles;

-- Recreate proper RLS policies
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Drop all existing RLS policies on workspaces
DROP POLICY IF EXISTS "workspaces_select_own" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_own" ON public.workspaces;
DROP POLICY IF EXISTS "Users can read own workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Users can update own workspace" ON public.workspaces;

-- Recreate proper RLS policies for workspaces
CREATE POLICY "workspaces_select_own"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "workspaces_update_own"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
