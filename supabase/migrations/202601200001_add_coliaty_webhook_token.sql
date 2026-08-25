-- ============================================================
-- Add Coliaty webhook token column to workspaces
-- ============================================================
-- This enables workspace-isolated Coliaty webhooks.
-- Each workspace gets a unique webhook token that maps to its ID,
-- preventing cross-workspace order updates via webhook.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS coliaty_webhook_token TEXT UNIQUE;

COMMENT ON COLUMN public.workspaces.coliaty_webhook_token IS 'Unique token for Coliaty webhook events. Maps incoming webhooks to the correct workspace for strict isolation.';
