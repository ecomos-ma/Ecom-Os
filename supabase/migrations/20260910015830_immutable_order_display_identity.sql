-- Legacy provider upserts may still carry an order_number. Once assigned, the
-- seller-facing identity is immutable and must not be renumbered by an update.
UPDATE public.orders
SET order_number = display_order_id
WHERE order_number IS DISTINCT FROM display_order_id;

CREATE OR REPLACE FUNCTION public.preserve_order_display_identity_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.order_source := OLD.order_source;
  NEW.order_sequence_number := OLD.order_sequence_number;
  NEW.display_order_id := OLD.display_order_id;
  NEW.order_number := OLD.display_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_preserve_display_identity_trigger ON public.orders;
CREATE TRIGGER orders_preserve_display_identity_trigger
BEFORE UPDATE OF workspace_id, source, source_platform, order_source,
  order_sequence_number, display_order_id, order_number
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.preserve_order_display_identity_v1();

REVOKE ALL ON FUNCTION public.preserve_order_display_identity_v1()
FROM PUBLIC, anon, authenticated;
