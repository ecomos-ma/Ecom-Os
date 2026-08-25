-- ═══════════════════════════════════════════════════════════════
-- 061_shipping_status_triggers.sql
-- Update normalize_status to match shipping status strings from Ozon/Coliaty
-- Update DB triggers to fire on shipping_status changes and use order.quantity
-- ═══════════════════════════════════════════════════════════════

-- 1. Update centralized normalize_status to work for shipping status strings
CREATE OR REPLACE FUNCTION public.normalize_status(raw_status TEXT)
RETURNS TEXT AS $$
DECLARE
    s TEXT := LOWER(TRIM(COALESCE(raw_status, '')));
BEGIN
    -- DELIVERED
    IF s IN ('livré', 'livre', 'delivered') THEN
        RETURN 'DELIVERED';
    END IF;

    -- COMING BACK (Returned / Refused / Cancelled)
    IF s IN (
        'refusé', 'refuse', 'refused',
        'retourné', 'retourne', 'returned',
        'retourné à l''expéditeur', 'retourne a l''expediteur', 'return to sender',
        'annulé', 'annule', 'cancelled', 'canceled'
    ) THEN
        RETURN 'COMING_BACK';
    END IF;

    -- OUT FOR DELIVERY (in transit / en cours)
    IF s IN (
        'mise en distribution',
        'en cours de livraison',
        'out for delivery',
        'in delivery',
        'in transit'
    ) THEN
        RETURN 'OUT_FOR_DELIVERY';
    END IF;

    -- READY (picked up by carrier, at agency, waiting)
    IF s IN (
        'nouveau colis', 'new parcel',
        'en attente de ramassage', 'attente de ramassage', 'waiting for pickup',
        'ramassé', 'ramasse', 'picked up',
        'reçu en agence', 'recu en agence', 'received at agency'
    ) THEN
        RETURN 'READY';
    END IF;

    -- CONFIRMED (order confirmed, not yet shipped)
    IF s IN ('confirmé', 'confirme', 'confirmed') THEN
        RETURN 'CONFIRMED';
    END IF;

    -- Default to NEW
    RETURN 'NEW';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Drop old trigger on status column, rebuild on shipping_status
DROP TRIGGER IF EXISTS order_status_inventory_trigger ON public.orders;
DROP TRIGGER IF EXISTS order_shipping_status_inventory_trigger ON public.orders;

-- 3. Rebuild update trigger function — operates on shipping_status, uses quantity
CREATE OR REPLACE FUNCTION update_product_inventory_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  v_qty              INTEGER;
  v_product_id       UUID;
  v_old_status       TEXT;
  v_new_status       TEXT;
  v_is_old_ofd       BOOLEAN;
  v_is_old_delivered BOOLEAN;
  v_is_old_coming    BOOLEAN;
  v_is_new_ofd       BOOLEAN;
  v_is_new_delivered BOOLEAN;
  v_is_new_coming    BOOLEAN;
BEGIN
  -- Use actual order quantity, not hardcoded 1
  v_qty := COALESCE(NEW.quantity, 1);

  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id
      FROM public.products
     WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id
     LIMIT 1;

    IF v_product_id IS NOT NULL THEN
      -- Normalize both shipping_status values
      v_old_status := public.normalize_status(COALESCE(OLD.shipping_status, ''));
      v_new_status := public.normalize_status(COALESCE(NEW.shipping_status, ''));

      -- Only act when the normalized status actually changed
      IF v_old_status != v_new_status THEN

        v_is_old_ofd       := v_old_status = 'OUT_FOR_DELIVERY';
        v_is_old_delivered := v_old_status = 'DELIVERED';
        v_is_old_coming    := v_old_status = 'COMING_BACK';

        v_is_new_ofd       := v_new_status = 'OUT_FOR_DELIVERY';
        v_is_new_delivered := v_new_status = 'DELIVERED';
        v_is_new_coming    := v_new_status = 'COMING_BACK';

        -- Undo old status effect
        IF v_is_old_ofd THEN
          UPDATE public.products
             SET out_for_delivery_stock = GREATEST(0, out_for_delivery_stock - v_qty),
                 reserved_stock         = GREATEST(0, reserved_stock         - v_qty)
           WHERE id = v_product_id;
        END IF;
        IF v_is_old_delivered THEN
          UPDATE public.products
             SET delivered_stock = GREATEST(0, delivered_stock - v_qty)
           WHERE id = v_product_id;
        END IF;
        IF v_is_old_coming THEN
          UPDATE public.products
             SET returned_stock = GREATEST(0, returned_stock - v_qty)
           WHERE id = v_product_id;
        END IF;

        -- Apply new status effect
        IF v_is_new_ofd THEN
          UPDATE public.products
             SET out_for_delivery_stock = out_for_delivery_stock + v_qty,
                 reserved_stock         = reserved_stock + v_qty
           WHERE id = v_product_id;
        END IF;
        IF v_is_new_delivered THEN
          UPDATE public.products
             SET delivered_stock = delivered_stock + v_qty
           WHERE id = v_product_id;
          INSERT INTO public.stock_history
            (workspace_id, product_id, quantity_change, reason, reference_id)
          VALUES
            (NEW.workspace_id, v_product_id, -v_qty, 'Delivery', NEW.order_number);
        END IF;
        IF v_is_new_coming THEN
          UPDATE public.products
             SET returned_stock = returned_stock + v_qty
           WHERE id = v_product_id;
          INSERT INTO public.stock_history
            (workspace_id, product_id, quantity_change, reason, reference_id)
          VALUES
            (NEW.workspace_id, v_product_id, v_qty, 'Return', NEW.order_number);
        END IF;

      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create new trigger that fires on shipping_status changes
CREATE TRIGGER order_shipping_status_inventory_trigger
AFTER UPDATE OF shipping_status ON public.orders
FOR EACH ROW
WHEN (OLD.shipping_status IS DISTINCT FROM NEW.shipping_status)
EXECUTE FUNCTION update_product_inventory_on_order_status();

-- 5. Rebuild insert trigger — also uses shipping_status + quantity
CREATE OR REPLACE FUNCTION insert_product_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_qty          INTEGER;
  v_product_id   UUID;
  v_new_status   TEXT;
BEGIN
  v_qty := COALESCE(NEW.quantity, 1);

  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id
      FROM public.products
     WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id
     LIMIT 1;

    IF v_product_id IS NOT NULL THEN
      v_new_status := public.normalize_status(COALESCE(NEW.shipping_status, ''));

      IF v_new_status = 'OUT_FOR_DELIVERY' OR v_new_status = 'READY' THEN
        UPDATE public.products
           SET out_for_delivery_stock = out_for_delivery_stock + v_qty,
               reserved_stock         = reserved_stock + v_qty
         WHERE id = v_product_id;
      END IF;
      IF v_new_status = 'DELIVERED' THEN
        UPDATE public.products
           SET delivered_stock = delivered_stock + v_qty
         WHERE id = v_product_id;
      END IF;
      IF v_new_status = 'COMING_BACK' THEN
        UPDATE public.products
           SET returned_stock = returned_stock + v_qty
         WHERE id = v_product_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the insert trigger (drop old one first if it exists)
DROP TRIGGER IF EXISTS order_insert_inventory_trigger ON public.orders;

CREATE TRIGGER order_insert_inventory_trigger
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION insert_product_inventory_on_order();
