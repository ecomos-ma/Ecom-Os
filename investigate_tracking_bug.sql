-- Recherche de commandes mal attribuées (Ozon avec tracking Ameex)
SELECT order_number, tracking_number, shipping_provider 
FROM orders 
WHERE shipping_provider = 'ozon' 
AND (tracking_number ~ '^[A-Za-z]+[0-9]{9,}' OR tracking_number ILIKE 'F-%');

-- Recherche de commandes Ameex sans tracking
SELECT order_number, shipping_status, tracking_number, updated_at 
FROM orders 
WHERE shipping_provider = 'ameex' 
AND tracking_number IS NULL 
AND shipping_status NOT IN ('New', 'pending') 
ORDER BY updated_at DESC 
LIMIT 20;

-- Commandes Ameex récentes pour état des lieux
SELECT order_number, tracking_number, shipping_provider, shipping_status, updated_at 
FROM orders 
WHERE shipping_provider = 'ameex' 
ORDER BY updated_at DESC 
LIMIT 15;
