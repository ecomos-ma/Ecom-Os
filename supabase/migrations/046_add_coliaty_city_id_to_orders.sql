-- ============================================================
-- Add coliaty_city_id to orders table
-- ============================================================

-- Add coliaty_city_id column to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS coliaty_city_id bigint;

-- Add index for performance
CREATE INDEX IF NOT EXISTS orders_coliaty_city_id_idx ON public.orders (coliaty_city_id);

-- Add comment
COMMENT ON COLUMN public.orders.coliaty_city_id IS 'Coliaty city ID reference (foreign key to coliaty_cities.id)';
