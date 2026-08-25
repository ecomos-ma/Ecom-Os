-- ============================================================
-- Vérification des Policies RLS Actuelles
-- À exécuter DIRECTEMENT dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Orders policies actuelles
SELECT '=== POLICIES ORDERS ===' as info;
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
WHERE tablename = 'orders';

-- 2. Workspaces policies actuelles
SELECT '=== POLICIES WORKSPACES ===' as info;
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

-- 3. Customers policies actuelles
SELECT '=== POLICIES CUSTOMERS ===' as info;
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
WHERE tablename = 'customers';

-- 4. Ozon cities policies actuelles
SELECT '=== POLICIES OZON_CITIES ===' as info;
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
WHERE tablename = 'ozon_cities';

-- 5. Profiles policies actuelles
SELECT '=== POLICIES PROFILES ===' as info;
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
WHERE tablename = 'profiles';

-- 6. Fonctions liées au workspace
SELECT '=== FONCTIONS WORKSPACE ===' as info;
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
  p.proname LIKE '%workspace%' 
  OR p.proname LIKE '%is_supervisor%'
  OR p.proname LIKE '%get_my_workspace%'
);

-- 7. Test direct : COUNT ALL orders (bypass RLS)
SELECT '=== TEST DIRECT ORDERS (BYPASS RLS) ===' as info;
SELECT COUNT(*) as total_orders_all_workspaces
FROM orders;

-- 8. Test direct : COUNT ALL workspaces (bypass RLS)
SELECT '=== TEST DIRECT WORKSPACES (BYPASS RLS) ===' as info;
SELECT COUNT(*) as total_workspaces, 
       (SELECT COUNT(*) FROM orders WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920') as nura_orders
FROM workspaces;

-- 9. Test direct : COUNT orders par workspace
SELECT '=== DISTRIBUTION ORDERS PAR WORKSPACE ===' as info;
SELECT 
  w.id,
  w.name,
  COUNT(o.id) as orders_count
FROM workspaces w
LEFT JOIN orders o ON o.workspace_id = w.id
GROUP BY w.id, w.name
ORDER BY orders_count DESC
LIMIT 20;
