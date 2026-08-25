-- Vérifier le format du phone dans whatsapp_queue pour YC-31
SELECT id, workspace_id, order_id, phone, message_type, status, created_at
FROM whatsapp_queue
WHERE order_id = 'd82d34aa-9935-4844-9b91-7eb1af922280'
ORDER BY created_at DESC
LIMIT 5;

-- Vérifier le phone dans la table orders pour YC-31
SELECT "Order ID", order_number, phone, status
FROM orders
WHERE "Order ID" = 'd82d34aa-9935-4844-9b91-7eb1af922280';
