-- ============================================================
-- GOOGLE SHEETS FAST SYNC CHECKPOINT TRACKING
-- ============================================================
-- This migration adds checkpoint tracking for delta sync functionality
-- Preserves backward compatibility - existing integrations continue to work

-- Add checkpoint tracking columns to google_sheets_credentials
ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS last_processed_row INTEGER DEFAULT 0;

ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ;

ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS last_seen_sheet_row INTEGER DEFAULT 0;

ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS sync_error_count INTEGER DEFAULT 0;

ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS sync_error_last_at TIMESTAMPTZ;

-- Add index for efficient querying of workspaces needing sync
CREATE INDEX IF NOT EXISTS google_sheets_credentials_active_sync_idx 
  ON public.google_sheets_credentials(workspace_id) 
  WHERE web_app_url IS NOT NULL AND web_app_url != '';

-- Add comments documenting the new columns
COMMENT ON COLUMN public.google_sheets_credentials.last_processed_row IS 
'The last row number (1-indexed) that was successfully processed from the Google Sheet. Used for delta sync to only fetch new rows.';

COMMENT ON COLUMN public.google_sheets_credentials.last_successful_sync_at IS 
'Timestamp of the last successful sync completion. Used for monitoring and error recovery.';

COMMENT ON COLUMN public.google_sheets_credentials.last_seen_sheet_row IS 
'The total row count of the Google Sheet as seen during the last check. Used to detect new rows.';

COMMENT ON COLUMN public.google_sheets_credentials.sync_error_count IS 
'Count of consecutive sync errors. Used for exponential backoff when the sheet is temporarily unavailable.';

COMMENT ON COLUMN public.google_sheets_credentials.sync_error_last_at IS 
'Timestamp of the last sync error. Used for error tracking and backoff timing.';

-- Reset error count on successful sync (trigger)
CREATE OR REPLACE FUNCTION public.reset_google_sheets_sync_error_count()
RETURNS TRIGGER AS $$
BEGIN
  -- If sync was successful (last_successful_sync_at is being updated), reset error count
  IF NEW.last_successful_sync_at IS NOT NULL AND NEW.last_successful_sync_at != OLD.last_successful_sync_at THEN
    NEW.sync_error_count = 0;
    NEW.sync_error_last_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_sheets_credentials_reset_error_count
  BEFORE UPDATE ON public.google_sheets_credentials
  FOR EACH ROW
  WHEN (NEW.last_successful_sync_at IS NOT NULL AND NEW.last_successful_sync_at != OLD.last_successful_sync_at)
  EXECUTE FUNCTION public.reset_google_sheets_sync_error_count();

-- Increment error count on sync failure (function to be called by edge function)
CREATE OR REPLACE FUNCTION public.increment_google_sheets_sync_error(p_workspace_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.google_sheets_credentials
  SET 
    sync_error_count = COALESCE(sync_error_count, 0) + 1,
    sync_error_last_at = NOW()
  WHERE workspace_id = p_workspace_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get workspaces that need fast sync (for batch processing)
CREATE OR REPLACE FUNCTION public.get_workspaces_needing_google_sheets_sync()
RETURNS TABLE (
  workspace_id UUID,
  web_app_url TEXT,
  last_processed_row INTEGER,
  last_seen_sheet_row INTEGER,
  sync_error_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gsc.workspace_id,
    gsc.web_app_url,
    COALESCE(gsc.last_processed_row, 0) as last_processed_row,
    COALESCE(gsc.last_seen_sheet_row, 0) as last_seen_sheet_row,
    COALESCE(gsc.sync_error_count, 0) as sync_error_count
  FROM public.google_sheets_credentials gsc
  WHERE gsc.web_app_url IS NOT NULL 
    AND gsc.web_app_url != ''
    -- Only include workspaces that haven't exceeded error threshold (e.g., 10 consecutive errors)
    AND COALESCE(gsc.sync_error_count, 0) < 10;
END;
$$ LANGUAGE plpgsql;