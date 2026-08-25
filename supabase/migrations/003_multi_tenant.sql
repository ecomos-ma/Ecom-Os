-- ============================================================
-- EcomOS · Multi-Tenant Architecture Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create Workspaces Table
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Enable RLS on workspaces
alter table public.workspaces enable row level security;

-- 2. Add workspace_id to profiles and link it
alter table public.profiles 
add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- RLS for workspaces: user can read their own workspace (idempotent)
 drop policy if exists "Users can read own workspace" on public.workspaces;
 create policy "Users can read own workspace"
   on public.workspaces for select using (
     id = (select workspace_id from public.profiles where public.profiles.id = auth.uid())
   );
 drop policy if exists "Users can update own workspace" on public.workspaces;
 create policy "Users can update own workspace"
   on public.workspaces for update using (
     id = (select workspace_id from public.profiles where public.profiles.id = auth.uid())
   );

-- Update profiles RLS to allow reading users in the same workspace (for the Team page)
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read profiles in their workspace"
  on public.profiles for select using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid()) 
    or id = auth.uid()
  );

-- 3. Modify handle_new_user trigger to provision a workspace
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_full_name text;
begin
  -- Use metadata passed during signup if it exists, otherwise fallback to defaults
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_workspace_name := coalesce(new.raw_user_meta_data->>'workspace_name', v_full_name || '''s Workspace');

  -- Create a new workspace for the user
  insert into public.workspaces (name) values (v_workspace_name) returning id into v_workspace_id;

  -- Create the profile and link to the new workspace
  insert into public.profiles (id, full_name, role, workspace_id)
  values (new.id, v_full_name, 'owner', v_workspace_id)
  on conflict (id) do nothing;
  
  return new;
end;
$$;

-- 4. Add workspace_id to ALL business tables

-- campaigns
alter table public.campaigns add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- customers
alter table public.customers add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- products
alter table public.products add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- orders
alter table public.orders add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- order_items
alter table public.order_items add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- shipments
alter table public.shipments add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- expenses
alter table public.expenses add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- ad_spend
alter table public.ad_spend add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- meta_campaigns
alter table public.meta_campaigns add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
-- integrations
alter table public.integrations add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Replace meta_campaigns uniqueness constraint to be scoped by workspace
alter table public.meta_campaigns drop constraint if exists meta_campaigns_meta_campaign_id_key;
-- Add unique constraint scoped by workspace (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_campaigns_meta_campaign_id_workspace_id_key'
  ) THEN
    ALTER TABLE public.meta_campaigns ADD CONSTRAINT meta_campaigns_meta_campaign_id_workspace_id_key UNIQUE (meta_campaign_id, workspace_id);
  END IF;
END$$;


-- 5. Helper function for RLS
create or replace function public.get_my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;

-- 6. Apply RLS Policies to enforce Multi-Tenancy

-- campaigns
drop policy if exists "Authenticated users can manage campaigns" on public.campaigns;
drop policy if exists "Workspace isolation for campaigns" on public.campaigns;
create policy "Workspace isolation for campaigns" on public.campaigns for all using (workspace_id = public.get_my_workspace_id());

-- customers
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Workspace isolation for customers" on public.customers;
create policy "Workspace isolation for customers" on public.customers for all using (workspace_id = public.get_my_workspace_id());

-- products
drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Workspace isolation for products" on public.products;
create policy "Workspace isolation for products" on public.products for all using (workspace_id = public.get_my_workspace_id());

-- orders
drop policy if exists "Authenticated users can manage orders" on public.orders;
drop policy if exists "Workspace isolation for orders" on public.orders;
create policy "Workspace isolation for orders" on public.orders for all using (workspace_id = public.get_my_workspace_id());

-- order_items
drop policy if exists "Authenticated users can manage order_items" on public.order_items;
drop policy if exists "Workspace isolation for order_items" on public.order_items;
create policy "Workspace isolation for order_items" on public.order_items for all using (workspace_id = public.get_my_workspace_id());

-- shipments
drop policy if exists "Authenticated users can manage shipments" on public.shipments;
drop policy if exists "Workspace isolation for shipments" on public.shipments;
create policy "Workspace isolation for shipments" on public.shipments for all using (workspace_id = public.get_my_workspace_id());

-- expenses
drop policy if exists "Authenticated users can manage expenses" on public.expenses;
drop policy if exists "Workspace isolation for expenses" on public.expenses;
create policy "Workspace isolation for expenses" on public.expenses for all using (workspace_id = public.get_my_workspace_id());

-- ad_spend
drop policy if exists "Authenticated users can manage ad_spend" on public.ad_spend;
drop policy if exists "Workspace isolation for ad_spend" on public.ad_spend;
create policy "Workspace isolation for ad_spend" on public.ad_spend for all using (workspace_id = public.get_my_workspace_id());

-- meta_campaigns
drop policy if exists "Authenticated users can read meta_campaigns" on public.meta_campaigns;
drop policy if exists "Workspace isolation for meta_campaigns" on public.meta_campaigns;
create policy "Workspace isolation for meta_campaigns" on public.meta_campaigns for select using (workspace_id = public.get_my_workspace_id());

-- Drop old integration_status view and recreate with workspace filtering
drop view if exists public.integration_status;
create or replace view public.integration_status
  with (security_invoker = true)
as
  select
    user_id,
    provider,
    true as connected,
    connected_at,
    workspace_id
  from public.integrations
  where workspace_id = public.get_my_workspace_id();

grant select on public.integration_status to authenticated;
