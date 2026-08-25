-- Add columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS variant TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS manual_added_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_removed_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_for_delivery_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_stock INTEGER DEFAULT 0;

-- Create stock_history table
CREATE TABLE IF NOT EXISTS public.stock_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_change INTEGER NOT NULL,
  reason TEXT NOT NULL, -- e.g. 'Delivery', 'Return', 'Manual Adjustment', 'Initial Stock', 'Damaged'
  reference_id TEXT, -- e.g. order ID or manual adjustment ref
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on stock_history
ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;

-- Policies for stock_history
CREATE POLICY "Users can view stock_history of their workspace"
  ON public.stock_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT pm.workspace_id 
      FROM public.profile_workspaces pm 
      WHERE pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stock_history in their workspace"
  ON public.stock_history FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT pm.workspace_id 
      FROM public.profile_workspaces pm 
      WHERE pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can update stock_history in their workspace"
  ON public.stock_history FOR UPDATE
  USING (
    workspace_id IN (
      SELECT pm.workspace_id 
      FROM public.profile_workspaces pm 
      WHERE pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete stock_history in their workspace"
  ON public.stock_history FOR DELETE
  USING (
    workspace_id IN (
      SELECT pm.workspace_id 
      FROM public.profile_workspaces pm 
      WHERE pm.profile_id = auth.uid()
    )
  );

-- Create trigger function on orders to update products inventory
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
  -- We match by sku and workspace_id to find the product
  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id FROM public.products WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id LIMIT 1;
    
    -- If product is not found via SKU, try returning. Note: Product must exist.
    IF v_product_id IS NOT NULL THEN
      
      v_old_status := LOWER(COALESCE(OLD.status, ''));
      v_new_status := LOWER(NEW.status);
      
      -- Classify old status
      v_is_old_reserved := v_old_status IN ('confirmed', 'pending_confirmation', 'ready', 'preparing', 'packaging', 'waiting_pickup', 'picked_up', 'received_at_agency', 'distribution', 'out_for_delivery', 'pas_reponse', 'reporte', 'reconfirmed', 'customer_requested_delay', 'waiting_customer', 'shipped', 'mise en distribution');
      v_is_old_delivered := v_old_status IN ('delivered', 'livre', 'تم التسليم');
      v_is_old_returned := v_old_status IN ('returned', 'retour', 'retour expediteur', 'returned to sender', 'rts', 'رجع');
      v_is_old_cancelled := v_old_status IN ('cancelled', 'رفض', 'duplicate', 'fake', 'wrong_number', 'cancelled_before_shipping', 'customer_cancelled', 'delete_order', 'canceled');
      
      -- Classify new status
      v_is_new_reserved := v_new_status IN ('confirmed', 'pending_confirmation', 'ready', 'preparing', 'packaging', 'waiting_pickup', 'picked_up', 'received_at_agency', 'distribution', 'out_for_delivery', 'pas_reponse', 'reporte', 'reconfirmed', 'customer_requested_delay', 'waiting_customer', 'shipped', 'mise en distribution');
      v_is_new_delivered := v_new_status IN ('delivered', 'livre', 'تم التسليم');
      v_is_new_returned := v_new_status IN ('returned', 'retour', 'retour expediteur', 'returned to sender', 'rts', 'رجع');
      v_is_new_cancelled := v_new_status IN ('cancelled', 'رفض', 'duplicate', 'fake', 'wrong_number', 'cancelled_before_shipping', 'customer_cancelled', 'delete_order', 'canceled');
      
      -- Only proceed if status category changed
      IF (v_is_old_reserved != v_is_new_reserved) OR 
         (v_is_old_delivered != v_is_new_delivered) OR 
         (v_is_old_returned != v_is_new_returned) OR 
         (v_is_old_cancelled != v_is_new_cancelled) THEN
         
         -- First, undo the old status effect
         IF v_is_old_reserved THEN
             UPDATE public.products SET reserved_stock = reserved_stock - v_qty, out_for_delivery_stock = out_for_delivery_stock - v_qty WHERE id = v_product_id;
         END IF;
         IF v_is_old_delivered THEN
             UPDATE public.products SET delivered_stock = delivered_stock - v_qty WHERE id = v_product_id;
         END IF;
         IF v_is_old_returned THEN
             UPDATE public.products SET returned_stock = returned_stock - v_qty WHERE id = v_product_id;
         END IF;
         IF v_is_old_cancelled THEN
             UPDATE public.products SET cancelled_stock = cancelled_stock - v_qty WHERE id = v_product_id;
         END IF;

         -- Then, apply the new status effect
         IF v_is_new_reserved THEN
             UPDATE public.products SET reserved_stock = reserved_stock + v_qty, out_for_delivery_stock = out_for_delivery_stock + v_qty WHERE id = v_product_id;
         END IF;
         IF v_is_new_delivered THEN
             UPDATE public.products SET delivered_stock = delivered_stock + v_qty WHERE id = v_product_id;
             INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id) VALUES (NEW.workspace_id, v_product_id, -v_qty, 'Delivery', NEW.order_number);
         END IF;
         IF v_is_new_returned THEN
             UPDATE public.products SET returned_stock = returned_stock + v_qty WHERE id = v_product_id;
             INSERT INTO public.stock_history (workspace_id, product_id, quantity_change, reason, reference_id) VALUES (NEW.workspace_id, v_product_id, v_qty, 'Return', NEW.order_number);
         END IF;
         IF v_is_new_cancelled THEN
             UPDATE public.products SET cancelled_stock = cancelled_stock + v_qty WHERE id = v_product_id;
         END IF;
         
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_status_inventory_trigger ON public.orders;

CREATE TRIGGER order_status_inventory_trigger
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_product_inventory_on_order_status();

-- Also create trigger for new orders
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
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku != 'N/A' THEN
    SELECT id INTO v_product_id FROM public.products WHERE sku = NEW.sku AND workspace_id = NEW.workspace_id LIMIT 1;
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

DROP TRIGGER IF EXISTS order_insert_inventory_trigger ON public.orders;

CREATE TRIGGER order_insert_inventory_trigger
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION insert_product_inventory_on_order();
