-- ============================================================
-- DIAGNOSTIC: Check workspace_invitations table and RLS policies
-- ============================================================

-- Check if workspace_invitations table exists
SELECT '=== WORKSPACE_INVITATIONS TABLE STRUCTURE ===' as step;
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'workspace_invitations'
ORDER BY ordinal_position;

-- Check RLS policies on workspace_invitations
SELECT '=== RLS POLICIES ON workspace_invitations ===' as step;
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
WHERE tablename = 'workspace_invitations';

-- Check if there are any views that depend on auth.users
SELECT '=== VIEWS THAT MIGHT DEPEND ON auth.users ===' as step;
SELECT 
  viewname,
  definition
FROM pg_views
WHERE definition ILIKE '%auth.users%'
OR definition ILIKE '%users%';

-- Check for any functions that might query auth.users
SELECT '=== FUNCTIONS THAT MIGHT DEPEND ON auth.users ===' as step;
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (routine_definition ILIKE '%auth.users%'
OR routine_definition ILIKE '%users%')
LIMIT 10;
