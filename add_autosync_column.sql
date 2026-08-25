-- ============================================================
-- ADD MISSING google_sheet_autosync COLUMN TO workspaces TABLE
-- ============================================================

ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS google_sheet_autosync boolean DEFAULT false;
