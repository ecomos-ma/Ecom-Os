-- ============================================================
-- ECOM SCALE — Script SQL YouCan Orders Sync
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Migration 048 : Colonne youcan_order_id sur orders ─────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS youcan_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_youcan_order_id_idx
  ON public.orders (workspace_id, youcan_order_id)
  WHERE youcan_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_youcan_order_id_idx
  ON public.orders (youcan_order_id)
  WHERE youcan_order_id IS NOT NULL;

COMMENT ON COLUMN public.orders.youcan_order_id IS 'YouCan internal order UUID — clé idempotente pour la sync YouCan (source=youcan)';

-- ── Migration 049 : Colonne youcan_webhook_id sur workspaces ───────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS youcan_webhook_id TEXT;

COMMENT ON COLUMN public.workspaces.youcan_webhook_id IS 'ID du webhook REST enregistré sur YouCan (POST /resthooks/subscribe). NULL si webhook non encore enregistré.';

-- ── Vérification ────────────────────────────────────────────────────────────
-- Confirmer que les colonnes existent bien :
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('youcan_order_id', 'source')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workspaces'
  AND column_name IN ('youcan_access_token', 'youcan_webhook_id', 'youcan_client_id')
ORDER BY column_name;
