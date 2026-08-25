-- ============================================================
-- ADD web_app_url COLUMN TO google_sheets_credentials
-- ============================================================

ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS web_app_url TEXT;
