-- ============================================================
-- Verify and restore user data
-- ============================================================

-- Check your workspace
SELECT id, name, owner_id FROM workspaces WHERE id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- Check your orders count
SELECT COUNT(*) as total_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- Check recent orders
SELECT id, order_number, customer_name, total, status, created_at 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC 
LIMIT 10;

-- Check if orders were soft-deleted
SELECT COUNT(*) as deleted_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND deleted_at IS NOT NULL;

-- If orders were soft-deleted, restore them
UPDATE orders 
SET deleted_at = NULL 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND deleted_at IS NOT NULL;