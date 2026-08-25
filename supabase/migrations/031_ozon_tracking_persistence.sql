-- Add persistent Ozon shipment columns to orders so tracking survives refresh/login

-- Drop dependent views if they exist
drop view if exists public.integration_status cascade;

-- Add columns to orders table
alter table public.orders
  add column if not exists tracking_number text,
  add column if not exists shipment_id text,
  add column if not exists shipment_status text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_status text,
  add column if not exists shipping_status_raw jsonb,
  add column if not exists last_tracking_sync timestamptz,
  add column if not exists shipping_updated_at timestamptz,
  add column if not exists ozon_raw_response jsonb,
  add column if not exists parcel_created_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Recreate the integration_status view
create or replace view public.integration_status
  with (security_invoker = true)
as
  select
    user_id,
    provider,
    true          as connected,
    connected_at
  from public.integrations
  where user_id = auth.uid();

grant select on public.integration_status to authenticated;

-- Create indexes for tracking queries
create index if not exists idx_orders_tracking_number on public.orders (tracking_number);
create index if not exists idx_orders_shipment_id on public.orders (shipment_id);
create index if not exists idx_orders_shipping_provider on public.orders (shipping_provider);
create index if not exists idx_orders_last_tracking_sync on public.orders (last_tracking_sync);
create index if not exists idx_orders_shipping_status on public.orders (shipping_status);
