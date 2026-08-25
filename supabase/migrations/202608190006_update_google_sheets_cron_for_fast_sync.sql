-- ============================================================
-- UPDATE GOOGLE SHEETS CRON JOB FOR FAST SYNC
-- ============================================================
-- This migration updates the existing Google Sheets cron job to use
-- the new fast sync function (sync-google-sheets-fast) instead of
-- the old full sync function (sync-google-sheets).
--
-- The fast sync function:
-- - Uses delta detection to only fetch new rows
-- - Maintains checkpoint tracking per workspace
-- - Advances checkpoint only after successful DB writes
-- - Provides ~1-2 second latency for new orders
-- ============================================================

-- Remove the old sync-google-sheets cron job
SELECT cron.unschedule('sync-google-sheets')
FROM cron.job WHERE jobname = 'sync-google-sheets';

-- Schedule the new fast sync cron job (every 1 minute)
-- Note: pg_cron minimum interval is 1 minute
SELECT cron.schedule(
  'sync-google-sheets-fast',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url       := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/sync-google-sheets-fast',
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

-- Verify the new cron job was created
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'sync-google-sheets-fast';

-- Note: The old sync-google-sheets-orders Edge Function is still available
-- for manual "Sync Now" triggers from the UI. The fast sync is only for
-- automated background syncing.