-- ============================================================
-- Add customer_name to orders and backfill from customers
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS orders_customer_name_idx
  ON public.orders (customer_name);

COMMENT ON COLUMN public.orders.customer_name IS
  'Denormalized customer name for orders where customer_id is missing or when external source data should be preserved.';

-- Backfill existing orders from linked customer records when available.
UPDATE public.orders o
SET customer_name = c.name
FROM public.customers c
WHERE o.customer_id = c.id
  AND (o.customer_name IS NULL OR trim(o.customer_name) = '');
