-- ============================================================
-- DIAGNOSTIC ORDERS TABLE SCHEMA
-- Vérifier la structure réelle de la table orders
-- ============================================================

-- 1. Structure complète de la table orders
SELECT '=== STRUCTURE TABLE ORDERS ===' as step;
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 2. Clé primaire de la table orders
SELECT '=== CLÉ PRIMAIRE ORDERS ===' as step;
SELECT 
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_name = 'orders'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 3. Échantillon de données orders pour voir les champs réels
SELECT '=== ÉCHANTILLON DONNÉES ORDERS ===' as step;
SELECT *
FROM orders
LIMIT 3;

-- 4. Vérifier si la colonne "Order ID" existe
SELECT '=== VÉRIFICATION COLONNE ORDER ID ===' as step;
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'Order ID'
    ) THEN '✅ Colonne Order ID existe'
    ELSE '❌ Colonne Order ID n existe pas'
  END as order_id_column_status;
