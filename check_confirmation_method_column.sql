-- Vérifier si la colonne confirmation_method existe dans la table orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' 
  AND column_name = 'confirmation_method';
