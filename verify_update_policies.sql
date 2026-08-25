-- ============================================================
-- Vérification si les policies UPDATE existent déjà
-- ============================================================

-- 1. Vérifier policies UPDATE sur orders
SELECT '=== POLICIES UPDATE SUR ORDERS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. Vérifier policies UPDATE sur customers
SELECT '=== POLICIES UPDATE SUR CUSTOMERS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'customers' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 3. Vérifier si les policies supervisors existent
SELECT '=== VÉRIFICATION POLICIES SUPERVISORS ===' as step;
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'orders' 
      AND policyname = 'Supervisors and admins can update workspace orders'
      AND cmd = 'UPDATE'
    ) THEN '✅ Orders UPDATE policy exists'
    ELSE '❌ Orders UPDATE policy missing'
  END as orders_policy,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'customers' 
      AND policyname = 'Supervisors and admins can update workspace customers'
      AND cmd = 'UPDATE'
    ) THEN '✅ Customers UPDATE policy exists'
    ELSE '❌ Customers UPDATE policy missing'
  END as customers_policy;
