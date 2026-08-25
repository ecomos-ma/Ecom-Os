-- ============================================================
-- ADD UNIQUE CONSTRAINT ON (workspace_id, content_hash) TO orders TABLE
-- ============================================================

-- This constraint is required for the Google Sheets webhook upsert logic
-- when order_number is not present in the sheet row

ALTER TABLE public.orders 
ADD CONSTRAINT orders_workspace_content_hash_key 
UNIQUE (workspace_id, content_hash);
