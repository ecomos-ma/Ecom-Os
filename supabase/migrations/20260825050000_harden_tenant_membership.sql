begin;

-- profile_workspaces is the canonical tenant-membership table.  A status
-- column lets removals/suspensions fail closed without deleting audit history.
alter table public.profile_workspaces
  add column if not exists status text not null default 'active';

alter table public.profile_workspaces
  drop constraint if exists profile_workspaces_status_check;

alter table public.profile_workspaces
  add constraint profile_workspaces_status_check
  check (status in ('active', 'suspended', 'removed', 'expired'));

create unique index if not exists profile_workspaces_profile_workspace_uidx
  on public.profile_workspaces (profile_id, workspace_id);

create index if not exists profile_workspaces_active_lookup_idx
  on public.profile_workspaces (workspace_id, profile_id)
  where status = 'active';

create or replace function public.is_active_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      join public.workspaces w on w.id = pw.workspace_id
      where pw.profile_id = (select auth.uid())
        and pw.workspace_id = p_workspace_id
        and pw.status = 'active'
        and coalesce(p.is_active, true)
        and p.deleted_at is null
        and coalesce(lower(p.status), 'active') not in ('suspended', 'removed', 'deleted', 'inactive')
        and coalesce(w.is_active, true)
        and w.deleted_at is null
        and coalesce(lower(w.status), 'active') not in ('suspended', 'removed', 'deleted', 'inactive')
    );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      where pw.profile_id = (select auth.uid())
        and pw.workspace_id = p_workspace_id
        and pw.status = 'active'
        and lower(
          case
            when pw.is_owner then 'owner'
            else coalesce(pw.role, p.role, 'user')
          end
        ) = any (
          select lower(role_name)
          from unnest(coalesce(p_allowed_roles, array[]::text[])) as role_name
        )
    );
$$;

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
  select public.is_active_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      where pw.profile_id = (select auth.uid())
        and pw.workspace_id = p_workspace_id
        and pw.status = 'active'
        and (
          pw.is_owner
          or lower(coalesce(pw.role, p.role, 'user')) in ('owner', 'admin', 'manager')
          or exists (
            select 1
            from jsonb_array_elements_text(
              coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb)
            ) as section_name
            where lower(section_name) = lower(coalesce(p_section, ''))
          )
        )
    );
$$;

-- Platform-wide access remains tied to the existing server-controlled founder
-- identity instead of mutable profile metadata.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_founder(), false);
$$;

revoke all on function public.is_active_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
revoke all on function public.can_access_workspace_section(uuid, text) from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_active_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.can_access_workspace_section(uuid, text) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- Remove the historical self-service membership mutation policy. Membership
-- role/status changes must go through audited SECURITY DEFINER RPCs or trusted
-- backend code.
alter table public.profile_workspaces enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profile_workspaces'
  loop
    execute format('drop policy if exists %I on public.profile_workspaces', policy_name);
  end loop;
end
$$;

create policy profile_workspaces_select_active
  on public.profile_workspaces
  for select
  to authenticated
  using (
    (select public.is_platform_admin())
    or (select public.is_active_workspace_member(workspace_id))
  );

revoke insert, update, delete on public.profile_workspaces from authenticated;
grant select on public.profile_workspaces to authenticated;

-- An ad-hoc SQL execution RPC must never be callable from a browser role. Keep
-- it available to its owner/service role if it exists, but remove public API
-- execution privileges for every overload.
do $$
declare
  target record;
begin
  for target in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'exec_sql'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      target.schema_name,
      target.function_name,
      target.identity_arguments
    );
  end loop;
end
$$;

commit;
