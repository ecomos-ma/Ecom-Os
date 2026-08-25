-- ============================================================
-- Check orders with correct column names
-- ============================================================

-- Check total orders in your workspace
SELECT COUNT(*) as total_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- Get your recent orders
SELECT "Order ID", order_number, customer_name, total, status, created_at 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC 
LIMIT 10;