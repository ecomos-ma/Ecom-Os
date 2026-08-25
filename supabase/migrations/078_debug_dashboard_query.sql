-- ============================================================
-- Debug dashboard query - check date range filtering
-- ============================================================

-- Check the date range being used by dashboard
-- Default is "this month" which would be August 2026

-- Get orders created in August 2026 (this month)
SELECT COUNT(*) as august_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND created_at >= '2026-08-01 00:00:00+00'
AND created_at <= '2026-08-31 23:59:59+00';

-- Get all orders in workspace (no date filter)
SELECT COUNT(*) as all_workspace_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- Get orders created today
SELECT COUNT(*) as today_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND DATE(created_at) = CURRENT_DATE;