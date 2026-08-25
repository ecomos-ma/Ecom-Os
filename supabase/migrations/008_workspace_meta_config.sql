-- ============================================================
-- EcomOS · Meta Ads Workspace Configuration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add Meta config columns directly to workspaces table
alter table public.workspaces add column if not exists meta_access_token text;
alter table public.workspaces add column if not exists meta_ad_account_id text;
