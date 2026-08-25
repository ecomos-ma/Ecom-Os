-- Fix: column reference "email" is ambiguous in get_my_pending_workspace_invitation
-- The previous version of this function (before migration 111) had an unqualified
-- email reference that caused ambiguity. This migration re-deploys the function
-- with fully table-alias-qualified column references to ensure it works even
-- if the database has an older installed version.
-- NOTE: allowed_sections is text[] in the live DB (not jsonb).

-- Drop first to allow return type change
DROP FUNCTION IF EXISTS public.get_my_pending_workspace_invitation();

CREATE OR REPLACE FUNCTION public.get_my_pending_workspace_invitation()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  email text,
  role text,
  allowed_sections text[],
  status text,
  created_at timestamptz,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT wi.id, wi.workspace_id, wi.email, wi.role, wi.allowed_sections,
         wi.status, wi.created_at, wi.user_id
  FROM public.workspace_invitations wi
  WHERE wi.status = 'pending'
    AND lower(wi.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ORDER BY wi.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_workspace_invitation() TO authenticated;
