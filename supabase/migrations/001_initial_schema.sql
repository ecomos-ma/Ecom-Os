-- ============================================================
-- EcomOS · Full schema migration
-- Run this in your Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- PROFILES  (extends auth.users)
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer' check (role in ('owner','admin','viewer')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'owner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- CAMPAIGNS
-- ─────────────────────────────────────────────
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  platform    text,
  created_at  timestamptz not null default now()
);

alter table public.campaigns enable row level security;
create policy "Authenticated users can manage campaigns"
  on public.campaigns for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────────
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text unique,
  city        text,
  created_at  timestamptz not null default now()
);

alter table public.customers enable row level security;
create policy "Authenticated users can manage customers"
  on public.customers for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────
create table if not exists public.products (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  sku                   text unique,
  cost                  numeric(12,2) not null default 0,
  price                 numeric(12,2) not null default 0,
  stock                 integer not null default 0,
  low_stock_threshold   integer not null default 5,
  status                text not null default 'active' check (status in ('active','draft','archived')),
  created_at            timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "Authenticated users can manage products"
  on public.products for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique,
  customer_id     uuid references public.customers(id) on delete set null,
  city            text,
  total           numeric(12,2) not null default 0,
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','shipped','delivered','returned','cancelled','CONFIRME','pas de reponse','CANCELED','REPORTE','saisie','NEW','Programme','Injoignable','En Voyage','double','BLACKLISTED','produit indisponible','LIVRE','Boite vocal','rappeler plustad','Client pas sérieux')),
  campaign_id     uuid references public.campaigns(id) on delete set null,
  confirmed_at    timestamptz,
  delivered_at    timestamptz,
  cancelled_at    timestamptz,
  phone           text,
  variant_price   numeric(12,2),
  sku             text,
  customer_ip     text,
  product_variant text,
  created_at      timestamptz not null default now()
);

create index if not exists orders_status_idx       on public.orders(status);
create index if not exists orders_created_at_idx   on public.orders(created_at desc);
create index if not exists orders_customer_id_idx  on public.orders(customer_id);

alter table public.orders enable row level security;
create policy "Authenticated users can manage orders"
  on public.orders for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────────
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  quantity     integer not null default 1,
  unit_price   numeric(12,2) not null default 0
);

alter table public.order_items enable row level security;
create policy "Authenticated users can manage order_items"
  on public.order_items for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- SHIPMENTS
-- ─────────────────────────────────────────────
create table if not exists public.shipments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  carrier          text not null default 'Express',
  tracking_number  text,
  pickup_status    text not null default 'pending',
  delivery_status  text not null default 'pending',
  created_at       timestamptz not null default now()
);

alter table public.shipments enable row level security;
create policy "Authenticated users can manage shipments"
  on public.shipments for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────────
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  description  text,
  amount       numeric(12,2) not null default 0,
  date         date not null default current_date,
  created_at   timestamptz not null default now()
);

alter table public.expenses enable row level security;
create policy "Authenticated users can manage expenses"
  on public.expenses for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- AD SPEND
-- ─────────────────────────────────────────────
create table if not exists public.ad_spend (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.campaigns(id) on delete set null,
  date          date not null default current_date,
  amount        numeric(12,2) not null default 0
);

alter table public.ad_spend enable row level security;
create policy "Authenticated users can manage ad_spend"
  on public.ad_spend for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- INTEGRATIONS  (tokens stored server-side only)
-- ─────────────────────────────────────────────
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null,                 -- 'google'
  access_token   text,                          -- NEVER exposed via RLS to browser
  refresh_token  text,
  expires_at     timestamptz,
  meta           jsonb,
  connected_at   timestamptz not null default now(),
  unique (user_id, provider)
);

-- RLS: users cannot select/read the integrations table directly from the browser.
-- They read only the safe VIEW below.
alter table public.integrations enable row level security;
-- No SELECT policy intentionally — only Edge Functions (service role) touch this table.
create policy "Service role only"
  on public.integrations for all using (false);  -- blocks all browser access

-- ─────────────────────────────────────────────
-- INTEGRATION STATUS VIEW  (safe projection)
-- ─────────────────────────────────────────────
-- This view exposes only the connection status to the browser, never the tokens.
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

-- Grant SELECT on the view to authenticated users
grant select on public.integration_status to authenticated;

-- ─────────────────────────────────────────────
-- REALTIME   (enable for live-updating tables)
-- ─────────────────────────────────────────────
-- Run these in the Supabase dashboard under Database → Replication,
-- or uncomment if your Supabase project allows it via SQL:
--
-- alter publication supabase_realtime add table public.orders;
-- alter publication supabase_realtime add table public.shipments;
