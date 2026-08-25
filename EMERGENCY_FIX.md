# Emergency Fix Instructions

## Issue 1: Super Admin Redirecting to 404

The SuperAdminGuard has been updated with console logging. Run this SQL to verify your session:

```sql
-- Check your current profile state
SELECT 
  id, 
  email, 
  role, 
  allowed_sections,
  workspace_id
FROM profiles 
WHERE email = 'amineelaaouamecom@gmail.com';
```

Then check the browser console (F12) when accessing `/super-admin` to see the debug logs.

## Issue 2: Dashboard Shows No Data - Orders Missing

Run this SQL in Supabase SQL Editor to check and restore your orders:

```sql
-- 1. Check your workspace ID
SELECT id, name, owner_id FROM workspaces WHERE id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 2. Check total orders count
SELECT COUNT(*) as total_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 3. Check for soft-deleted orders
SELECT COUNT(*) as deleted_orders 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND deleted_at IS NOT NULL;

-- 4. If there are deleted orders, restore them
UPDATE orders 
SET deleted_at = NULL 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
AND deleted_at IS NOT NULL;

-- 5. Check recent orders
SELECT id, order_number, customer_name, total, status, created_at 
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
ORDER BY created_at DESC 
LIMIT 10;
```

## Immediate Actions

1. **Run the SQL above** to check your orders
2. **If orders were soft-deleted**, the UPDATE statement will restore them
3. **Refresh the dashboard** after running the SQL
4. **Check browser console** for SuperAdminGuard debug logs

## If Orders Are Completely Gone

If the COUNT returns 0 and no deleted orders exist, the data may have been permanently deleted. Check:

```sql
-- Check all orders in database
SELECT COUNT(*) FROM orders;

-- Check if workspace ID changed
SELECT id, workspace_id FROM profiles WHERE email = 'amineelaaouamecom@gmail.com';
```

If the workspace ID doesn't match, we need to update it to the correct workspace.