-- ============================================================
-- DIAGNOSTIC: Check workspaces table schema
-- ============================================================

-- Show all columns in workspaces table
SELECT '=== WORKSPACES TABLE SCHEMA ===' as step;
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'workspaces'
ORDER BY ordinal_position;

-- Check if youcan_shop_id exists
SELECT '=== CHECK youcan_shop_id COLUMN ===' as step;
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'workspaces' 
      AND column_name = 'youcan_shop_id'
    ) THEN '✅ youcan_shop_id EXISTS'
    ELSE '❌ youcan_shop_id DOES NOT EXIST'
  END as column_status;

-- Check if youcan_token exists
SELECT '=== CHECK youcan_token COLUMN ===' as step;
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'workspaces' 
      AND column_name = 'youcan_token'
    ) THEN '✅ youcan_token EXISTS'
    ELSE '❌ youcan_token DOES NOT EXIST'
  END as column_status;

-- Check all youcan-related columns
SELECT '=== ALL youcan RELATED COLUMNS ===' as step;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'workspaces'
AND column_name ILIKE '%youcan%'
ORDER BY column_name;
