-- ═══════════════════════════════════════════════════════════════
-- 063_return_to_stock.sql
-- Adds `returned_to_stock` flag to orders for warehouse return processing.
-- Also adds index on tracking_number for fast barcode/scanner lookups.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add returned_to_stock column to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS returned_to_stock BOOLEAN NOT NULL DEFAULT false;

-- 2. Index on tracking_number for fast scanner lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);

-- 3. Also index coliaty_parcel_code so that Coliaty parcels are fast too
CREATE INDEX IF NOT EXISTS idx_orders_coliaty_parcel_code ON public.orders(coliaty_parcel_code);

-- 4. Add movement_type to stock_history so Return To Stock operations are
--    distinguishable from automatic triggers
ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS movement_type TEXT DEFAULT 'AUTO';

-- Update existing rows to mark them as AUTO
UPDATE public.stock_history SET movement_type = 'AUTO' WHERE movement_type IS NULL;
