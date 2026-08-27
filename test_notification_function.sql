-- ============================================================
-- Test the corrected notification function
-- ============================================================

-- First verify the tables we're referencing exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profile_workspaces', 'profiles', 'notification_user_settings', 'notification_preferences', 'notifications', 'notification_event_catalog', 'workspaces')
ORDER BY table_name;

-- Test the gen_random_bytes function with correct schema
SELECT encode(extensions.gen_random_bytes(12), 'hex') as test_random_bytes;

-- Check if there are any workspaces to test with
SELECT id, name FROM public.workspaces LIMIT 1;
