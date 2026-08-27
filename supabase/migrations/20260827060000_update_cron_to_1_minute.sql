-- ============================================================
-- Update Shipment Sync Cron to 1-Minute Interval
-- 
-- Changes pg_cron schedule from every 10 minutes to every 1 minute.
-- The Edge Function now handles per-workspace interval checking to prevent
-- overloading the APIs, so we can check more frequently while still
-- respecting the configured refresh interval.
-- ============================================================

-- Remove existing cron-sync-shipments job
SELECT cron.unschedule('cron-sync-shipments')
FROM cron.job WHERE jobname = 'cron-sync-shipments';

-- Re-schedule with 1-minute interval
-- NOTE: Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with your actual values
SELECT cron.schedule(
  'cron-sync-shipments',
  '* * * * *',  -- every 1 minute (changed from */10 * * * *)
  $$
  SELECT net.http_post(
    url       := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/cron-sync-shipments',
    headers   := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NjA4NDAsImV4cCI6MjA5OTAzNjg0MH0.rJh4TDBlvxBgv6PI23SXC9IPxttotyuq08xIP31Pj0U',
                   'x-cron-secret',   'ecomos-cron-secret-2024'
                 ),
    body      := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- Verify the updated schedule
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'cron-sync-shipments';