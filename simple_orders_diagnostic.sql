-- ============================================================
-- SIMPLE DIAGNOSTIC - ORDERS TABLE STRUCTURE
-- ============================================================

-- 1. Show all columns in orders table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 2. Show primary key
SELECT kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'orders'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 3. Show sample data
SELECT * FROM orders LIMIT 1;
