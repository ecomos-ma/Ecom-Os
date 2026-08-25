-- ============================================================
-- ADD UNIQUE CONSTRAINT ON (workspace_id, sync_key) TO orders TABLE
-- ============================================================

-- This constraint is required for the Google Sheets sync upsert logic
-- using sync_key (phone + order_date) for deduplication

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_workspace_sync_key_key'
  ) THEN
    ALTER TABLE public.orders 
    ADD CONSTRAINT orders_workspace_sync_key_key 
    UNIQUE (workspace_id, sync_key);
  END IF;
END $$;
