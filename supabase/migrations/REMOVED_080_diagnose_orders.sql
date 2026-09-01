-- DIAGNOSTIC QUERY FOR SUPER ADMIN ORDERS
-- Run this in Supabase SQL Editor to check if the query works

-- Check current RLS policies on orders
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

-- Check if you can query orders as the current user
SELECT COUNT(*) as total_orders, 
       COUNT(DISTINCT workspace_id) as workspaces_with_orders
FROM orders;

-- Check order statuses
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- Check recent orders
SELECT 
  id,
  order_number,
  total,
  status,
  workspace_id,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- Check if the current user has super_admin role
SELECT 
  id,
  email,
  role,
  allowed_sections
FROM profiles
WHERE email = 'amineelaaouamecom@gmail.com';