-- ============================================================
-- ADD CRON JOB FOR PERIODIC GOOGLE SHEETS SYNC
-- ============================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to sync all workspaces with configured web_app_url
CREATE OR REPLACE FUNCTION sync_all_google_sheets_workspaces()
RETURNS void AS $$
DECLARE
  workspace_record RECORD;
  edge_function_url TEXT;
BEGIN
  -- Get the edge function URL from environment or use default
  -- This should be configured based on your Supabase project URL
  edge_function_url := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/sync-google-sheets-orders';
  
  -- Loop through all workspaces with configured web_app_url
  FOR workspace_record IN 
    SELECT workspace_id, web_app_url 
    FROM public.google_sheets_credentials 
    WHERE web_app_url IS NOT NULL AND web_app_url != ''
  LOOP
    -- Call the edge function for each workspace
    -- Note: This uses net.http_post which requires the supabase_net extension
    -- Alternatively, you can use a different approach based on your setup
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('workspace_id', workspace_record.workspace_id)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule the cron job to run every 30 minutes
-- Format: cron schedule (minute hour day month day-of-week)
-- */30 * * * * = every 30 minutes
SELECT cron.schedule(
  'sync-google-sheets-orders',
  '*/30 * * * *',
  'SELECT sync_all_google_sheets_workspaces();'
);
