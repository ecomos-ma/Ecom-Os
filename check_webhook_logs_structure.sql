-- ============================================================
-- CHECK IF webhook_logs TABLE EXISTS AND ITS STRUCTURE
-- ============================================================

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'webhook_logs'
ORDER BY ordinal_position;
