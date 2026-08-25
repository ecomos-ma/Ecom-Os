-- ============================================================
-- CHECK RLS POLICIES ON youcan_credentials TABLE
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
WHERE tablename = 'youcan_credentials';
