-- ============================================================
-- Vérification systématique du pattern "agent only" dans les policies RLS
-- Pour éviter de découvrir ce bug table par table
-- ============================================================

-- 1. Policies RLS actuelles sur customers
SELECT '=== POLICIES SUR CUSTOMERS ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'customers'
ORDER BY cmd, policyname;

-- 2. Vérification données customers pour workspace Nura (BYPASS RLS)
SELECT '=== DONNÉES CUSTOMERS WORKSPACE NURA (BYPASS RLS) ===' as step;
SELECT COUNT(*) as customers_count
FROM customers 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 3. Échantillon customers pour workspace Nura (BYPASS RLS)
SELECT '=== ÉCHANTILLON CUSTOMERS WORKSPACE NURA (BYPASS RLS) ===' as step;
SELECT 
  id,
  name,
  phone,
  city,
  workspace_id
FROM customers 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
LIMIT 5;

-- 4. Vérification jointure orders-customers (BYPASS RLS)
SELECT '=== TEST JOINTURE ORDERS-CUSTOMERS (BYPASS RLS) ===' as step;
SELECT 
  COUNT(*) as orders_with_customers
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND c.id IS NOT NULL;

-- 5. Policies RLS sur ozon_cities
SELECT '=== POLICIES OZON_CITIES ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'ozon_cities'
ORDER BY cmd, policyname;

-- 6. Policies RLS sur shipments
SELECT '=== POLICIES SHIPMENTS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'shipments'
ORDER BY cmd, policyname;

-- 7. Policies RLS sur products
SELECT '=== POLICIES PRODUCTS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'products'
ORDER BY cmd, policyname;

-- 8. Policies RLS sur campaigns
SELECT '=== POLICIES CAMPAIGNS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'campaigns'
ORDER BY cmd, policyname;

-- 9. Policies RLS sur meta_campaigns
SELECT '=== POLICIES META_CAMPAIGNS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'meta_campaigns'
ORDER BY cmd, policyname;

-- 10. Policies RLS sur expenses
SELECT '=== POLICIES EXPENSES ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'expenses'
ORDER BY cmd, policyname;

-- 11. Policies RLS sur integrations
SELECT '=== POLICIES INTEGRATIONS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'integrations'
ORDER BY cmd, policyname;

-- 12. Recherche systématique du pattern "agent only" dans toutes les policies
SELECT '=== RECHERCHE PATTERN "AGENT ONLY" DANS TOUTES LES POLICIES ===' as step,
       tablename,
       policyname,
       cmd,
       CASE 
         WHEN qual ILIKE '%agent%' AND qual NOT ILIKE '%supervisor%' AND qual NOT ILIKE '%owner%' AND qual NOT ILIKE '%manager%' AND qual NOT ILIKE '%admin%'
         THEN '⚠️  POTENTIELLEMENT "AGENT ONLY"'
         ELSE '✅ OK ou multi-rôles'
       END as risk_level,
       qual
FROM pg_policies 
WHERE cmd = 'SELECT'
ORDER BY 
  CASE 
    WHEN qual ILIKE '%agent%' AND qual NOT ILIKE '%supervisor%' AND qual NOT ILIKE '%owner%' AND qual NOT ILIKE '%manager%' AND qual NOT ILIKE '%admin%'
    THEN 1
    ELSE 0
  END DESC,
  tablename,
  policyname;

-- 13. Tables qui ont des policies SELECT mais PAS pour supervisor/owner/manager/admin
SELECT '=== TABLES AVEC RISQUE ÉLEVÉ (POLICY SELECT SANS SUPERVISOR/OWNER/MANAGER/ADMIN) ===' as step,
       tablename,
       policyname,
       qual
FROM pg_policies 
WHERE cmd = 'SELECT'
AND qual IS NOT NULL
AND qual NOT ILIKE '%supervisor%'
AND qual NOT ILIKE '%owner%'
AND qual NOT ILIKE '%manager%'
AND qual NOT ILIKE '%admin%'
AND qual ILIKE '%role%'
ORDER BY tablename, policyname;

-- 14. Données réelles pour tables potentiellement affectées (BYPASS RLS)
SELECT '=== DONNÉES RÉELLES TABLES JOINTES WORKSPACE NURA (BYPASS RLS) ===' as step,
       'customers:' as table_name, 
       (SELECT COUNT(*) FROM customers WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as count
UNION ALL
SELECT NULL as table_name,
       'products:' as table_name, 
       (SELECT COUNT(*) FROM products WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as count
UNION ALL
SELECT NULL as table_name,
       'campaigns:' as table_name, 
       (SELECT COUNT(*) FROM campaigns WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as count
UNION ALL
SELECT NULL as table_name,
       'shipments:' as table_name, 
       (SELECT COUNT(*) FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'))::text as count
UNION ALL
SELECT NULL as table_name,
       'expenses:' as table_name, 
       (SELECT COUNT(*) FROM expenses WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as count;

-- 15. Rapport de diagnostic (via SELECT visibles)
SELECT '=== RAPPORT DIAGNOSTIC SYSTÉMATIQUE ===' as step,
       (SELECT COUNT(*) FROM customers WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as customers_count,
       (SELECT COUNT(*) FROM pg_policies WHERE cmd = 'SELECT' AND qual ILIKE '%agent%' AND qual NOT ILIKE '%supervisor%' AND qual NOT ILIKE '%owner%' AND qual NOT ILIKE '%manager%' AND qual NOT ILIKE '%admin%')::text as agent_only_policies,
       (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE cmd = 'SELECT' AND qual IS NOT NULL AND qual NOT ILIKE '%supervisor%' AND qual NOT ILIKE '%owner%' AND qual NOT ILIKE '%manager%' AND qual NOT ILIKE '%admin%' AND qual ILIKE '%role%')::text as high_risk_tables;
