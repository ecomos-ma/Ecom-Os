-- ============================================================
-- Add Coliaty API columns to workspaces table
-- ============================================================

-- Add Coliaty API columns to workspaces
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS coliaty_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coliaty_api_key text,
  ADD COLUMN IF NOT EXISTS coliaty_api_url text DEFAULT 'https://api.coliaty.ma';

-- Add comments
COMMENT ON COLUMN public.workspaces.coliaty_enabled IS 'Whether Coliaty integration is enabled for this workspace';
COMMENT ON COLUMN public.workspaces.coliaty_api_key IS 'Coliaty API key for this workspace';
COMMENT ON COLUMN public.workspaces.coliaty_api_url IS 'Coliaty API base URL for this workspace';
