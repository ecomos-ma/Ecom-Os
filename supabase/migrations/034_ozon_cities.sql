-- Migration: Create ozon_cities table with pricing data
-- This replaces the hardcoded city matching system with a proper reference table

-- Enable pg_trgm extension for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.ozon_cities (
  id bigint PRIMARY KEY,
  ref text NOT NULL,
  name text NOT NULL,
  delivered_price numeric NOT NULL DEFAULT 0,
  returned_price numeric NOT NULL DEFAULT 0,
  refused_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS ozon_cities_name_idx ON public.ozon_cities (name);
CREATE INDEX IF NOT EXISTS ozon_cities_ref_idx ON public.ozon_cities (ref);
CREATE INDEX IF NOT EXISTS ozon_cities_name_trgm_idx ON public.ozon_cities USING gin (name gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.ozon_cities ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read ozon_cities (it's a reference table)
CREATE POLICY "ozon_cities_read_all" ON public.ozon_cities
  FOR SELECT USING (true);

-- Policy: Allow inserts for data import (managed via scripts)
CREATE POLICY "ozon_cities_insert_all" ON public.ozon_cities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ozon_cities_no_update" ON public.ozon_cities
  FOR UPDATE USING (false);

CREATE POLICY "ozon_cities_no_delete" ON public.ozon_cities
  FOR DELETE USING (false);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_ozon_cities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ozon_cities_updated_at_trigger
  BEFORE UPDATE ON public.ozon_cities
  FOR EACH ROW
  EXECUTE FUNCTION update_ozon_cities_updated_at();

-- Add columns to orders table for city resolution
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS ozon_city_id bigint,
  ADD COLUMN IF NOT EXISTS city_name text;

-- Add foreign key constraint to ozon_cities
ALTER TABLE public.orders 
  ADD CONSTRAINT fk_orders_ozon_city 
  FOREIGN KEY (ozon_city_id) 
  REFERENCES public.ozon_cities(id) 
  ON DELETE SET NULL;

-- Add index for faster city-based queries
CREATE INDEX IF NOT EXISTS orders_ozon_city_id_idx ON public.orders (ozon_city_id);
CREATE INDEX IF NOT EXISTS orders_city_name_idx ON public.orders (city_name);

-- Add comment to document the migration
COMMENT ON TABLE public.ozon_cities IS 'Reference table for Ozon Express cities with pricing data. Replaces hardcoded city matching system.';
COMMENT ON COLUMN public.ozon_cities.id IS 'Ozon Express city ID (used in API calls)';
COMMENT ON COLUMN public.ozon_cities.ref IS 'Ozon Express short reference code (e.g., AGA, TZ)';
COMMENT ON COLUMN public.ozon_cities.name IS 'Full city name as provided by Ozon Express';
COMMENT ON COLUMN public.ozon_cities.delivered_price IS 'Delivery price in DH for successful deliveries';
COMMENT ON COLUMN public.ozon_cities.returned_price IS 'Return price in DH for returned parcels';
COMMENT ON COLUMN public.ozon_cities.refused_price IS 'Refusal price in DH for refused parcels';
COMMENT ON COLUMN public.orders.ozon_city_id IS 'Foreign key to ozon_cities table for reliable city matching';
COMMENT ON COLUMN public.orders.city_name IS 'Human-readable city name (for display purposes)';
