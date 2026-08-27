-- ============================================================
-- Check workspace_invitations RLS policies
-- ============================================================

-- Check RLS status
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'workspace_invitations';

-- Check all RLS policies on workspace_invitations
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

-- Check if any policies reference auth.users
SELECT 
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'workspace_invitations'
AND (qual ILIKE '%users%' OR with_check ILIKE '%users%');
