-- ============================================================
-- Check profile_workspaces table structure
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profile_workspaces'
ORDER BY ordinal_position;
