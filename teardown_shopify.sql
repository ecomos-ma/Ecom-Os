BEGIN;
DROP TABLE IF EXISTS public.shopify_order_items CASCADE;
DROP TABLE IF EXISTS public.shopify_webhook_deliveries CASCADE;
DROP TABLE IF EXISTS public.shopify_webhook_subscriptions CASCADE;
DROP TABLE IF EXISTS public.shopify_sync_jobs CASCADE;
DROP TABLE IF EXISTS public.shopify_oauth_states CASCADE;
DROP TABLE IF EXISTS public.shopify_credentials CASCADE;
COMMIT;
