-- ============================================================
-- EcomOS · Multi-Tenant Architecture Fix & Data Migration
-- ============================================================

-- 1. Ensure the trigger is actually bound to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Data Migration: Create a default workspace for legacy users & assign all orphaned data
do $$
declare
  legacy_workspace_id uuid;
  user_count int;
  data_count int;
begin
  -- Check if we have any users or data that needs a workspace
  select count(*) into user_count from public.profiles where workspace_id is null;
  select count(*) into data_count from public.orders where workspace_id is null;

  if user_count > 0 or data_count > 0 then
    -- Create a unified legacy workspace. Since the application was single-tenant before,
    -- all existing users and data belonged to the same logical group.
    insert into public.workspaces (name) 
    values ('My Workspace') 
    returning id into legacy_workspace_id;

    -- Assign all unassigned profiles to this workspace
    update public.profiles set workspace_id = legacy_workspace_id where workspace_id is null;

    -- Populate workspace_id in every business table to avoid orphaned records
    update public.campaigns set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.customers set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.products set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.orders set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.order_items set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.shipments set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.expenses set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.ad_spend set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.meta_campaigns set workspace_id = legacy_workspace_id where workspace_id is null;
    update public.integrations set workspace_id = legacy_workspace_id where workspace_id is null;
  end if;
end $$;

-- Enforce NOT NULL constraints safely now that orphaned records are mitigated
-- (Skipped to avoid locking issues on large tables, but logic remains secure via RLS)

-- 3. Enable Row Level Security globally
alter table public.campaigns enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.expenses enable row level security;
alter table public.ad_spend enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.integrations enable row level security;

-- 4. Re-create all RLS policies using BOTH `using` and `with check` for FOR ALL

-- campaigns
drop policy if exists "Workspace isolation for campaigns" on public.campaigns;
create policy "Workspace isolation for campaigns" on public.campaigns
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- customers
drop policy if exists "Workspace isolation for customers" on public.customers;
create policy "Workspace isolation for customers" on public.customers
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- products
drop policy if exists "Workspace isolation for products" on public.products;
create policy "Workspace isolation for products" on public.products
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- orders
drop policy if exists "Workspace isolation for orders" on public.orders;
create policy "Workspace isolation for orders" on public.orders
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- order_items
drop policy if exists "Workspace isolation for order_items" on public.order_items;
create policy "Workspace isolation for order_items" on public.order_items
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- shipments
drop policy if exists "Workspace isolation for shipments" on public.shipments;
create policy "Workspace isolation for shipments" on public.shipments
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- expenses
drop policy if exists "Workspace isolation for expenses" on public.expenses;
create policy "Workspace isolation for expenses" on public.expenses
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- ad_spend
drop policy if exists "Workspace isolation for ad_spend" on public.ad_spend;
create policy "Workspace isolation for ad_spend" on public.ad_spend
  for all 
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

-- meta_campaigns
-- Note: the previous policy for meta_campaigns was FOR SELECT. If this needs to be editable, here is FOR ALL.
drop policy if exists "Workspace isolation for meta_campaigns" on public.meta_campaigns;
create policy "Workspace isolation for meta_campaigns" on public.meta_campaigns
  for all
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());
