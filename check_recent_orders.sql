-- Sélectionner les 5 commandes les plus récentes pour le workspace
SELECT * FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920' 
ORDER BY created_at DESC 
LIMIT 5;
