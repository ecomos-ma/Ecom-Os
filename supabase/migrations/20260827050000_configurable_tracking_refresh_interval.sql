-- ============================================================
-- Configurable Tracking Refresh Interval
-- 
-- Adds platform setting for automatic tracking status refresh interval
-- with 5-minute minimum to prevent API rate limiting
-- ============================================================

-- Add column to track last sync time per workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'last_tracking_sync_at'
  ) THEN
    ALTER TABLE public.workspaces ADD COLUMN last_tracking_sync_at timestamptz;
  END IF;
END $$;

-- Create index for efficient sync time queries
CREATE INDEX IF NOT EXISTS idx_workspaces_last_tracking_sync 
ON public.workspaces (last_tracking_sync_at) 
WHERE last_tracking_sync_at IS NOT NULL;

-- Insert default platform setting if it doesn't exist
-- Note: Using platform_settings table (not platform_settings_v3)
INSERT INTO public.platform_settings (setting_key, value, description, category)
VALUES (
  'shipping_tracking_refresh_interval_minutes',
  '10'::jsonb,
  'Minutes between automatic tracking status refreshes for active shipments. Minimum: 5 minutes to prevent API rate limiting.',
  'shipping'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment for documentation
COMMENT ON COLUMN public.workspaces.last_tracking_sync_at IS 'Timestamp of last automatic tracking sync for this workspace. Used to enforce refresh intervals.';