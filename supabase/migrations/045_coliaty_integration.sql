-- ============================================================
-- Coliaty Integration Migration
-- ============================================================

-- 1. Add carrier column to workspaces (default: ozon for backward compatibility)
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS carrier text 
  CHECK (carrier IN ('ozon', 'coliaty')) 
  DEFAULT 'ozon';

-- 2. Create coliaty_cities reference table
CREATE TABLE IF NOT EXISTS public.coliaty_cities (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for coliaty_cities
CREATE INDEX IF NOT EXISTS coliaty_cities_name_idx ON public.coliaty_cities (name);
CREATE INDEX IF NOT EXISTS coliaty_cities_name_trgm_idx ON public.coliaty_cities USING gin (name gin_trgm_ops);

-- RLS for coliaty_cities (reference table, read-only for all)
ALTER TABLE public.coliaty_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coliaty_cities_read_all" ON public.coliaty_cities;
CREATE POLICY "coliaty_cities_read_all" ON public.coliaty_cities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "coliaty_cities_insert_all" ON public.coliaty_cities;
CREATE POLICY "coliaty_cities_insert_all" ON public.coliaty_cities
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "coliaty_cities_no_update" ON public.coliaty_cities;
CREATE POLICY "coliaty_cities_no_update" ON public.coliaty_cities
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS "coliaty_cities_no_delete" ON public.coliaty_cities;
CREATE POLICY "coliaty_cities_no_delete" ON public.coliaty_cities
  FOR DELETE USING (false);

-- Updated_at trigger for coliaty_cities
CREATE OR REPLACE FUNCTION update_coliaty_cities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coliaty_cities_updated_at_trigger ON public.coliaty_cities;
CREATE TRIGGER coliaty_cities_updated_at_trigger
  BEFORE UPDATE ON public.coliaty_cities
  FOR EACH ROW
  EXECUTE FUNCTION update_coliaty_cities_updated_at();

-- 3. Extend city_arabic_names to support multiple carriers
ALTER TABLE public.city_arabic_names 
  ADD COLUMN IF NOT EXISTS carrier text 
  CHECK (carrier IN ('ozon', 'coliaty')) 
  DEFAULT 'ozon',
  ADD COLUMN IF NOT EXISTS carrier_city_id bigint;

-- Update existing records to have carrier='ozon' and carrier_city_id=ozon_city_id
-- Only update records where ozon_city_id is not NULL to avoid NULL carrier_city_id
UPDATE public.city_arabic_names 
SET carrier = 'ozon', carrier_city_id = ozon_city_id 
WHERE carrier IS NULL AND ozon_city_id IS NOT NULL;

-- Make carrier NOT NULL (carrier_city_id stays nullable for unresolved cities)
ALTER TABLE public.city_arabic_names 
  ALTER COLUMN carrier SET NOT NULL;

-- Add index for carrier-based lookups (NO FK - integrity validated at application level)
CREATE INDEX IF NOT EXISTS city_arabic_names_carrier_idx ON public.city_arabic_names (carrier);
CREATE INDEX IF NOT EXISTS city_arabic_names_carrier_city_id_idx ON public.city_arabic_names (carrier_city_id);

-- 4. Add coliaty_parcel_code to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS coliaty_parcel_code text;

CREATE INDEX IF NOT EXISTS orders_coliaty_parcel_code_idx ON public.orders (coliaty_parcel_code);

-- Comments for documentation
COMMENT ON COLUMN public.workspaces.carrier IS 'Shipping carrier choice: ozon or coliaty (default: ozon)';
COMMENT ON TABLE public.coliaty_cities IS 'Reference table for Coliaty cities';
COMMENT ON COLUMN public.coliaty_cities.id IS 'Coliaty city ID from API';
COMMENT ON COLUMN public.city_arabic_names.carrier IS 'Carrier this Arabic name belongs to (ozon or coliaty)';
COMMENT ON COLUMN public.city_arabic_names.carrier_city_id IS 'City ID in the carrier''s system (ozon_cities.id or coliaty_cities.id). Integrity validated at application level.';
COMMENT ON COLUMN public.orders.coliaty_parcel_code IS 'Coliaty parcel code (tracking identifier)';
