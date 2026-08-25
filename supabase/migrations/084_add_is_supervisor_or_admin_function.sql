-- ============================================================
-- Add is_supervisor_or_admin() function for workspace subscription management
-- This function allows both supervisors and super_admins to manage workspace subscriptions
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

-- Verify the function works
SELECT 'is_supervisor_or_admin function created' as status;
