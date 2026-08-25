-- ============================================================
-- CHECK ACTUAL webhook_logs TABLE SCHEMA
-- ============================================================

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'webhook_logs'
ORDER BY ordinal_position;
