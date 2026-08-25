-- ============================================================
-- DIAGNOSTIC CRITIQUE - Orders Query Empty pour Workspace Nura
-- Workspace ID: 03826be0-e050-42d7-a030-a7d5a8d4f920
-- Priorité: CRITIQUE - Plateforme inutilisable pour ce workspace
-- ============================================================

-- 1. Vérifier si les données orders existent pour ce workspace
SELECT '1. COUNT orders pour workspace Nura' as diagnostic_step;
SELECT COUNT(*) as orders_count 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 2. Vérifier les échantillons orders pour ce workspace
SELECT '2. Échantillon orders (5 premiers)' as diagnostic_step;
SELECT id, order_number, customer_id, city, total, status, created_at, workspace_id
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Vérifier les policies RLS sur orders
SELECT '3. Policies RLS sur orders' as diagnostic_step;
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

-- 4. Test sans jointures (comme l'API REST de base)
SELECT '4. Orders sans jointures (test API REST simple)' as diagnostic_step;
SELECT *
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC
LIMIT 5;

-- 5. Vérifier les customers liés à ces orders
SELECT '5. Customers liés aux orders du workspace Nura' as diagnostic_step;
SELECT DISTINCT c.id, c.name, c.phone, c.city, c.workspace_id
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
LIMIT 10;

-- 6. Vérifier les policies RLS sur customers
SELECT '6. Policies RLS sur customers' as diagnostic_step;
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

-- 7. Vérifier ozon_cities
SELECT '7. Vérification ozon_cities' as diagnostic_step;
SELECT COUNT(*) as ozon_cities_count
FROM ozon_cities;

-- 8. Vérifier les policies RLS sur ozon_cities
SELECT '8. Policies RLS sur ozon_cities' as diagnostic_step;
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

-- 9. Test de la jointure complète (comme l'API REST)
SELECT '9. Test jointure complète (orders + customers + ozon_cities)' as diagnostic_step;
SELECT 
  o.id,
  o.order_number,
  o.workspace_id,
  c.id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  oc.id as ozon_city_id,
  oc.name as ozon_city_name
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN ozon_cities oc ON o.city = oc.name
WHERE o.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY o.created_at DESC
LIMIT 5;

-- 10. Vérifier les colonnes city dans orders
SELECT '10. Distribution des valeurs city dans orders du workspace Nura' as diagnostic_step;
SELECT city, COUNT(*) as count
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
GROUP BY city
ORDER BY count DESC
LIMIT 10;

-- 11. Vérifier si les city correspondent à ozon_cities
SELECT '11. Vérification correspondance city vs ozon_cities' as diagnostic_step;
SELECT 
  o.city as order_city,
  oc.name as ozon_city_name,
  oc.id as ozon_city_id,
  COUNT(*) as count
FROM orders o
LEFT JOIN ozon_cities oc ON o.city = oc.name
WHERE o.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
GROUP BY o.city, oc.name, oc.id
ORDER BY count DESC
LIMIT 10;

-- 12. Vérifier les tables liées aux migrations Coliaty
SELECT '12. Vérification tables Coliaty' as diagnostic_step;
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name LIKE '%coliaty%' 
OR table_name LIKE '%city%'
ORDER BY table_name, column_name;

-- 13. Vérifier s'il y a des triggers sur orders
SELECT '13. Triggers sur orders' as diagnostic_step;
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'orders';

-- 14. Diagnostic complet des colonnes orders
SELECT '14. Structure complète table orders' as diagnostic_step;
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 15. Test avec simulation RLS (set local role)
-- Note: Ceci nécessite d'être exécuté avec le bon contexte utilisateur
SELECT '15. Test contexte utilisateur actuel' as diagnostic_step;
SELECT 
  current_user,
  current_database(),
  session_user,
  auth.uid() as supabase_auth_uid;

-- 16. Vérifier les functions liées au workspace
SELECT '16. Functions workspace liées' as diagnostic_step;
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
  p.proname LIKE '%workspace%' 
  OR p.proname LIKE '%is_supervisor%'
  OR p.proname LIKE '%user_has_access%'
);

-- 17. Test direct de la fonction user_has_workspace_access
SELECT '17. Test fonction user_has_workspace_access' as diagnostic_step;
-- Note: Ceci retournera NULL si pas dans un contexte authentifié
SELECT public.user_has_workspace_access('03826be0-e050-42d7-a030-a7d5a8d4f920') as has_access;

-- 18. Vérifier les colonnes ajoutées par migrations récentes
SELECT '18. Colonnes orders ajoutées par migrations récentes' as diagnostic_step;
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN (
  'coliaty_city_id',
  'coliaty_parcel_id',
  'youcan_order_id',
  'youcan_webhook_id',
  'address',
  'pickup_note'
);

-- 19. RÉSUMÉ DU DIAGNOSTIC
SELECT '19. RÉSUMÉ DIAGNOSTIC' as diagnostic_step;
DO $$
DECLARE
  orders_count int;
  customers_count int;
  ozon_cities_count int;
  orders_policies int;
  customers_policies int;
  ozon_cities_policies int;
BEGIN
  SELECT COUNT(*) INTO orders_count 
  FROM orders 
  WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  
  SELECT COUNT(*) INTO customers_count
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
  WHERE o.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  
  SELECT COUNT(*) INTO ozon_cities_count
  FROM ozon_cities;
  
  SELECT COUNT(*) INTO orders_policies
  FROM pg_policies 
  WHERE tablename = 'orders';
  
  SELECT COUNT(*) INTO customers_policies
  FROM pg_policies 
  WHERE tablename = 'customers';
  
  SELECT COUNT(*) INTO ozon_cities_policies
  FROM pg_policies 
  WHERE tablename = 'ozon_cities';
  
  RAISE NOTICE '=== RÉSUMÉ DIAGNOSTIC ORDERS WORKSPACE NURA ===';
  RAISE NOTICE 'Orders dans workspace: %', orders_count;
  RAISE NOTICE 'Customers liés: %', customers_count;
  RAISE NOTICE 'Ozon cities total: %', ozon_cities_count;
  RAISE NOTICE 'Policies RLS sur orders: %', orders_policies;
  RAISE NOTICE 'Policies RLS sur customers: %', customers_policies;
  RAISE NOTICE 'Policies RLS sur ozon_cities: %', ozon_cities_policies;
  
  IF orders_count = 0 THEN
    RAISE NOTICE '❌ CRITIQUE: Aucune order trouvée - problème de données';
  ELSIF orders_policies = 0 THEN
    RAISE NOTICE '❌ CRITIQUE: Aucune policy RLS sur orders - problème de sécurité';
  ELSE
    RAISE NOTICE '✅ Données présentes, vérifier policies RLS';
  END IF;
END $$;
