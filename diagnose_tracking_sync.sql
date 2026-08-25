-- Diagnostic script to check delivery status sync issues
-- Run this against your Supabase database

-- 1. Check if pg_cron is scheduled for cron-sync-shipments
SELECT * FROM pg_cron.jobs;

-- 2. Check recent sync logs (last 20 entries)
SELECT * FROM shipping_sync_logs ORDER BY synced_at DESC LIMIT 20;

-- 3. Check provider credentials table
SELECT * FROM shipping_provider_credentials;

-- 4. Check integration sync state
SELECT * FROM integration_sync_state WHERE provider = 'shipping' ORDER BY last_sync_completed_at DESC LIMIT 10;

-- 5. Sample orders with potential stale status (orders with tracking but no recent sync)
SELECT 
  order_number,
  shipping_provider,
  shipping_status,
  delivery_status,
  last_tracking_sync,
  shipping_updated_at,
  tracking_number,
  created_at,
  updated_at
FROM orders 
WHERE tracking_number IS NOT NULL 
  AND tracking_number != ''
  AND (last_tracking_sync IS NULL OR last_tracking_sync < NOW() - INTERVAL '1 day')
ORDER BY updated_at DESC 
LIMIT 10;

-- 6. Check for recent errors in shipping logs
SELECT * FROM shipping_logs 
WHERE event_type = 'tracking_sync' 
  AND success = false 
ORDER BY created_at DESC 
LIMIT 10;
