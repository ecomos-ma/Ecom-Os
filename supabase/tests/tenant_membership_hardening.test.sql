begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

select has_column('public', 'profile_workspaces', 'status', 'Memberships have an explicit status');
select col_is_unique('public', 'profile_workspaces', array['profile_id', 'workspace_id'], 'Membership is unique per user and workspace');
select has_function('public', 'is_active_workspace_member', array['uuid'], 'Active membership helper exists');
select has_function('public', 'has_workspace_role', array['uuid', 'text[]'], 'Workspace role helper exists');
select has_function('public', 'can_access_workspace_section', array['uuid', 'text'], 'Section permission helper exists');
select has_function('public', 'is_platform_admin', array[]::text[], 'Platform admin helper exists');
select policies_are('public', 'profile_workspaces', array['profile_workspaces_select_active'], 'Membership table exposes only its scoped read policy');

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'profile_workspaces'
     and grantee = 'authenticated'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'Authenticated users cannot mutate membership rows directly'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = 'profile_workspaces'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'No browser mutation policy remains on memberships'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'exec_sql'
     and (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     )),
  0,
  'Ad-hoc SQL execution is unavailable to browser roles'
);

select * from finish();
rollback;
