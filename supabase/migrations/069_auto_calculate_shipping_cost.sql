-- Migration: Smart Shipping Cost Engine with Refused Pricing Support
-- Automatically calculates shipping_cost based on city with provider pricing and business fee fallback
-- Supports refused pricing based on order status

-- Drop existing triggers/functions if they exist
DROP TRIGGER IF EXISTS auto_calculate_shipping_cost_trigger ON public.orders;
DROP TRIGGER IF EXISTS auto_calculate_shipping_cost_update_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.auto_calculate_shipping_cost();

-- Create function to calculate shipping cost with Smart Pricing Engine logic
CREATE OR REPLACE FUNCTION public.auto_calculate_shipping_cost()
RETURNS TRIGGER AS $$
DECLARE
  provider_price numeric;
  business_fee numeric;
  is_refused boolean;
BEGIN
  -- Only calculate if ozon_city_id is provided and shipping_cost is null or ozon_city_id is changing
  IF NEW.ozon_city_id IS NOT NULL AND (OLD.ozon_city_id IS NULL OR NEW.ozon_city_id != OLD.ozon_city_id OR NEW.shipping_cost IS NULL) THEN
    
    -- Detect if order is refused
    is_refused := (
      LOWER(NEW.shipping_status) LIKE '%refused%' OR
      LOWER(NEW.shipping_status) LIKE '%refusé%' OR
      LOWER(NEW.shipping_status) LIKE '%refuse%' OR
      LOWER(NEW.shipping_status) LIKE '%customer refused%' OR
      LOWER(NEW.shipping_status) LIKE '%return refused%' OR
      LOWER(NEW.shipping_status) LIKE '%rejected%' OR
      LOWER(NEW.shipping_status) LIKE '%refusal%'
    );
    
    -- Priority 1: Try to get provider pricing from ozon_cities (Smart Pricing)
    IF is_refused THEN
      -- Use refused_price for refused orders
      SELECT refused_price INTO provider_price
      FROM public.ozon_cities
      WHERE id = NEW.ozon_city_id;
    ELSE
      -- Use delivered_price for non-refused orders
      SELECT delivered_price INTO provider_price
      FROM public.ozon_cities
      WHERE id = NEW.ozon_city_id;
    END IF;
    
    -- If provider pricing found, use it
    IF provider_price IS NOT NULL AND provider_price != 0 THEN
      NEW.shipping_cost := provider_price;
    ELSE
      -- Priority 2: Fallback to business delivery fee
      SELECT business_delivery_fee INTO business_fee
      FROM public.workspaces
      WHERE id = NEW.workspace_id;
      
      -- Use business fee, default to 35 if not set
      NEW.shipping_cost := COALESCE(business_fee, 35);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT
CREATE TRIGGER auto_calculate_shipping_cost_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_calculate_shipping_cost();

-- Create trigger for UPDATE (only when ozon_city_id or shipping_status changes)
CREATE TRIGGER auto_calculate_shipping_cost_update_trigger
  BEFORE UPDATE OF ozon_city_id, shipping_status ON public.orders
  FOR EACH ROW
  WHEN (NEW.ozon_city_id IS DISTINCT FROM OLD.ozon_city_id OR NEW.shipping_status IS DISTINCT FROM OLD.shipping_status)
  EXECUTE FUNCTION public.auto_calculate_shipping_cost();

-- Backfill existing orders with shipping costs using Smart Pricing Engine
UPDATE public.orders o
SET shipping_cost = COALESCE(
  -- Priority 1: Use provider pricing (refused or delivered based on status)
  (SELECT CASE 
     WHEN LOWER(o.shipping_status) LIKE '%refused%' OR
          LOWER(o.shipping_status) LIKE '%refusé%' OR
          LOWER(o.shipping_status) LIKE '%refuse%' OR
          LOWER(o.shipping_status) LIKE '%customer refused%' OR
          LOWER(o.shipping_status) LIKE '%return refused%' OR
          LOWER(o.shipping_status) LIKE '%rejected%' OR
          LOWER(o.shipping_status) LIKE '%refusal%'
     THEN oc.refused_price
     ELSE oc.delivered_price
   END
   FROM public.ozon_cities oc
   WHERE oc.id = o.ozon_city_id),
  -- Priority 2: Fallback to business delivery fee
  (SELECT COALESCE(w.business_delivery_fee, 35)
   FROM public.workspaces w
   WHERE w.id = o.workspace_id)
)
WHERE o.ozon_city_id IS NOT NULL 
  AND o.shipping_cost IS NULL;

-- Add comment to document the migration
COMMENT ON FUNCTION public.auto_calculate_shipping_cost() IS 'Smart Shipping Engine: Automatically calculates shipping_cost using provider pricing (ozon_cities.delivered_price or refused_price based on status) with fallback to business delivery fee';
COMMENT ON TRIGGER auto_calculate_shipping_cost_trigger ON public.orders IS 'Trigger to auto-calculate shipping_cost on order insert using Smart Pricing Engine with refused pricing support';
COMMENT ON TRIGGER auto_calculate_shipping_cost_update_trigger ON public.orders IS 'Trigger to auto-calculate shipping_cost when ozon_city_id or shipping_status is updated using Smart Pricing Engine with refused pricing support';
