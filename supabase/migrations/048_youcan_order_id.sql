-- ============================================================
-- EcomOS · YouCan Order ID — idempotent sync key
-- ============================================================
-- Add youcan_order_id to orders table so we can upsert YouCan orders
-- without relying on order_number uniqueness (which is global, not workspace-scoped).
-- The unique index is (workspace_id, youcan_order_id) for proper multi-tenant isolation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS youcan_order_id TEXT;

-- Unique index scoped by workspace (allows different workspaces to have orders from YouCan
-- with the same ID, but prevents duplicates within a single workspace)
CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_youcan_order_id_idx
  ON public.orders (workspace_id, youcan_order_id)
  WHERE youcan_order_id IS NOT NULL;

-- Regular index for fast lookups by youcan_order_id
CREATE INDEX IF NOT EXISTS orders_youcan_order_id_idx
  ON public.orders (youcan_order_id)
  WHERE youcan_order_id IS NOT NULL;

COMMENT ON COLUMN public.orders.youcan_order_id IS 'YouCan internal order UUID — used as idempotency key for YouCan order sync (source=youcan)';
