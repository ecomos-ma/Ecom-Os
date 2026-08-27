-- ============================================================
-- Check which schema gen_random_bytes actually lives in
-- ============================================================

SELECT n.nspname AS schema, p.proname 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE p.proname = 'gen_random_bytes';
