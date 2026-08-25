-- Chercher le webhook pour YC-40 (youcan_order_id = xccza2AEZ)
SELECT 
  id,
  event_type,
  status,
  created_at,
  payload
FROM webhook_logs 
WHERE provider = 'youcan' 
  AND payload::text LIKE '%xccza2AEZ%'
ORDER BY created_at DESC 
LIMIT 1;
