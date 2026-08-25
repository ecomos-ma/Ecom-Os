SELECT 
  id,
  event_type,
  status,
  created_at,
  payload
FROM webhook_logs 
WHERE provider = 'youcan' 
  AND id = 'bff3e3c8-ad13-4a4c-8f24-f3b8e92583e2'  -- Le plus récent
LIMIT 1;
