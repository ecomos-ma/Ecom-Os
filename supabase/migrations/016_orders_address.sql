alter table public.orders
  add column if not exists address text null;
