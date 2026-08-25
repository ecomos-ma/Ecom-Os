-- Fix: sync-google-sheets-orders edge function returns 500 because the
-- orders.sync_key column does not exist.
-- Migration 067 added a UNIQUE constraint on (workspace_id, sync_key) but
-- never actually added the column itself.  This migration adds the column
-- and (re-)creates the constraint idempotently.

-- 1. Add the column (safe no-op if it already exists)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sync_key TEXT;

-- 2. Re-create the unique constraint idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_workspace_sync_key_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_workspace_sync_key_key
      UNIQUE (workspace_id, sync_key);
  END IF;
END $$;

-- 3. Create a partial index to speed up lookups (skips rows without a sync_key)
CREATE INDEX IF NOT EXISTS orders_workspace_sync_key_idx
  ON public.orders (workspace_id, sync_key)
  WHERE sync_key IS NOT NULL;
