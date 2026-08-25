
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS shipping_provider text,
ADD COLUMN IF NOT EXISTS tracking_number text,
ADD COLUMN IF NOT EXISTS shipment_id text,
ADD COLUMN IF NOT EXISTS shipment_status text,
ADD COLUMN IF NOT EXISTS shipping_status text,
ADD COLUMN IF NOT EXISTS delivery_status text,
ADD COLUMN IF NOT EXISTS shipping_status_raw text,
ADD COLUMN IF NOT EXISTS shipping_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS last_tracking_sync timestamptz,
ADD COLUMN IF NOT EXISTS last_shipping_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS shipping_company text,
ADD COLUMN IF NOT EXISTS shipping_cost numeric(12,2),
ADD COLUMN IF NOT EXISTS parcel_created_at timestamptz,
ADD COLUMN IF NOT EXISTS delivery_note_ref text,
ADD COLUMN IF NOT EXISTS ozon_raw_response jsonb,
ADD COLUMN IF NOT EXISTS coliaty_parcel_code text;
