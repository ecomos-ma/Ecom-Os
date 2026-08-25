-- ============================================================
-- EcomOS · YouCan Webhook ID on workspaces
-- ============================================================
-- Stores the webhook subscription ID returned by YouCan after
-- calling POST /resthooks/subscribe. Used to avoid duplicate
-- webhook registrations and to allow unsubscribing.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS youcan_webhook_id TEXT;

COMMENT ON COLUMN public.workspaces.youcan_webhook_id IS 'YouCan REST hook subscription ID (from POST /resthooks/subscribe). NULL if webhook not yet registered.';
