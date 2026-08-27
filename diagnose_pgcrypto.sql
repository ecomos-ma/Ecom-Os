-- ============================================================
-- Diagnose pgcrypto extension and gen_random_bytes function
-- ============================================================

-- 1. Check if pgcrypto extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

-- 2. Check which schema the gen_random_bytes function is in
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'gen_random_bytes';

-- 3. Test if gen_random_bytes actually works
SELECT encode(gen_random_bytes(16), 'hex') as test_result;

-- 4. If the above fails, try with schema prefixes
SELECT encode(public.gen_random_bytes(16), 'hex') as test_with_public_schema;
SELECT encode(extensions.gen_random_bytes(16), 'hex') as test_with_extensions_schema;
