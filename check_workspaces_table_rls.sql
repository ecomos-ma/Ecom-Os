-- ============================================================
-- CHECK RLS POLICIES ON workspaces TABLE
-- ============================================================

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
WHERE tablename = 'workspaces';
