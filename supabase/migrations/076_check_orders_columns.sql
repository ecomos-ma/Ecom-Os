-- ============================================================
-- Check all columns in orders table
-- ============================================================

-- Get all columns in orders table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- Check if the table exists at all
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'orders'
) as orders_table_exists;