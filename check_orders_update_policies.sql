-- ============================================================
-- Vérification RLS UPDATE Policies sur orders
-- Pour confirmer que workspace_id est requis pour les updates
-- ============================================================

-- 1. Policies UPDATE actuelles sur orders
SELECT '=== POLICIES UPDATE SUR ORDERS ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. Toutes les policies sur orders (pour voir le pattern complet)
SELECT '=== TOUTES POLICIES SUR ORDERS ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY cmd, policyname;
