-- Ecom OS platform repair: explicit inventory eligibility and an append-only
-- order timeline. This migration is additive and leaves legacy plan data and
-- existing shipping/import flows untouched.

-- Products created from orders have zero stock by design. They are catalog
-- records, not inventory records, until a seller deliberately enables tracking.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS inventory_tracking_enabled boolean NOT NULL DEFAULT false;

-- Preserve tracking for products which demonstrably already contain stock data.
-- Existing zero-value, auto-discovered products intentionally remain untracked.
UPDATE public.products
SET inventory_tracking_enabled = true
WHERE inventory_tracking_enabled = false
  AND (
    COALESCE(initial_stock, 0) <> 0
    OR COALESCE(stock, 0) <> 0
    OR COALESCE(manual_added_stock, 0) <> 0
    OR COALESCE(manual_removed_stock, 0) <> 0
    OR COALESCE(damaged_stock, 0) <> 0
    OR COALESCE(lost_stock, 0) <> 0
    OR COALESCE(reserved_stock, 0) <> 0
    OR COALESCE(out_for_delivery_stock, 0) <> 0
    OR COALESCE(delivered_stock, 0) <> 0
    OR COALESCE(returned_stock, 0) <> 0
  );

CREATE INDEX IF NOT EXISTS idx_products_workspace_inventory_tracking
  ON public.products (workspace_id, inventory_tracking_enabled)
  WHERE inventory_tracking_enabled = true;

-- Inventory movements remain operational only for explicit inventory products.
-- The status trigger itself keeps all existing shipping status behavior.
CREATE OR REPLACE FUNCTION public.update_product_inventory_on_order_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_qty              integer;
  v_product_id       uuid;
  v_old_status       text;
  v_new_status       text;
  v_is_old_ofd       boolean;
  v_is_old_delivered boolean;
  v_is_old_coming    boolean;
  v_is_new_ofd       boolean;
  v_is_new_delivered boolean;
  v_is_new_coming    boolean;
BEGIN
  v_qty := COALESCE(NEW.quantity, 1);

  IF NEW.sku IS NULL OR NEW.sku = 'N/A' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_product_id
  FROM public.products
  WHERE sku = NEW.sku
    AND workspace_id = NEW.workspace_id
    AND inventory_tracking_enabled = true
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_old_status := public.normalize_status(COALESCE(OLD.shipping_status, ''));
  v_new_status := public.normalize_status(COALESCE(NEW.shipping_status, ''));
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  v_is_old_ofd := v_old_status = 'OUT_FOR_DELIVERY';
  v_is_old_delivered := v_old_status = 'DELIVERED';
  v_is_old_coming := v_old_status = 'COMING_BACK';
  v_is_new_ofd := v_new_status = 'OUT_FOR_DELIVERY';
  v_is_new_delivered := v_new_status = 'DELIVERED';
  v_is_new_coming := v_new_status = 'COMING_BACK';

  IF v_is_old_ofd THEN
    UPDATE public.products
    SET out_for_delivery_stock = GREATEST(0, COALESCE(out_for_delivery_stock, 0) - v_qty),
        reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - v_qty)
    WHERE id = v_product_id;
  END IF;
  IF v_is_old_delivered THEN
    UPDATE public.products SET delivered_stock = GREATEST(0, COALESCE(delivered_stock, 0) - v_qty) WHERE id = v_product_id;
  END IF;
  IF v_is_old_coming THEN
    UPDATE public.products SET returned_stock = GREATEST(0, COALESCE(returned_stock, 0) - v_qty) WHERE id = v_product_id;
  END IF;

  IF v_is_new_ofd THEN
    UPDATE public.products
    SET out_for_delivery_stock = COALESCE(out_for_delivery_stock, 0) + v_qty,
        reserved_stock = COALESCE(reserved_stock, 0) + v_qty
    WHERE id = v_product_id;
  END IF;
  IF v_is_new_delivered THEN
    UPDATE public.products SET delivered_stock = COALESCE(delivered_stock, 0) + v_qty WHERE id = v_product_id;
    INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id)
    VALUES (NEW.workspace_id, v_product_id, -v_qty, 'Delivery', NEW.order_number);
  END IF;
  IF v_is_new_coming THEN
    UPDATE public.products SET returned_stock = COALESCE(returned_stock, 0) + v_qty WHERE id = v_product_id;
    INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id)
    VALUES (NEW.workspace_id, v_product_id, v_qty, 'Return', NEW.order_number);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_product_inventory_on_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_qty integer;
  v_product_id uuid;
  v_new_status text;
BEGIN
  v_qty := COALESCE(NEW.quantity, 1);
  IF NEW.sku IS NULL OR NEW.sku = 'N/A' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_product_id
  FROM public.products
  WHERE sku = NEW.sku
    AND workspace_id = NEW.workspace_id
    AND inventory_tracking_enabled = true
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_status := public.normalize_status(COALESCE(NEW.shipping_status, ''));
  IF v_new_status IN ('OUT_FOR_DELIVERY', 'READY') THEN
    UPDATE public.products
    SET out_for_delivery_stock = COALESCE(out_for_delivery_stock, 0) + v_qty,
        reserved_stock = COALESCE(reserved_stock, 0) + v_qty
    WHERE id = v_product_id;
  ELSIF v_new_status = 'DELIVERED' THEN
    UPDATE public.products SET delivered_stock = COALESCE(delivered_stock, 0) + v_qty WHERE id = v_product_id;
  ELSIF v_new_status = 'COMING_BACK' THEN
    UPDATE public.products SET returned_stock = COALESCE(returned_stock, 0) + v_qty WHERE id = v_product_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders("Order ID") ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  previous_value text,
  next_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_workspace_created_at
  ON public.order_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order_created_at
  ON public.order_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_workspace_order_type
  ON public.order_events (workspace_id, order_id, event_type);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order events workspace read" ON public.order_events;
CREATE POLICY "Order events workspace read"
  ON public.order_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

-- Trigger-owned writes keep the audit trail append-only from the browser.
CREATE OR REPLACE FUNCTION public.log_order_event_from_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events (workspace_id, order_id, event_type, source, next_value, metadata, actor_id)
    VALUES (
      NEW.workspace_id,
      NEW."Order ID",
      'ORDER_CREATED',
      COALESCE(NULLIF(NEW.source, ''), 'system'),
      NEW.status,
      jsonb_build_object('order_number', NEW.order_number),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_events (workspace_id, order_id, event_type, source, previous_value, next_value, actor_id)
    VALUES (NEW.workspace_id, NEW."Order ID", 'CONFIRMATION_STATUS_CHANGED', 'system', OLD.status, NEW.status, auth.uid());
  END IF;

  IF NEW.shipping_status IS DISTINCT FROM OLD.shipping_status THEN
    INSERT INTO public.order_events (workspace_id, order_id, event_type, source, previous_value, next_value, actor_id)
    VALUES (NEW.workspace_id, NEW."Order ID", 'SHIPPING_STATUS_CHANGED', 'shipping', OLD.shipping_status, NEW.shipping_status, auth.uid());
  END IF;

  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
    INSERT INTO public.order_events (workspace_id, order_id, event_type, source, previous_value, next_value, actor_id)
    VALUES (NEW.workspace_id, NEW."Order ID", 'DELIVERY_STATUS_CHANGED', 'shipping', OLD.delivery_status, NEW.delivery_status, auth.uid());
  END IF;

  IF NEW.tracking_number IS DISTINCT FROM OLD.tracking_number THEN
    INSERT INTO public.order_events (workspace_id, order_id, event_type, source, previous_value, next_value, actor_id)
    VALUES (NEW.workspace_id, NEW."Order ID", 'TRACKING_NUMBER_CHANGED', 'shipping', OLD.tracking_number, NEW.tracking_number, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_event_on_insert ON public.orders;
CREATE TRIGGER order_event_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_event_from_change();

DROP TRIGGER IF EXISTS order_event_on_change ON public.orders;
CREATE TRIGGER order_event_on_change
AFTER UPDATE OF status, shipping_status, delivery_status, tracking_number ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_event_from_change();
