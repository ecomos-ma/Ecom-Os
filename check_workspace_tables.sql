-- ============================================================
-- Check actual workspace/member related tables in the database
-- ============================================================

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE '%workspace%' OR table_name LIKE '%profile%' OR table_name LIKE '%member%')
ORDER BY table_name;
