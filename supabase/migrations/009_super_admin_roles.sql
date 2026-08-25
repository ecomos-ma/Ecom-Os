-- ============================================================
-- EcomOS · Supervisor Admin Platform + Workspace Preview
-- Safe, additive migration for role-based admin access
-- ============================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_login_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.profiles p
set email = au.email
from auth.users au
where p.id = au.id
  and p.email is null
  and au.email is not null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('supervisor','manager','employee','user','owner','admin','viewer'));

create or replace function public.get_my_workspace_id()
returns uuid
language sql
stable
security definer
as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), '') = 'supervisor';
$$;

alter table public.workspaces enable row level security;

drop policy if exists "Users can read own workspace" on public.workspaces;
drop policy if exists "Users can update own workspace" on public.workspaces;
create policy "Users and supervisors can read workspaces"
  on public.workspaces for select using (
    public.is_supervisor() or id = public.get_my_workspace_id()
  );
create policy "Users and supervisors can update workspaces"
  on public.workspaces for update using (
    public.is_supervisor() or id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or id = public.get_my_workspace_id()
  );

drop policy if exists "Users can read profiles in their workspace" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users and supervisors can read profiles"
  on public.profiles for select using (
    public.is_supervisor() or id = auth.uid() or workspace_id = public.get_my_workspace_id()
  );
create policy "Users and supervisors can update profiles"
  on public.profiles for update using (
    public.is_supervisor() or id = auth.uid()
  )
  with check (
    public.is_supervisor() or id = auth.uid()
  );

-- Business data access: supervisors can preview any workspace; regular users stay scoped to their own workspace.
drop policy if exists "Workspace isolation for campaigns" on public.campaigns;
create policy "Workspace isolation for campaigns"
  on public.campaigns for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for customers" on public.customers;
create policy "Workspace isolation for customers"
  on public.customers for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for products" on public.products;
create policy "Workspace isolation for products"
  on public.products for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for orders" on public.orders;
create policy "Workspace isolation for orders"
  on public.orders for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for order_items" on public.order_items;
create policy "Workspace isolation for order_items"
  on public.order_items for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for shipments" on public.shipments;
create policy "Workspace isolation for shipments"
  on public.shipments for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for expenses" on public.expenses;
create policy "Workspace isolation for expenses"
  on public.expenses for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for ad_spend" on public.ad_spend;
create policy "Workspace isolation for ad_spend"
  on public.ad_spend for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for meta_campaigns" on public.meta_campaigns;
create policy "Workspace isolation for meta_campaigns"
  on public.meta_campaigns for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );

drop policy if exists "Workspace isolation for integrations" on public.integrations;
create policy "Workspace isolation for integrations"
  on public.integrations for all using (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  )
  with check (
    public.is_supervisor() or workspace_id = public.get_my_workspace_id()
  );
