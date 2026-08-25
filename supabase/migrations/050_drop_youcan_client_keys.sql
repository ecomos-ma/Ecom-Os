-- ============================================================
-- EcomOS · Remove YouCan Client Keys from Workspaces
-- ============================================================
-- The youcan_client_id and youcan_client_secret are global app identifiers.
-- They shouldn't be requested from the user nor stored per workspace.
-- They are now managed globally via Supabase Secrets (Environment variables).

ALTER TABLE public.workspaces
  DROP COLUMN IF EXISTS youcan_client_id,
  DROP COLUMN IF EXISTS youcan_client_secret;
