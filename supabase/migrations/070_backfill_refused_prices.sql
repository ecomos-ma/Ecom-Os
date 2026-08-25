-- Migration: Backfill refused prices for existing cities
-- Sets default refused prices based on delivered prices (typically 15-20% of delivery fee)

-- Update refused_price for cities where it's null or 0
-- Using a conservative estimate: refused_price = -20% of delivered_price
UPDATE public.ozon_cities
SET refused_price = -(delivered_price * 0.20)
WHERE refused_price IS NULL OR refused_price = 0;

-- Set a minimum refused price of -8 MAD for very low delivery fees
UPDATE public.ozon_cities
SET refused_price = -8
WHERE refused_price > -8 AND refused_price < 0;

-- Set a maximum refused price of -15 MAD for very high delivery fees
UPDATE public.ozon_cities
SET refused_price = -15
WHERE refused_price < -15;

-- Add comment to document the migration
COMMENT ON COLUMN public.ozon_cities.refused_price IS 'Refusal price in DH for refused parcels. Default: -20% of delivered_price, min -8 MAD, max -15 MAD. Can be overridden for specific cities.';
