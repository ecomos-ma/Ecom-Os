-- ============================================================
-- Update role check constraint to include super_admin
-- ============================================================

-- Drop the existing role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the updated constraint with super_admin included
ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('super_admin', 'supervisor', 'manager', 'employee', 'user', 'owner', 'admin', 'viewer', 'agent'));