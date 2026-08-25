-- ============================================================
-- FINAL VERIFICATION - Orders Update Fix
-- ============================================================

-- 1. Verify the actual primary key
SELECT '=== PRIMARY KEY ORDERS ===' as step;
SELECT 
  kcu.column_name as primary_key_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_name = 'orders'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 2. Verify UPDATE policies exist
SELECT '=== UPDATE POLICIES ORDERS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 3. Test that a sample order can be updated
SELECT '=== TEST UPDATE WORKSPACE NURA ===' as step;
-- First get a sample order ID
SELECT '"Order ID"', order_number, workspace_id
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
LIMIT 1;
