-- ============================================================
-- Test the gen_random_bytes fix
-- ============================================================

-- 1. First verify pgcrypto extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

-- 2. Verify which schema gen_random_bytes is in
SELECT n.nspname AS schema, p.proname 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE p.proname = 'gen_random_bytes';

-- 3. Test gen_random_bytes with correct schema prefix (extensions)
SELECT encode(extensions.gen_random_bytes(16), 'hex') as test_with_extensions_schema;

-- 4. Test the actual dedupe key generation that was failing
SELECT 
  encode(extensions.gen_random_bytes(12), 'hex') as dedupe_test,
  'test-event' || ':' || 'test-workspace-id' || ':' || encode(extensions.gen_random_bytes(12), 'hex') as full_dedupe_key;
