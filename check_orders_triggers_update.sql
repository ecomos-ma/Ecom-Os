-- Vérifier tous les triggers sur la table orders
SELECT 
  trigger_name,
  event_manipulation, -- INSERT, UPDATE, DELETE, etc.
  event_object_table,
  action_timing, -- BEFORE, AFTER
  action_statement,
  condition
FROM information_schema.triggers
WHERE event_object_table = 'orders'
  AND trigger_schema = 'public'
ORDER BY event_manipulation, action_timing;
