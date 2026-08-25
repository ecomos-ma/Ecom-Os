-- Check RLS policies on workspaces table
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
WHERE tablename IN ('workspaces', 'orders')
ORDER BY tablename, policyname;
