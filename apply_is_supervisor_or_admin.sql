-- Execute this in Supabase SQL Editor or via psql
-- ============================================================
-- Add is_supervisor_or_admin() function for workspace subscription management
-- ============================================================

-- Create function that checks if user is supervisor OR super_admin
CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce((select role from public.profiles where id = auth.uid()), '') IN ('supervisor', 'super_admin');
$$;

-- Update the workspace_subscriptions policy to use the new function
DROP POLICY IF EXISTS "supervisors_can_manage_workspace_subscriptions" ON public.workspace_subscriptions;
CREATE POLICY "supervisors_can_manage_workspace_subscriptions"
  ON public.workspace_subscriptions FOR ALL
  USING (public.is_supervisor_or_admin())
  WITH CHECK (public.is_supervisor_or_admin());

-- Verify the function exists
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'is_supervisor_or_admin';
