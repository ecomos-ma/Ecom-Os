-- ============================================================
-- CHECK WEBHOOK LOGS FOR LATEST YOUCAN PAYLOAD
-- ============================================================

SELECT 
  id,
  source,
  created_at,
  raw_payload
FROM public.webhook_logs
WHERE source = 'youcan'
ORDER BY created_at DESC
LIMIT 1;
