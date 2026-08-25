-- ═══════════════════════════════════════════════════════════════
-- 060_status_mapping.sql
-- Create a centralized normalize_status function and update triggers
-- ═══════════════════════════════════════════════════════════════

-- 1. Create a centralized function that exactly matches the frontend logic
CREATE OR REPLACE FUNCTION public.normalize_status(raw_status TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized TEXT := LOWER(TRIM(raw_status));
BEGIN
    IF normalized IS NULL THEN
        RETURN 'NEW';
    END IF;

    -- DELIVERED
    IF normalized IN ('livré', 'livre', 'delivered') THEN
        RETURN 'DELIVERED';
    END IF;

    -- COMING BACK
    IF normalized IN ('retourné', 'retourne', 'refusé', 'refuse', 'annulé', 'annule', 'returned', 'refused', 'cancelled', 'canceled') THEN
        RETURN 'COMING_BACK';
    END IF;

    -- CONFIRMED
    IF normalized IN ('confirmé', 'confirme', 'confirmed') THEN
        RETURN 'CONFIRMED';
    END IF;

    -- OUT FOR DELIVERY
    IF normalized IN (
        'nouveau colis', 'attente de ramassage', 'ramassé', 'ramasse', 'reçu en agence', 'recu en agence', 
        'expédié', 'expedie', 'mise en distribution', 'en cours de livraison', 
        'reporté', 'reporte', 'pas de réponse', 'pas de reponse', 'injoignable', 'occupé', 'occupe',
        'new parcel', 'waiting for pickup', 'picked up', 'received at agency', 
        'shipped', 'in distribution', 'out for delivery', 
        'postponed', 'no answer', 'unreachable', 'busy'
    ) THEN
        RETURN 'OUT_FOR_DELIVERY';
    END IF;

    -- Default to NEW for Nouveau, New, Pending, etc.
    RETURN 'NEW';
END;
$$ LANGUAGE plpgsql;

-- 2. Update the update trigger to use the new centralized function
CREATE OR REPLACE FUNCTION update_product_inventory_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  v_qty INTEGER := 1;
  v_product_id UUID;
  v_old_status TEXT;
  v_new_status TEXT;
  v_is_old_reserved BOOLEAN;
  v_is_old_delivered BOOLEAN;
  v_is_old_returned BOOLEAN;
  v_is_old_cancelled BOOLEAN;
  v_is_new_reserved BOOLEAN;
  v_is_new_delivered BOOLEAN;
  v_is_new_returned BOOLEAN;
  v_is_new_cancelled BOOLEAN;
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id FROM public.products WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id LIMIT 1;
    
    IF v_product_id IS NOT NULL THEN
      -- Get internal status using exact single source of truth mapping
      v_old_status := public.normalize_status(COALESCE(OLD.status, ''));
      v_new_status := public.normalize_status(NEW.status);
      
      -- Classify old status - Note we don't have separate cancelled/returned stocks anymore, 
      -- wait, the schema still has reserved_stock, out_for_delivery_stock, delivered_stock, returned_stock, cancelled_stock
      -- We will map our internal status to those columns:
      -- NEW: none
      -- CONFIRMED: reserved_stock
      -- OUT_FOR_DELIVERY: out_for_delivery_stock (also reserved_stock in old schema, let's just use both or map exactly)
      
      v_is_old_reserved := v_old_status IN ('CONFIRMED', 'OUT_FOR_DELIVERY');
      v_is_old_delivered := v_old_status = 'DELIVERED';
      v_is_old_returned := v_old_status = 'COMING_BACK';
      
      v_is_new_reserved := v_new_status IN ('CONFIRMED', 'OUT_FOR_DELIVERY');
      v_is_new_delivered := v_new_status = 'DELIVERED';
      v_is_new_returned := v_new_status = 'COMING_BACK';
      
      IF (v_is_old_reserved != v_is_new_reserved) OR 
         (v_is_old_delivered != v_is_new_delivered) OR 
         (v_is_old_returned != v_is_new_returned) THEN
         
         -- First, undo the old status effect
         IF v_is_old_reserved THEN
             UPDATE public.products SET reserved_stock = reserved_stock - v_qty, out_for_delivery_stock = out_for_delivery_stock - (CASE WHEN v_old_status = 'OUT_FOR_DELIVERY' THEN v_qty ELSE 0 END) WHERE id = v_product_id;
         END IF;
         IF v_is_old_delivered THEN
             UPDATE public.products SET delivered_stock = delivered_stock - v_qty WHERE id = v_product_id;
         END IF;
         IF v_is_old_returned THEN
             UPDATE public.products SET returned_stock = returned_stock - v_qty WHERE id = v_product_id;
         END IF;

         -- Then, apply the new status effect
         IF v_is_new_reserved THEN
             UPDATE public.products SET reserved_stock = reserved_stock + v_qty, out_for_delivery_stock = out_for_delivery_stock + (CASE WHEN v_new_status = 'OUT_FOR_DELIVERY' THEN v_qty ELSE 0 END) WHERE id = v_product_id;
         END IF;
         IF v_is_new_delivered THEN
             UPDATE public.products SET delivered_stock = delivered_stock + v_qty WHERE id = v_product_id;
             INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id) VALUES (NEW.workspace_id, v_product_id, -v_qty, 'Delivery', NEW.order_number);
         END IF;
         IF v_is_new_returned THEN
             UPDATE public.products SET returned_stock = returned_stock + v_qty WHERE id = v_product_id;
             INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id) VALUES (NEW.workspace_id, v_product_id, v_qty, 'Return', NEW.order_number);
         END IF;
         
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Update the insert trigger
CREATE OR REPLACE FUNCTION insert_product_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_qty INTEGER := 1;
  v_product_id UUID;
  v_new_status TEXT;
  v_is_new_reserved BOOLEAN;
  v_is_new_delivered BOOLEAN;
  v_is_new_returned BOOLEAN;
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id FROM public.products WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id LIMIT 1;
    IF v_product_id IS NOT NULL THEN
      v_new_status := public.normalize_status(NEW.status);
      v_is_new_reserved := v_new_status IN ('CONFIRMED', 'OUT_FOR_DELIVERY');
      v_is_new_delivered := v_new_status = 'DELIVERED';
      v_is_new_returned := v_new_status = 'COMING_BACK';
      
      IF v_is_new_reserved THEN
          UPDATE public.products SET reserved_stock = reserved_stock + v_qty, out_for_delivery_stock = out_for_delivery_stock + (CASE WHEN v_new_status = 'OUT_FOR_DELIVERY' THEN v_qty ELSE 0 END) WHERE id = v_product_id;
      END IF;
      IF v_is_new_delivered THEN
          UPDATE public.products SET delivered_stock = delivered_stock + v_qty WHERE id = v_product_id;
      END IF;
      IF v_is_new_returned THEN
          UPDATE public.products SET returned_stock = returned_stock + v_qty WHERE id = v_product_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
