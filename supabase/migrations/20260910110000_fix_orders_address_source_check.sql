-- Keep orders address updates compatible with all supported address sources.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_address_source_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_address_source_check
  CHECK (
    address_source IS NULL
    OR address_source IN (
      'manual',
      'customer',
      'whatsapp',
      'whatsapp_automation',
      'confirmation_agent'
    )
  );