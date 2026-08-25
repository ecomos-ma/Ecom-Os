-- Shopify Integration Migration
-- ============================================================

-- Add Shopify columns to workspaces table
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS shopify_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopify_shop_domain text,
  ADD COLUMN IF NOT EXISTS shopify_access_token text,
  ADD COLUMN IF NOT EXISTS shopify_refresh_token text,
  ADD COLUMN IF NOT EXISTS shopify_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_scopes text,
  ADD COLUMN IF NOT EXISTS shopify_connected_at timestamptz;

-- Add indexes for Shopify-related queries
CREATE INDEX IF NOT EXISTS workspaces_shopify_enabled_idx ON public.workspaces(shopify_enabled) WHERE shopify_enabled = true;
CREATE INDEX IF NOT EXISTS workspaces_shopify_shop_domain_idx ON public.workspaces(shopify_shop_domain) WHERE shopify_shop_domain IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.workspaces.shopify_enabled IS 'Whether Shopify integration is enabled for this workspace';
COMMENT ON COLUMN public.workspaces.shopify_shop_domain IS 'Shopify shop domain (e.g., "my-store.myshopify.com")';
COMMENT ON COLUMN public.workspaces.shopify_access_token IS 'Shopify OAuth access token for this shop';
COMMENT ON COLUMN public.workspaces.shopify_refresh_token IS 'Shopify OAuth refresh token for obtaining new access tokens';
COMMENT ON COLUMN public.workspaces.shopify_expires_at IS 'Timestamp when the access token expires (typically 60 minutes)';
COMMENT ON COLUMN public.workspaces.shopify_scopes IS 'Shopify OAuth scopes granted to the app';
COMMENT ON COLUMN public.workspaces.shopify_connected_at IS 'Timestamp when Shopify integration was connected';
