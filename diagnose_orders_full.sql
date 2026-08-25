-- ============================================================
-- DIAGNOSTIC COMPLET POUR ÉCHEC UPDATE ORDERS
-- ============================================================

-- 1. Structure de la table orders
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

-- 2. Clé primaire de orders
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

-- 3. Test: Vérifier si un order spécifique existe
SELECT '=== TEST EXISTENCE ORDER ===' as step;
-- Remplacer avec un ID réel d'un order qui échoue
SELECT *
FROM orders
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
LIMIT 3;

-- 4. Vérifier les colonnes qui pourraient causer confusion
SELECT '=== COLONNES POTENTIELLEMENT CONFUSES ===' as step;
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orders'
AND (column_name ILIKE '%id%' OR column_name ILIKE '%order%')
ORDER BY column_name;

-- 5. Sample de données pour voir les valeurs réelles
SELECT '=== ÉCHANTILLON DONNÉES ORDERS AVEC TOUS LES CHAMPS ===' as step;
SELECT *
FROM orders
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
LIMIT 1;
