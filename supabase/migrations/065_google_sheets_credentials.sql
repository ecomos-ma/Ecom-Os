-- ============================================================
-- GOOGLE SHEETS INTEGRATION - CREDENTIALS TABLE
-- ============================================================

-- Create google_sheets_credentials table
CREATE TABLE IF NOT EXISTS public.google_sheets_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sheet_url TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  webhook_token TEXT NOT NULL UNIQUE,
  web_app_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unique constraint on workspace_id (one sheet per workspace)
CREATE UNIQUE INDEX IF NOT EXISTS google_sheets_credentials_workspace_id_idx 
  ON public.google_sheets_credentials(workspace_id);

-- Enable RLS
ALTER TABLE public.google_sheets_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Each workspace can only see/edit its own credentials
CREATE POLICY "Users can view their workspace's Google Sheets credentials"
  ON public.google_sheets_credentials
  FOR SELECT
  USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Users can insert their workspace's Google Sheets credentials"
  ON public.google_sheets_credentials
  FOR INSERT
  WITH CHECK (user_has_workspace_access(workspace_id));

CREATE POLICY "Users can update their workspace's Google Sheets credentials"
  ON public.google_sheets_credentials
  FOR UPDATE
  USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Users can delete their workspace's Google Sheets credentials"
  ON public.google_sheets_credentials
  FOR DELETE
  USING (user_has_workspace_access(workspace_id));

-- Service role can bypass RLS for edge functions
CREATE POLICY "Service role can manage Google Sheets credentials"
  ON public.google_sheets_credentials
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_google_sheets_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_sheets_credentials_updated_at
  BEFORE UPDATE ON public.google_sheets_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_google_sheets_credentials_updated_at();

-- Add content_hash column to orders table for Google Sheets deduplication
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create unique index on workspace_id + content_hash for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_content_hash_idx 
  ON public.orders(workspace_id, content_hash) 
  WHERE content_hash IS NOT NULL;

-- Create unique constraint on workspace_id + content_hash for upsert
ALTER TABLE public.orders 
ADD CONSTRAINT orders_workspace_content_hash_key 
UNIQUE (workspace_id, content_hash);

-- Verify orders.source column supports 'sheets' (should already exist from prior work)
-- This is a no-op if the column already supports it, just for verification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'orders_source_check'
  ) THEN
    ALTER TABLE public.orders 
    ADD CONSTRAINT orders_source_check 
    CHECK (source IN ('youcan', 'sheets', 'manual', 'shopify'));
  END IF;
END $$;
