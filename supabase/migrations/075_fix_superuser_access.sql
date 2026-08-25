-- ============================================================
-- Fix super_admin access and allowed_sections
-- ============================================================

-- Update the user's role to super_admin and set full access
UPDATE profiles 
SET 
  role = 'super_admin',
  allowed_sections = ARRAY[
    'Dashboard',
    'Orders',
    'Confirmation',
    'Shipping',
    'Customers',
    'Products',
    'Inventory',
    'Ads Manager',
    'Expenses',
    'COD Scenarios',
    'Analytics',
    'Team',
    'Settings'
  ]::text[]
WHERE email = 'amineelaaouamecom@gmail.com';

-- Verify the update
SELECT id, email, role, allowed_sections 
FROM profiles 
WHERE email = 'amineelaaouamecom@gmail.com';