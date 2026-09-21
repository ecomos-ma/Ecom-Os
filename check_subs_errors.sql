SELECT topic, status, last_error
FROM public.shopify_webhook_subscriptions
WHERE status = 'failed'
ORDER BY topic;
