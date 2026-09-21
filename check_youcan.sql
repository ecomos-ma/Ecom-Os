SELECT
  c.column_name,
  c.data_type,
  c.character_maximum_length,
  c.column_default,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public' 
  AND c.table_name = 'youcan_credentials'
ORDER BY c.ordinal_position;

SELECT
  indexname, indexdef
FROM pg_indexes
WHERE tablename = 'youcan_credentials';

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'youcan_credentials';
