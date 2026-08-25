-- ============================================================
-- EcomOS · Persistence Migration
-- Add missing business config fields to workspaces (replaces local storage)
-- ============================================================

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.workspaces
add column if not exists business_delivery_fee numeric(12,2) default 35,
add column if not exists business_confirmation_fee numeric(12,2) default 11,
add column if not exists business_fulfillment_fee numeric(12,2) default 2,
add column if not exists business_lead_fee numeric(12,2) default 0,
add column if not exists business_product_cost numeric(12,2) default 0,
add column if not exists google_sheet_url text,
add column if not exists google_sheet_autosync boolean default false;
