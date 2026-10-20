-- Section-aware operational RLS
--
-- Existing tenant policies remain in place and continue to enforce an active
-- subscription. These restrictive policies add the missing role/section
-- boundary, so a generic workspace membership is no longer enough to read or
-- mutate product, expense, or financial transaction rows.

begin;

-- Reuse and harden the existing canonical section helper. Managers are handled
-- by the shared team-role helper; agents need an explicit matching section on
-- an active profile and membership.
create or replace function public.can_access_workspace_section(
  p_workspace_id uuid,
  p_section text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(public.can_manage_workspace_team(p_workspace_id), false)
    or exists (
      select 1
      from public.profile_workspaces membership
      join public.profiles profile
        on profile.id = membership.profile_id
      where membership.workspace_id = p_workspace_id
        and membership.profile_id = (select auth.uid())
        and membership.status = 'active'
        and coalesce(profile.is_active, true)
        and profile.deleted_at is null
        and exists (
          select 1
          from unnest(coalesce(profile.allowed_sections, array[]::text[])) granted(section_name)
          where lower(granted.section_name) = lower(coalesce(p_section, ''))
        )
    );
$$;

revoke all on function public.can_access_workspace_section(uuid, text) from public, anon;
grant execute on function public.can_access_workspace_section(uuid, text) to authenticated, service_role;

alter table public.products enable row level security;
alter table public.expenses enable row level security;
alter table public.transactions enable row level security;

-- Product and inventory agents may operate product rows only when the owner has
-- granted the matching module. Managers and active support sessions retain the
-- existing operational path.
drop policy if exists products_section_select_boundary on public.products;
create policy products_section_select_boundary
  on public.products as restrictive for select to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Products'))
    or (select public.can_access_workspace_section(workspace_id, 'Inventory'))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
  );

drop policy if exists products_section_insert_boundary on public.products;
create policy products_section_insert_boundary
  on public.products as restrictive for insert to authenticated
  with check (
    (select public.can_access_workspace_section(workspace_id, 'Products'))
    or (select public.can_access_workspace_section(workspace_id, 'Inventory'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists products_section_update_boundary on public.products;
create policy products_section_update_boundary
  on public.products as restrictive for update to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Products'))
    or (select public.can_access_workspace_section(workspace_id, 'Inventory'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  )
  with check (
    (select public.can_access_workspace_section(workspace_id, 'Products'))
    or (select public.can_access_workspace_section(workspace_id, 'Inventory'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists products_section_delete_boundary on public.products;
create policy products_section_delete_boundary
  on public.products as restrictive for delete to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Products'))
    or (select public.can_access_workspace_section(workspace_id, 'Inventory'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

-- Expense access follows the existing explicit Expenses section grant.
drop policy if exists expenses_section_select_boundary on public.expenses;
create policy expenses_section_select_boundary
  on public.expenses as restrictive for select to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Expenses'))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
  );

drop policy if exists expenses_section_insert_boundary on public.expenses;
create policy expenses_section_insert_boundary
  on public.expenses as restrictive for insert to authenticated
  with check (
    (select public.can_access_workspace_section(workspace_id, 'Expenses'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists expenses_section_update_boundary on public.expenses;
create policy expenses_section_update_boundary
  on public.expenses as restrictive for update to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Expenses'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  )
  with check (
    (select public.can_access_workspace_section(workspace_id, 'Expenses'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists expenses_section_delete_boundary on public.expenses;
create policy expenses_section_delete_boundary
  on public.expenses as restrictive for delete to authenticated
  using (
    (select public.can_access_workspace_section(workspace_id, 'Expenses'))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

-- The current permission catalog intentionally has no agent-level Finance
-- section. Raw financial transactions therefore remain manager/support-only.
drop policy if exists transactions_management_select_boundary on public.transactions;
create policy transactions_management_select_boundary
  on public.transactions as restrictive for select to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
  );

drop policy if exists transactions_management_insert_boundary on public.transactions;
create policy transactions_management_insert_boundary
  on public.transactions as restrictive for insert to authenticated
  with check (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists transactions_management_update_boundary on public.transactions;
create policy transactions_management_update_boundary
  on public.transactions as restrictive for update to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  )
  with check (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists transactions_management_delete_boundary on public.transactions;
create policy transactions_management_delete_boundary
  on public.transactions as restrictive for delete to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

revoke all on table public.products, public.expenses, public.transactions from anon;

commit;
