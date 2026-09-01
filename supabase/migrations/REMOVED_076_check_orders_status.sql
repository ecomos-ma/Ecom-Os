-- ============================================================
-- Check orders status for the workspace
-- ============================================================

-- Check if orders table has workspace_id column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name LIKE '%workspace%';

-- Check total orders in your workspace
SELECT COUNT(*) as total_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- Check recent orders in your workspace
SELECT id, order_number, customer_name, total, status, created_at 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC 
LIMIT 10;

-- Check if workspace_id column exists in orders
-- If not, check all orders without workspace filter
SELECT COUNT(*) as all_orders FROM orders;

-- Get recent orders from all orders
SELECT id, order_number, customer_name, total, status, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;