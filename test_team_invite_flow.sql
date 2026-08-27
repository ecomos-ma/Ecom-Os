-- ============================================================
-- Test Team Invitation Flow
-- ============================================================

-- 1. Check if required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workspace_invitations', 'profile_workspaces', 'profiles', 'workspaces')
ORDER BY table_name;

-- 2. Check profile_workspaces structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profile_workspaces'
ORDER BY ordinal_position;

-- 3. Check workspace_invitations structure  
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'workspace_invitations'
ORDER BY ordinal_position;

-- 4. Test creating a sample invitation (replace with actual workspace_id and email)
-- INSERT INTO public.workspace_invitations (id, workspace_id, email, role, allowed_sections, invited_by, status)
-- VALUES (
--   gen_random_uuid(),
--   'YOUR_WORKSPACE_ID_HERE',
--   'test@example.com',
--   'agent',
--   '["Dashboard", "Orders"]'::jsonb,
--   'YOUR_USER_ID_HERE',
--   'pending'
-- );

-- 5. Check existing invitations
SELECT * FROM public.workspace_invitations 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 5;

-- 6. Check existing profile_workspaces memberships
SELECT pw.*, p.full_name, p.email 
FROM public.profile_workspaces pw
JOIN public.profiles p ON p.id = pw.profile_id
ORDER BY pw.created_at DESC 
LIMIT 5;

-- 7. Verify owner detection logic - check for is_owner flags
SELECT pw.*, p.full_name, p.email, p.role as profile_role
FROM public.profile_workspaces pw
JOIN public.profiles p ON p.id = pw.profile_id
WHERE pw.is_owner = true;
