-- Vérifier tous les triggers sur la table orders
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'orders'
ORDER BY trigger_name;
