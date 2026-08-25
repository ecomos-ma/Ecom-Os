-- Diagnostic pour le problème de tracking Amex
-- 1. Vérifier les colonnes de la table orders
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name ILIKE '%tracking%' 
OR column_name ILIKE '%shipment%'
OR column_name ILIKE '%amex%'
ORDER BY column_name;

-- 2. Vérifier les commandes avec shipping_provider = 'ameex'
SELECT * FROM orders 
WHERE shipping_provider = 'ameex' 
LIMIT 5;

-- 3. Vérifier les commandes qui ont 'ameex' dans shipping_company
SELECT * FROM orders 
WHERE shipping_company ILIKE '%ameex%' 
LIMIT 5;

-- 4. Vérifier les logs d'envoi Amex récents
SELECT * FROM shipping_logs
WHERE provider ILIKE '%ameex%'
   OR action ILIKE '%ameex%'
   OR request_payload::text ILIKE '%ameex%'
   OR response_payload::text ILIKE '%ameex%'
ORDER BY created_at DESC
LIMIT 10;
