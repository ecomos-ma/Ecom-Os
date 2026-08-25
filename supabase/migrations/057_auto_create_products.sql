-- ==============================================================================
-- Migration to automatically create and clean products when new orders are inserted
-- ==============================================================================

-- 1. Function to clean product names (removing prices, emojis, etc.)
CREATE OR REPLACE FUNCTION public.clean_product_name(raw_name TEXT)
RETURNS TEXT AS $$
DECLARE
    cleaned TEXT;
BEGIN
    if raw_name is null then return 'Unknown Product'; end if;
    
    -- 1. Remove price patterns like '159 MAD', '199 درهم', 'DH', etc.
    cleaned := regexp_replace(raw_name, '[0-9]+[.,]?[0-9]*\s*(MAD|درهم|DH|DHS|MADs?|dh)\M', '', 'ig');
    
    -- 2. Strip out emojis (Basic multilingual plane and supplementary planes)
    -- This relies on stripping non-alphanumeric/spaces/dashes. We want to keep Arabic letters!
    -- Arabic block is \u0600-\u06FF. English is A-Za-z0-9. Space is \s. Dash is -. 
    -- So we just keep safe characters. 
    -- Wait, Postgres regex syntax for unicode properties? We can just strip common symbols.
    cleaned := regexp_replace(cleaned, '[^\p{L}\p{N}\s-]', '', 'g'); -- keeps letters, numbers, spaces, dash.
    
    -- 3. Replace multiple spaces with a single space
    cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
    
    -- 4. Trim leading/trailing spaces
    cleaned := trim(cleaned);
    
    -- If it's completely empty after cleaning, return the original (maybe just stripped of emojis)
    IF cleaned = '' THEN
        RETURN left(trim(raw_name), 50);
    END IF;
    
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Function to generate a safe SKU from a name
CREATE OR REPLACE FUNCTION public.generate_sku_from_name(raw_name TEXT)
RETURNS TEXT AS $$
DECLARE
    sku_val TEXT;
BEGIN
    -- lower case and replace spaces with hyphens
    sku_val := lower(regexp_replace(raw_name, '\s+', '-', 'g'));
    -- remove anything that's not alphanumeric or hyphen
    sku_val := regexp_replace(sku_val, '[^a-z0-9-]', '', 'g');
    
    IF sku_val = '' OR sku_val IS NULL THEN
        sku_val := 'sku-' || substr(md5(random()::text), 1, 6);
    END IF;
    
    RETURN substr(sku_val, 1, 30);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Update the insert trigger function to auto-create missing products
CREATE OR REPLACE FUNCTION insert_product_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_qty INTEGER := 1;
  v_product_id UUID;
  v_new_status TEXT;
  v_is_new_reserved BOOLEAN;
  v_is_new_delivered BOOLEAN;
  v_is_new_returned BOOLEAN;
  v_is_new_cancelled BOOLEAN;
  
  v_clean_name TEXT;
  v_clean_sku TEXT;
  v_selling_price NUMERIC;
BEGIN
  -- We extract name and SKU from order product_variant or sku
  v_clean_name := COALESCE(NEW.product_variant, NEW.sku, 'Unknown Product');
  v_clean_name := public.clean_product_name(v_clean_name);
  
  -- If sku is missing, dirty or 'N/A', we generate it from the clean name.
  IF NEW.sku IS NULL OR NEW.sku = '' OR NEW.sku = 'N/A' THEN
      v_clean_sku := public.generate_sku_from_name(v_clean_name);
  ELSE
      v_clean_sku := NEW.sku;
  END IF;
  
  -- We use variant_price or total as price
  v_selling_price := COALESCE(NEW.variant_price, NEW.total, 0);

  IF v_clean_sku IS NOT NULL AND v_clean_sku != 'N/A' THEN
    -- Try to find product by sku OR by exact name match in workspace
    SELECT id INTO v_product_id FROM public.products 
    WHERE (sku = v_clean_sku OR lower(name) = lower(v_clean_name)) 
      AND workspace_id = NEW.workspace_id 
    LIMIT 1;
    
    -- CREATE it if missing
    IF v_product_id IS NULL THEN
      INSERT INTO public.products (
        workspace_id,
        name,
        sku,
        price,
        cost,             -- default cost
        stock,
        initial_stock,    -- initial stock
        status
      ) VALUES (
        NEW.workspace_id,
        v_clean_name,
        v_clean_sku,
        v_selling_price,
        0,                -- purchase cost default
        0,
        0,
        'active'
      ) RETURNING id INTO v_product_id;
    END IF;
    
    -- Now standard inventory application
    IF v_product_id IS NOT NULL THEN
      v_new_status := LOWER(NEW.status);
      v_is_new_reserved := v_new_status IN ('confirmed', 'pending_confirmation', 'ready', 'preparing', 'packaging', 'waiting_pickup', 'picked_up', 'received_at_agency', 'distribution', 'out_for_delivery', 'pas_reponse', 'reporte', 'reconfirmed', 'customer_requested_delay', 'waiting_customer', 'shipped', 'mise en distribution');
      v_is_new_delivered := v_new_status IN ('delivered', 'livre', 'تم التسليم');
      v_is_new_returned := v_new_status IN ('returned', 'retour', 'retour expediteur', 'returned to sender', 'rts', 'رجع');
      v_is_new_cancelled := v_new_status IN ('cancelled', 'رفض', 'duplicate', 'fake', 'wrong_number', 'cancelled_before_shipping', 'customer_cancelled', 'delete_order', 'canceled');
      
      IF v_is_new_reserved THEN
          UPDATE public.products SET reserved_stock = reserved_stock + v_qty, out_for_delivery_stock = out_for_delivery_stock + v_qty WHERE id = v_product_id;
      END IF;
      IF v_is_new_delivered THEN
          UPDATE public.products SET delivered_stock = delivered_stock + v_qty WHERE id = v_product_id;
      END IF;
      IF v_is_new_returned THEN
          UPDATE public.products SET returned_stock = returned_stock + v_qty WHERE id = v_product_id;
      END IF;
      IF v_is_new_cancelled THEN
          UPDATE public.products SET cancelled_stock = cancelled_stock + v_qty WHERE id = v_product_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure products has initial_stock
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS initial_stock INTEGER DEFAULT 0;
