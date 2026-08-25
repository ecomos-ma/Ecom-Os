-- ============================================================
-- Add super_admin role support
-- ============================================================

-- Update role check constraint to include super_admin
-- This is a placeholder - actual role validation happens in application logic
-- The role is stored as text in the profiles table, so no schema change needed

-- Note: The super_admin role is the highest privilege level
-- and can only be set manually by database administrators
-- via direct SQL updates to the profiles table

-- Example to grant super_admin role (run manually as database admin):
-- UPDATE profiles SET role = 'super_admin' WHERE email = 'amineelaaouamecom@gmail.com';

-- Security note: Application logic in hooks and RLS policies must verify
-- both role = 'super_admin' AND email = 'amineelaaouamecom@gmail.com'
-- before granting access to Super Admin Pro features