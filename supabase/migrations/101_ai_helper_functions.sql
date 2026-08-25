-- 101_ai_helper_functions.sql
-- Helper functions for AI infrastructure

-- Check if user is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce((select role from public.profiles where id = auth.uid()), '') = 'super_admin';
$$;

-- Get user's workspace ID
CREATE OR REPLACE FUNCTION public.get_user_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
