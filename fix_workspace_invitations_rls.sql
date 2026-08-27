-- ============================================================
-- Fix workspace_invitations RLS policies to remove auth.users queries
-- ============================================================

-- Drop ALL existing policies (including the problematic ones that query auth.users)
DROP POLICY IF EXISTS "workspace_members_can_view_workspace_invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "workspace_owners_can_manage_workspace_invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "workspace_owners_can_update_workspace_invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "invitees_can_read_own_invitation" ON public.workspace_invitations;
DROP POLICY IF EXISTS "invitees_can_update_own_invitation" ON public.workspace_invitations;

-- Create updated policies using profile_workspaces for permission checking
-- No direct auth.users queries - only use auth.uid() which is safe

CREATE POLICY "workspace_members_can_view_workspace_invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces 
      WHERE profile_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_owners_can_manage_workspace_invitations"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces
      WHERE profile_id = auth.uid() 
      AND (is_owner = true OR role IN ('owner','supervisor'))
      AND status = 'active'
    )
  );

CREATE POLICY "workspace_owners_can_update_workspace_invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces
      WHERE profile_id = auth.uid() 
      AND (is_owner = true OR role IN ('owner','supervisor'))
      AND status = 'active'
    )
  );

-- Note: We removed the invitee-specific policies that checked auth.users.email
-- Invitees can only see invitations after they're accepted via the Edge Function
-- which creates their profile_workspaces membership

-- Verify the new policies (should not show any auth.users references)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'workspace_invitations'
ORDER BY policyname;
