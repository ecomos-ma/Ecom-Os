SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'shopify_webhook_subscriptions'
ORDER BY ordinal_position;
