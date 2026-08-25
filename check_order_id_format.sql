-- Vérifier le format réel des valeurs dans la colonne "Order ID"
SELECT "Order ID", order_number, status, created_at 
FROM orders 
LIMIT 3;

-- Vérifier toutes les colonnes de la table orders
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND table_schema = 'public'
ORDER BY ordinal_position;
