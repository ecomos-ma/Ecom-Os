-- Vérifier les logs d'erreur webhook YouCan
SELECT * FROM webhook_logs 
WHERE provider = 'youcan' 
  AND status != 'received'
ORDER BY created_at DESC 
LIMIT 20;

-- Vérifier tous les logs webhook YouCan récents
SELECT 
  id,
  event_type,
  status,
  created_at,
  payload->'order'->'id' as youcan_order_id,
  payload->'order'->'variants'->0->'variant'->'sku' as sku
FROM webhook_logs 
WHERE provider = 'youcan' 
ORDER BY created_at DESC 
LIMIT 20;
