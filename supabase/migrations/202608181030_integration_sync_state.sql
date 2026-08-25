
CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean DEFAULT true,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  sync_cursor text,
  last_processed_external_id text,
  consecutive_failures integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, provider)
);

-- Enable RLS
ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspaces can view their own sync state"
  ON public.integration_sync_state FOR SELECT
  USING (workspace_id = (SELECT auth.uid()::uuid)); -- Or specific workspace RBAC logic

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_integration_sync_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER integration_sync_state_updated_at
BEFORE UPDATE ON public.integration_sync_state
FOR EACH ROW EXECUTE FUNCTION update_integration_sync_state_updated_at();

-- Backfill existing integrations
DO $$
BEGIN
  -- Backfill Google Sheets
  INSERT INTO public.integration_sync_state (workspace_id, provider, enabled)
  SELECT id, 'google_sheets', google_sheet_autosync
  FROM public.workspaces
  WHERE google_sheet_url IS NOT NULL
  ON CONFLICT (workspace_id, provider) DO NOTHING;

  -- Backfill YouCan
  INSERT INTO public.integration_sync_state (workspace_id, provider, enabled)
  SELECT id, 'youcan', true
  FROM public.workspaces
  WHERE youcan_access_token IS NOT NULL
  ON CONFLICT (workspace_id, provider) DO NOTHING;
END $$;
