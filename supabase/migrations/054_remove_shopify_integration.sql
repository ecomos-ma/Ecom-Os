-- ============================================================
-- EcomOS · Remove Shopify Integration — Complete Rollback
-- ============================================================
-- This migration reverses all Shopify-related changes:
-- - Migration 053: shopify_order_id in orders table
-- - Migration 052: shopify_refresh_token, shopify_expires_at in workspaces
-- - Migration 051: all Shopify columns in workspaces

-- Drop indexes from migration 053
DROP INDEX IF EXISTS public.orders_workspace_shopify_order_id_idx;
DROP INDEX IF EXISTS public.orders_shopify_order_id_idx;

-- Drop column from migration 053
ALTER TABLE public.orders DROP COLUMN IF EXISTS shopify_order_id;

-- Drop indexes from migration 051
DROP INDEX IF EXISTS public.workspaces_shopify_enabled_idx;
DROP INDEX IF EXISTS public.workspaces_shopify_shop_domain_idx;

-- Drop all Shopify columns from workspaces (migrations 051 and 052)
ALTER TABLE public.workspaces 
  DROP COLUMN IF EXISTS shopify_enabled,
  DROP COLUMN IF EXISTS shopify_shop_domain,
  DROP COLUMN IF EXISTS shopify_access_token,
  DROP COLUMN IF EXISTS shopify_refresh_token,
  DROP COLUMN IF EXISTS shopify_expires_at,
  DROP COLUMN IF EXISTS shopify_scopes,
  DROP COLUMN IF EXISTS shopify_connected_at;
