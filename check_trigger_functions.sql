-- Vérifier le code des fonctions de trigger suspectes
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('auto_calculate_shipping_cost', 'set_status_source_on_insert')
ORDER BY routine_name;
