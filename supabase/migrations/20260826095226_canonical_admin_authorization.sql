begin;

-- Canonical platform authorization is deliberately separate from seller-team
-- membership. A workspace owner/admin/agent never becomes a platform admin by
-- virtue of their workspace role.
alter table public.profile_workspaces
  add column if not exists role text,
  add column if not exists status text not null default 'active';

alter table public.profiles
  add column if not exists last_active timestamptz;

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

alter table public.workspaces
  add column if not exists is_active boolean not null default true,
  add column if not exists status text not null default 'active',
  add column if not exists plan text not null default 'free',
  add column if not exists deleted_at timestamptz,
  add column if not exists language text not null default 'en';

alter table public.workspaces
  drop constraint if exists workspaces_status_check;
alter table public.workspaces
  add constraint workspaces_status_check check (status in ('active', 'suspended', 'deleted'));
alter table public.workspaces
  drop constraint if exists workspaces_language_check;
alter table public.workspaces
  add constraint workspaces_language_check check (language in ('en', 'fr'));

create table if not exists public.platform_admin_roles (
  role_key text primary key,
  display_name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admin_roles_key_check
    check (role_key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists public.platform_admin_permissions (
  permission_key text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  constraint platform_admin_permissions_key_check
    check (permission_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

create table if not exists public.platform_admin_role_permissions (
  role_key text not null references public.platform_admin_roles(role_key) on delete cascade,
  permission_key text not null references public.platform_admin_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.platform_admin_assignments (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role_key text not null references public.platform_admin_roles(role_key) on delete restrict,
  status text not null default 'active',
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  reason text,
  updated_at timestamptz not null default now(),
  constraint platform_admin_assignments_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint platform_admin_assignments_expiry_check
    check (expires_at is null or expires_at > granted_at)
);

create index if not exists platform_admin_assignments_active_idx
  on public.platform_admin_assignments (role_key, expires_at, profile_id)
  where status = 'active';

insert into public.platform_admin_roles(role_key, display_name, description)
values
  ('root_founder', 'Root Founder', 'Protected recovery authority. Never assigned through the Admin UI.'),
  ('platform_admin', 'Platform Admin', 'Broad platform operations without root-founder identity.'),
  ('support_admin', 'Support Admin', 'Customer support and read-only seller assistance.'),
  ('billing_admin', 'Billing Admin', 'Subscriptions, payments, plans, limits and entitlements.'),
  ('security_admin', 'Security Admin', 'Account security, logs, health and platform authorization.')
on conflict (role_key) do update
set display_name = excluded.display_name,
    description = excluded.description,
    updated_at = now();

insert into public.platform_admin_permissions(permission_key, description)
values
  ('users.read', 'Read platform users and their memberships.'),
  ('users.manage', 'Manage non-root user application state.'),
  ('users.ban', 'Ban or unban non-root Auth users through the trusted service.'),
  ('users.delete', 'Delete non-root accounts through the trusted service.'),
  ('workspaces.read', 'Read workspaces across the platform.'),
  ('workspaces.manage', 'Manage workspace state and membership.'),
  ('support.read', 'Read support tickets and internal support context.'),
  ('support.reply', 'Reply to and manage support tickets.'),
  ('support.impersonate_read', 'Open an expiring read-only seller support session.'),
  ('support.impersonate_write', 'Explicitly elevate a support session for scoped writes.'),
  ('orders.read_all', 'Read orders across all sellers.'),
  ('products.read_all', 'Read products across all sellers.'),
  ('campaigns.read_all', 'Read campaigns across all sellers.'),
  ('billing.read', 'Read subscriptions, invoices, payments and SaaS billing metrics.'),
  ('billing.manage', 'Manage non-approval billing state.'),
  ('billing.approve', 'Approve or reject payment requests.'),
  ('plans.manage', 'Manage the official plan catalog.'),
  ('limits.manage', 'Manage plan and account limit overrides.'),
  ('entitlements.manage', 'Manage feature entitlement overrides.'),
  ('announcements.manage', 'Create and manage platform announcements.'),
  ('ai.read', 'Read AI provider configuration and health.'),
  ('ai.manage', 'Manage AI routing and provider configuration.'),
  ('health.read', 'Read measured platform health.'),
  ('logs.read', 'Read platform logs and grouped errors.'),
  ('security.read', 'Read security state and audit history.'),
  ('security.manage', 'Manage platform admin assignments and security controls.'),
  ('settings.read', 'Read non-secret platform settings.'),
  ('settings.manage', 'Manage non-secret platform settings.')
on conflict (permission_key) do update
set description = excluded.description;

-- The root role is a catalog entry only. The exact root identity bypasses this
-- matrix inside is_root_founder(), which prevents accidental lockout.
insert into public.platform_admin_role_permissions(role_key, permission_key)
select 'root_founder', permission_key
from public.platform_admin_permissions
on conflict do nothing;

insert into public.platform_admin_role_permissions(role_key, permission_key)
select 'platform_admin', permission_key
from public.platform_admin_permissions
on conflict do nothing;

insert into public.platform_admin_role_permissions(role_key, permission_key)
values
  ('support_admin', 'users.read'),
  ('support_admin', 'workspaces.read'),
  ('support_admin', 'support.read'),
  ('support_admin', 'support.reply'),
  ('support_admin', 'support.impersonate_read'),
  ('support_admin', 'orders.read_all'),
  ('support_admin', 'products.read_all'),
  ('support_admin', 'campaigns.read_all'),
  ('billing_admin', 'users.read'),
  ('billing_admin', 'workspaces.read'),
  ('billing_admin', 'billing.read'),
  ('billing_admin', 'billing.manage'),
  ('billing_admin', 'billing.approve'),
  ('billing_admin', 'plans.manage'),
  ('billing_admin', 'limits.manage'),
  ('billing_admin', 'entitlements.manage'),
  ('security_admin', 'users.read'),
  ('security_admin', 'users.manage'),
  ('security_admin', 'users.ban'),
  ('security_admin', 'users.delete'),
  ('security_admin', 'workspaces.read'),
  ('security_admin', 'health.read'),
  ('security_admin', 'logs.read'),
  ('security_admin', 'security.read'),
  ('security_admin', 'security.manage'),
  ('security_admin', 'settings.read')
on conflict do nothing;

-- Bind the protected recovery identity to the canonical role catalog even if
-- its historical seller profile role was never renamed to "founder".
insert into public.platform_admin_assignments(
  profile_id, role_key, status, granted_by, granted_at, reason, updated_at
)
select
  profile.id, 'root_founder', 'active', profile.id, now(),
  'Protected Ecom OS recovery identity', now()
from public.profiles profile
join auth.users auth_user on auth_user.id = profile.id
where lower(auth_user.email) = 'amineelaaouamecom@gmail.com'
  and coalesce(profile.is_active, true)
  and profile.deleted_at is null
on conflict (profile_id) do update
set role_key = 'root_founder',
    status = 'active',
    expires_at = null,
    revoked_by = null,
    revoked_at = null,
    reason = excluded.reason,
    updated_at = now();

alter table public.platform_admin_roles enable row level security;
alter table public.platform_admin_permissions enable row level security;
alter table public.platform_admin_role_permissions enable row level security;
alter table public.platform_admin_assignments enable row level security;

revoke all on table public.platform_admin_roles from anon, authenticated;
revoke all on table public.platform_admin_permissions from anon, authenticated;
revoke all on table public.platform_admin_role_permissions from anon, authenticated;
revoke all on table public.platform_admin_assignments from anon, authenticated;

grant select on table public.platform_admin_roles to service_role;
grant select on table public.platform_admin_permissions to service_role;
grant select on table public.platform_admin_role_permissions to service_role;
grant select, insert, update on table public.platform_admin_assignments to service_role;

create or replace function public.is_root_founder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'amineelaaouamecom@gmail.com'
    and exists (
      select 1
      from public.profiles p
      join public.platform_admin_assignments assignment on assignment.profile_id = p.id
      where p.id = (select auth.uid())
        and assignment.role_key = 'root_founder'
        and assignment.status = 'active'
        and coalesce(p.is_active, true)
        and p.deleted_at is null
    );
$$;

create or replace function public.has_platform_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_root_founder()
    or exists (
      select 1
      from public.platform_admin_assignments assignment
      join public.platform_admin_role_permissions role_permission
        on role_permission.role_key = assignment.role_key
      join public.profiles profile on profile.id = assignment.profile_id
      where assignment.profile_id = (select auth.uid())
        and assignment.status = 'active'
        and (assignment.expires_at is null or assignment.expires_at > now())
        and role_permission.permission_key = lower(trim(coalesce(p_permission_key, '')))
        and coalesce(profile.is_active, true)
        and profile.deleted_at is null
    );
$$;

-- Compatibility helpers stay server-controlled. is_founder remains the exact
-- root identity; is_platform_admin means any active platform assignment.
create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.is_root_founder(); $$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_root_founder()
    or exists (
      select 1
      from public.platform_admin_assignments assignment
      join public.profiles profile on profile.id = assignment.profile_id
      where assignment.profile_id = (select auth.uid())
        and assignment.status = 'active'
        and (assignment.expires_at is null or assignment.expires_at > now())
        and coalesce(profile.is_active, true)
        and profile.deleted_at is null
    );
$$;

revoke all on function public.is_root_founder() from public, anon;
revoke all on function public.has_platform_permission(text) from public, anon;
revoke all on function public.is_founder() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_root_founder() to authenticated, service_role;
grant execute on function public.has_platform_permission(text) to authenticated, service_role;
grant execute on function public.is_founder() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

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
      from public.profile_workspaces membership
      join public.profiles profile on profile.id = membership.profile_id
      join public.workspaces workspace on workspace.id = membership.workspace_id
      where membership.profile_id = (select auth.uid())
        and membership.workspace_id = p_workspace_id
        and membership.status = 'active'
        and coalesce(profile.is_active, true)
        and profile.deleted_at is null
        and coalesce(workspace.is_active, true)
        and workspace.deleted_at is null
        and coalesce(lower(workspace.status), 'active') not in ('suspended', 'deleted', 'inactive')
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
      from public.profile_workspaces membership
      join public.profiles profile on profile.id = membership.profile_id
      where membership.profile_id = (select auth.uid())
        and membership.workspace_id = p_workspace_id
        and membership.status = 'active'
        and lower(
          case
            when membership.is_owner then 'owner'
            else coalesce(membership.role, profile.role, 'viewer')
          end
        ) = any (
          select lower(role_name)
          from unnest(coalesce(p_allowed_roles, array[]::text[])) role_name
        )
    );
$$;

revoke all on function public.is_active_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.is_active_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

-- Existing policies that used the generic platform helper are made
-- permission-specific before restricted platform roles are enabled.
drop policy if exists profile_workspaces_select_active on public.profile_workspaces;
create policy profile_workspaces_select_active
  on public.profile_workspaces
  for select
  to authenticated
  using (
    (select public.has_platform_permission('workspaces.read'))
    or (select public.is_active_workspace_member(workspace_id))
  );

drop policy if exists workspaces_update_authorized on public.workspaces;
create policy workspaces_update_authorized
  on public.workspaces
  for update
  to authenticated
  using (
    (select public.has_platform_permission('workspaces.manage'))
    or (select public.has_workspace_role(id, array['owner','supervisor','admin','manager']))
  )
  with check (
    (select public.has_platform_permission('workspaces.manage'))
    or (select public.has_workspace_role(id, array['owner','supervisor','admin','manager']))
  );

create or replace function public.update_workspace_language(
  p_workspace_id uuid,
  p_language text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_language text := lower(trim(coalesce(p_language, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if normalized_language not in ('en', 'fr') then
    raise exception 'UNSUPPORTED_WORKSPACE_LANGUAGE' using errcode = '22023';
  end if;

  if not (
    (select public.has_platform_permission('workspaces.manage'))
    or (select public.has_workspace_role(p_workspace_id, array['owner','supervisor','admin','manager']))
  ) then
    raise exception 'WORKSPACE_LANGUAGE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.workspaces
  set language = normalized_language
  where id = p_workspace_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return normalized_language;
end;
$$;

revoke all on function public.update_workspace_language(uuid, text) from public, anon;
grant execute on function public.update_workspace_language(uuid, text) to authenticated, service_role;

-- Audit helpers are internal building blocks. Browser roles call an authorized
-- command RPC; they cannot call these helpers directly to forge history.
create or replace function public.record_platform_audit(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_target_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email_value text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  actor_role_value text;
  request_headers jsonb := '{}'::jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_action, ''))) < 3 then
    raise exception 'AUDIT_ACTION_REQUIRED' using errcode = '22023';
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  select coalesce(assignment.role_key, profile.role)
  into actor_role_value
  from public.profiles profile
  left join public.platform_admin_assignments assignment
    on assignment.profile_id = profile.id and assignment.status = 'active'
  where profile.id = (select auth.uid());

  insert into public.platform_audit_logs(
    actor_id,
    actor_email,
    actor_role,
    action,
    target_type,
    target_id,
    target_name,
    ip_address,
    user_agent,
    metadata
  ) values (
    (select auth.uid()),
    actor_email_value,
    actor_role_value,
    trim(p_action),
    nullif(trim(coalesce(p_target_type, '')), ''),
    p_target_id,
    nullif(trim(coalesce(p_target_name, '')), ''),
    left(coalesce(request_headers ->> 'x-forwarded-for', request_headers ->> 'x-real-ip'), 250),
    left(request_headers ->> 'user-agent', 1000),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.founder_platform_audit_v3(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_target_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_root_founder() then
    raise exception 'FOUNDER_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  perform public.record_platform_audit(p_action, p_target_type, p_target_id, p_target_name, p_metadata);
end;
$$;

create or replace function public.founder_audit(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_root_founder() then
    raise exception 'FOUNDER_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  insert into public.founder_audit_events(
    actor_id, action, target_type, target_id, reason, metadata
  ) values (
    (select auth.uid()), trim(p_action), p_target_type, p_target_id,
    nullif(trim(coalesce(p_reason, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_platform_audit(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.founder_platform_audit_v3(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.founder_audit(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_platform_audit(text, text, uuid, text, jsonb) to service_role;
grant execute on function public.founder_platform_audit_v3(text, text, uuid, text, jsonb) to service_role;
grant execute on function public.founder_audit(text, text, uuid, text, jsonb) to service_role;

create or replace function public.platform_get_my_authorization_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile_id', profile.id,
    'email', coalesce((select auth.jwt()) ->> 'email', profile.email),
    'is_root_founder', public.is_root_founder(),
    'is_platform_admin', public.is_platform_admin(),
    'role', case
      when public.is_root_founder() then 'root_founder'
      else assignment.role_key
    end,
    'expires_at', assignment.expires_at,
    'permissions', coalesce((
      select jsonb_agg(permission.permission_key order by permission.permission_key)
      from public.platform_admin_permissions permission
      where public.is_root_founder()
         or exists (
           select 1
           from public.platform_admin_role_permissions role_permission
           where role_permission.role_key = assignment.role_key
             and role_permission.permission_key = permission.permission_key
         )
    ), '[]'::jsonb)
  )
  into result
  from public.profiles profile
  left join public.platform_admin_assignments assignment
    on assignment.profile_id = profile.id
   and assignment.status = 'active'
   and (assignment.expires_at is null or assignment.expires_at > now())
  where profile.id = (select auth.uid());

  if result is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.platform_list_admin_roles_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_platform_permission('security.read') then
    raise exception 'SECURITY_READ_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'role_key', role.role_key,
    'display_name', role.display_name,
    'description', role.description,
    'is_system', role.is_system,
    'permissions', coalesce((
      select jsonb_agg(role_permission.permission_key order by role_permission.permission_key)
      from public.platform_admin_role_permissions role_permission
      where role_permission.role_key = role.role_key
    ), '[]'::jsonb)
  ) order by role.role_key), '[]'::jsonb)
  into result
  from public.platform_admin_roles role;

  return result;
end;
$$;

create or replace function public.platform_list_admin_assignments_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_platform_permission('security.read') then
    raise exception 'SECURITY_READ_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', assignment.profile_id,
    'full_name', profile.full_name,
    'email', coalesce(auth_user.email, profile.email),
    'role_key', assignment.role_key,
    'status', assignment.status,
    'granted_at', assignment.granted_at,
    'expires_at', assignment.expires_at,
    'revoked_at', assignment.revoked_at,
    'reason', assignment.reason
  ) order by assignment.updated_at desc), '[]'::jsonb)
  into result
  from public.platform_admin_assignments assignment
  join public.profiles profile on profile.id = assignment.profile_id
  left join auth.users auth_user on auth_user.id = assignment.profile_id;

  return result;
end;
$$;

create or replace function public.platform_set_admin_assignment_v1(
  p_profile_id uuid,
  p_role_key text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  normalized_role text := lower(trim(coalesce(p_role_key, '')));
  result jsonb;
begin
  if not public.has_platform_permission('security.manage') then
    raise exception 'SECURITY_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'ASSIGNMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if normalized_role = 'root_founder' or not exists (
    select 1 from public.platform_admin_roles role where role.role_key = normalized_role
  ) then
    raise exception 'INVALID_PLATFORM_ROLE' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'INVALID_ASSIGNMENT_EXPIRY' using errcode = '22023';
  end if;

  select lower(coalesce(auth_user.email, profile.email, ''))
  into target_email
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_profile_id;

  if target_email is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_email = 'amineelaaouamecom@gmail.com' then
    raise exception 'ROOT_FOUNDER_ASSIGNMENT_IS_IMMUTABLE' using errcode = '42501';
  end if;

  insert into public.platform_admin_assignments(
    profile_id, role_key, status, granted_by, granted_at, expires_at,
    revoked_by, revoked_at, reason, updated_at
  ) values (
    p_profile_id, normalized_role, 'active', (select auth.uid()), now(),
    p_expires_at, null, null, trim(p_reason), now()
  )
  on conflict (profile_id) do update
  set role_key = excluded.role_key,
      status = 'active',
      granted_by = excluded.granted_by,
      granted_at = excluded.granted_at,
      expires_at = excluded.expires_at,
      revoked_by = null,
      revoked_at = null,
      reason = excluded.reason,
      updated_at = now();

  perform public.record_platform_audit(
    'platform_admin_assignment_set', 'profile', p_profile_id, target_email,
    jsonb_build_object('role_key', normalized_role, 'expires_at', p_expires_at, 'reason', trim(p_reason))
  );

  result := jsonb_build_object(
    'profile_id', p_profile_id,
    'role_key', normalized_role,
    'status', 'active',
    'expires_at', p_expires_at
  );
  return result;
end;
$$;

create or replace function public.platform_revoke_admin_assignment_v1(
  p_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  previous_role text;
begin
  if not public.has_platform_permission('security.manage') then
    raise exception 'SECURITY_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'REVOCATION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select lower(coalesce(auth_user.email, profile.email, '')), assignment.role_key
  into target_email, previous_role
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  join public.platform_admin_assignments assignment on assignment.profile_id = profile.id
  where profile.id = p_profile_id
  for update of assignment;

  if target_email is null then
    raise exception 'PLATFORM_ADMIN_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_email = 'amineelaaouamecom@gmail.com' then
    raise exception 'ROOT_FOUNDER_CANNOT_BE_REVOKED' using errcode = '42501';
  end if;

  if p_profile_id = (select auth.uid()) then
    raise exception 'SELF_REVOCATION_NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.platform_admin_assignments
  set status = 'revoked',
      revoked_by = (select auth.uid()),
      revoked_at = now(),
      reason = trim(p_reason),
      updated_at = now()
  where profile_id = p_profile_id;

  perform public.record_platform_audit(
    'platform_admin_assignment_revoked', 'profile', p_profile_id, target_email,
    jsonb_build_object('previous_role', previous_role, 'reason', trim(p_reason))
  );
end;
$$;

-- Support session metadata is additive so historical founder sessions remain
-- available for audit. Existing sessions default to read-only.
alter table public.founder_support_sessions
  add column if not exists target_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists mode text not null default 'read_only',
  add column if not exists write_reason text,
  add column if not exists write_enabled_at timestamptz,
  add column if not exists write_expires_at timestamptz,
  add column if not exists ended_reason text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists client_ip text,
  add column if not exists client_user_agent text;

alter table public.founder_support_sessions
  drop constraint if exists founder_support_sessions_mode_check;
alter table public.founder_support_sessions
  add constraint founder_support_sessions_mode_check
  check (mode in ('read_only', 'read_write'));

create index if not exists founder_support_sessions_active_admin_idx
  on public.founder_support_sessions (founder_id, expires_at desc)
  where ended_at is null;

create or replace function public.platform_resolve_support_session(
  p_session_id uuid,
  p_workspace_id uuid default null,
  p_require_write boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session public.founder_support_sessions;
begin
  if not public.has_platform_permission('support.impersonate_read') then
    raise exception 'SUPPORT_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select * into support_session
  from public.founder_support_sessions session
  where session.id = p_session_id
    and session.founder_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'SUPPORT_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if support_session.ended_at is not null or support_session.expires_at <= now() then
    raise exception 'SUPPORT_SESSION_EXPIRED' using errcode = '42501';
  end if;

  if p_workspace_id is not null and support_session.workspace_id <> p_workspace_id then
    raise exception 'SUPPORT_SESSION_WORKSPACE_MISMATCH' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profile_workspaces membership
    join public.profiles profile on profile.id = membership.profile_id
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.profile_id = support_session.target_profile_id
      and membership.workspace_id = support_session.workspace_id
      and coalesce(to_jsonb(membership) ->> 'status', 'active') = 'active'
      and coalesce(profile.is_active, true)
      and profile.deleted_at is null
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
  ) then
    raise exception 'SUPPORT_TARGET_IS_NOT_ACTIVE' using errcode = '42501';
  end if;

  if p_require_write then
    if not public.has_platform_permission('support.impersonate_write') then
      raise exception 'SUPPORT_WRITE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
    if support_session.mode <> 'read_write'
       or support_session.write_expires_at is null
       or support_session.write_expires_at <= now() then
      raise exception 'SUPPORT_WRITE_ELEVATION_REQUIRED' using errcode = '42501';
    end if;
  end if;

  update public.founder_support_sessions
  set last_seen_at = now()
  where id = support_session.id;

  return jsonb_build_object(
    'id', support_session.id,
    'admin_id', support_session.founder_id,
    'target_profile_id', support_session.target_profile_id,
    'workspace_id', support_session.workspace_id,
    'reason', support_session.reason,
    'mode', support_session.mode,
    'started_at', support_session.started_at,
    'expires_at', support_session.expires_at,
    'write_expires_at', support_session.write_expires_at
  );
end;
$$;

create or replace function public.platform_start_support_session_v1(
  p_workspace_id uuid,
  p_target_profile_id uuid,
  p_reason text,
  p_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_session public.founder_support_sessions;
  request_headers jsonb := '{}'::jsonb;
  duration_minutes integer := coalesce(p_duration_minutes, 30);
begin
  if not public.has_platform_permission('support.impersonate_read') then
    raise exception 'SUPPORT_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'SUPPORT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if duration_minutes < 15 or duration_minutes > 30 then
    raise exception 'SUPPORT_DURATION_MUST_BE_15_TO_30_MINUTES' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profile_workspaces membership
    join public.profiles profile on profile.id = membership.profile_id
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.profile_id = p_target_profile_id
      and membership.workspace_id = p_workspace_id
      and coalesce(to_jsonb(membership) ->> 'status', 'active') = 'active'
      and coalesce(profile.is_active, true)
      and profile.deleted_at is null
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
  ) then
    raise exception 'PROFILE_IS_NOT_AN_ACTIVE_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  update public.founder_support_sessions
  set ended_at = now(), ended_reason = 'superseded'
  where founder_id = (select auth.uid())
    and ended_at is null
    and expires_at > now();

  insert into public.founder_support_sessions(
    founder_id,
    workspace_id,
    target_profile_id,
    reason,
    mode,
    started_at,
    expires_at,
    client_ip,
    client_user_agent
  ) values (
    (select auth.uid()),
    p_workspace_id,
    p_target_profile_id,
    trim(p_reason),
    'read_only',
    now(),
    now() + make_interval(mins => duration_minutes),
    left(coalesce(request_headers ->> 'x-forwarded-for', request_headers ->> 'x-real-ip'), 250),
    left(request_headers ->> 'user-agent', 1000)
  )
  returning * into created_session;

  perform public.record_platform_audit(
    'support_session_started', 'workspace', p_workspace_id, null,
    jsonb_build_object(
      'session_id', created_session.id,
      'target_profile_id', p_target_profile_id,
      'mode', 'read_only',
      'expires_at', created_session.expires_at,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'id', created_session.id,
    'admin_id', created_session.founder_id,
    'target_profile_id', created_session.target_profile_id,
    'workspace_id', created_session.workspace_id,
    'mode', created_session.mode,
    'started_at', created_session.started_at,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.platform_elevate_support_session_v1(
  p_session_id uuid,
  p_reason text,
  p_duration_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session public.founder_support_sessions;
  duration_minutes integer := coalesce(p_duration_minutes, 10);
  write_until timestamptz;
begin
  if not public.has_platform_permission('support.impersonate_write') then
    raise exception 'SUPPORT_WRITE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'SUPPORT_WRITE_REASON_REQUIRED' using errcode = '22023';
  end if;

  if duration_minutes < 5 or duration_minutes > 15 then
    raise exception 'SUPPORT_WRITE_DURATION_MUST_BE_5_TO_15_MINUTES' using errcode = '22023';
  end if;

  perform public.platform_resolve_support_session(p_session_id, null, false);

  select * into support_session
  from public.founder_support_sessions session
  where session.id = p_session_id
    and session.founder_id = (select auth.uid())
  for update;

  write_until := least(
    support_session.expires_at,
    now() + make_interval(mins => duration_minutes)
  );

  update public.founder_support_sessions
  set mode = 'read_write',
      write_reason = trim(p_reason),
      write_enabled_at = now(),
      write_expires_at = write_until,
      last_seen_at = now()
  where id = p_session_id;

  perform public.record_platform_audit(
    'support_session_write_elevated', 'workspace', support_session.workspace_id, null,
    jsonb_build_object(
      'session_id', p_session_id,
      'target_profile_id', support_session.target_profile_id,
      'write_expires_at', write_until,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'id', p_session_id,
    'mode', 'read_write',
    'write_expires_at', write_until,
    'expires_at', support_session.expires_at
  );
end;
$$;

create or replace function public.platform_end_support_session_v1(
  p_session_id uuid,
  p_reason text default 'admin_exit'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session public.founder_support_sessions;
begin
  if not public.has_platform_permission('support.impersonate_read') then
    raise exception 'SUPPORT_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  update public.founder_support_sessions session
  set ended_at = coalesce(session.ended_at, now()),
      ended_reason = coalesce(session.ended_reason, nullif(trim(coalesce(p_reason, '')), ''), 'admin_exit'),
      last_seen_at = now()
  where session.id = p_session_id
    and session.founder_id = (select auth.uid())
  returning * into support_session;

  if not found then
    raise exception 'SUPPORT_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.record_platform_audit(
    'support_session_ended', 'workspace', support_session.workspace_id, null,
    jsonb_build_object(
      'session_id', support_session.id,
      'target_profile_id', support_session.target_profile_id,
      'reason', support_session.ended_reason
    )
  );
end;
$$;

create or replace function public.platform_get_support_context_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved jsonb;
  result jsonb;
  target_profile_id uuid;
  target_workspace_id uuid;
begin
  resolved := public.platform_resolve_support_session(p_session_id, null, false);
  target_profile_id := (resolved ->> 'target_profile_id')::uuid;
  target_workspace_id := (resolved ->> 'workspace_id')::uuid;

  select jsonb_build_object(
    'session', resolved,
    'profile', jsonb_build_object(
      'id', profile.id,
      'workspace_id', target_workspace_id,
      'full_name', profile.full_name,
      'email', coalesce(auth_user.email, profile.email),
      'role', case
        when target_membership.is_owner then 'owner'
        else coalesce(target_membership.role, profile.role, 'viewer')
      end,
      'created_at', profile.created_at,
      'is_active', coalesce(profile.is_active, true),
      'allowed_sections', coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb),
      'avatar_url', profile.avatar_url
    ),
    'workspace', jsonb_build_object(
      'id', workspace.id,
      'name', workspace.name,
      'status', coalesce(workspace.status, 'active'),
      'plan', coalesce(workspace.plan, 'free'),
      'created_at', workspace.created_at,
      'language', coalesce(workspace.language, 'en')
    ),
    'summary', jsonb_build_object(
      'orders', (select count(*) from public.orders orders where orders.workspace_id = target_workspace_id),
      'products', (select count(*) from public.products products where products.workspace_id = target_workspace_id),
      'members', (select count(distinct membership.profile_id) from public.profile_workspaces membership where membership.workspace_id = target_workspace_id and coalesce(to_jsonb(membership) ->> 'status', 'active') = 'active')
    )
  )
  into result
  from public.profiles profile
  join public.workspaces workspace on workspace.id = target_workspace_id
  join public.profile_workspaces target_membership
    on target_membership.profile_id = profile.id
   and target_membership.workspace_id = target_workspace_id
   and target_membership.status = 'active'
  left join auth.users auth_user on auth_user.id = profile.id
  where profile.id = target_profile_id;

  if result is null then
    raise exception 'SUPPORT_CONTEXT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

-- Shared database status bucket used by cross-tenant Admin analytics. The
-- TypeScript seller engine uses the same seven canonical values.
create or replace function public.canonical_order_status_v1(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select
      upper(replace(replace(trim(coalesce(p_status, '')), ' ', '_'), '-', '_')) as code,
      lower(trim(coalesce(p_status, ''))) as raw
  )
  select case
    when code in ('DELIVERED', 'LIVRÉ', 'LIVRE', 'LIVRÉE', 'LIVREE', 'RETURN_DONE')
      or raw in ('livraison effectuée', 'livraison effectuee', 'remis', 'return completed', 'retour terminé', 'retour termine')
      then 'DELIVERED'
    when code in ('REFUSED', 'DELIVERY_FAILED', 'RETURNED_TO_AGENCY', 'RETURN_IN_PROGRESS', 'RETURNED_TO_SENDER', 'RETURNED', 'CANCELED', 'CANCELLED', 'REFUSÉ', 'REFUSE', 'RETOURNÉ', 'RETOURNE', 'ANNULÉ', 'ANNULE')
      or raw ~ '(retour|return|refus|cancel|annul|non livr|undeliver|échec de livraison|echec de livraison)'
      then 'COMING_BACK'
    when code in ('OUT_FOR_DELIVERY', 'IN_DISTRIBUTION', 'IN_TRANSIT', 'CUSTOMER_UNREACHABLE', 'NO_ANSWER', 'PHONE_OFF', 'WRONG_ADDRESS', 'RESCHEDULE_REQUESTED')
      or raw ~ '(distribution|en cours de livraison|out for delivery|in transit|with courier|last mile|customer unreachable|pas de réponse|pas de reponse|injoignable)'
      then 'OUT_FOR_DELIVERY'
    when code in ('NEW_PARCEL', 'WAITING_PICKUP', 'PICKED_UP', 'RECEIVED_AT_WAREHOUSE', 'READY')
      or raw ~ '(nouveau colis|ramass|pickup|reçu en agence|recu en agence|waiting|pending|collecte)'
      then 'READY'
    when code in ('CONFIRMED', 'CONFIRME', 'CONFIRMÉ', 'CONFIRMEE', 'CONFIRMÉE')
      then 'CONFIRMED'
    when code = 'PROCESSED' then 'PROCESSED'
    else 'NEW'
  end
  from normalized;
$$;

create or replace function public.platform_list_workspaces_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_plan text default null,
  p_workspace_status text default null,
  p_subscription_status text default null,
  p_owner_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  current_page integer := greatest(coalesce(p_page, 1), 1);
  page_size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  local_today date := (now() at time zone 'Africa/Casablanca')::date;
  today_start timestamptz := local_today::timestamp at time zone 'Africa/Casablanca';
  tomorrow_start timestamptz := (local_today + 1)::timestamp at time zone 'Africa/Casablanca';
  month_start timestamptz := date_trunc('month', local_today::timestamp) at time zone 'Africa/Casablanca';
begin
  if not public.has_platform_permission('workspaces.read') then
    raise exception 'WORKSPACES_READ_REQUIRED' using errcode = '42501';
  end if;

  with owners as (
    select distinct on (membership.workspace_id)
      membership.workspace_id,
      profile.id as owner_profile_id,
      profile.full_name as owner_name,
      coalesce(auth_user.email, profile.email) as owner_email
    from public.profile_workspaces membership
    join public.profiles profile on profile.id = membership.profile_id
    left join auth.users auth_user on auth_user.id = profile.id
    where membership.status = 'active'
    order by membership.workspace_id, membership.is_owner desc, profile.created_at asc
  ), members as (
    select membership.workspace_id, count(distinct membership.profile_id) as member_count
    from public.profile_workspaces membership
    where membership.status = 'active'
    group by membership.workspace_id
  ), products as (
    select product.workspace_id, count(*) as product_count
    from public.products product
    group by product.workspace_id
  ), integrations as (
    select integration.workspace_id, count(*) as integration_count
    from public.integrations integration
    group by integration.workspace_id
  ), normalized_orders as (
    select
      orders.workspace_id,
      orders.created_at,
      coalesce(orders.total, 0) as total,
      public.canonical_order_status_v1(coalesce(
        to_jsonb(orders) ->> 'shipping_status',
        to_jsonb(orders) ->> 'delivery_status',
        orders.status
      )) as canonical_status
    from public.orders orders
  ), order_stats as (
    select
      orders.workspace_id,
      count(*) filter (where orders.created_at >= today_start and orders.created_at < tomorrow_start) as orders_today,
      count(*) filter (where orders.created_at >= month_start) as orders_month,
      count(*) filter (
        where orders.created_at >= month_start
          and orders.canonical_status in ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMING_BACK')
      ) as confirmed_month,
      count(*) filter (
        where orders.created_at >= month_start and orders.canonical_status = 'DELIVERED'
      ) as delivered_month,
      coalesce(sum(orders.total) filter (
        where orders.created_at >= month_start and orders.canonical_status = 'DELIVERED'
      ), 0) as delivered_revenue_month,
      max(orders.created_at) as last_activity_at
    from normalized_orders orders
    group by orders.workspace_id
  ), latest_subscriptions as (
    select distinct on (subscription.workspace_id)
      subscription.workspace_id,
      subscription.status as subscription_status,
      plan.name as subscription_plan
    from public.workspace_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    order by subscription.workspace_id, subscription.created_at desc
  ), filtered as (
    select
      workspace.id,
      workspace.name,
      coalesce(workspace.status, 'active') as status,
      coalesce(latest_subscription.subscription_plan, workspace.plan, 'free') as plan,
      coalesce(latest_subscription.subscription_status, 'unassigned') as subscription_status,
      workspace.created_at,
      owner.owner_profile_id,
      owner.owner_name,
      owner.owner_email,
      coalesce(member.member_count, 0) as member_count,
      coalesce(order_stat.orders_today, 0) as orders_today,
      coalesce(order_stat.orders_month, 0) as orders_month,
      coalesce(product.product_count, 0) as product_count,
      coalesce(integration.integration_count, 0) as integration_count,
      case
        when coalesce(order_stat.orders_month, 0) = 0 then 0
        else round((coalesce(order_stat.confirmed_month, 0)::numeric / order_stat.orders_month) * 100, 2)
      end as confirmation_rate,
      case
        when coalesce(order_stat.confirmed_month, 0) = 0 then 0
        else round((coalesce(order_stat.delivered_month, 0)::numeric / order_stat.confirmed_month) * 100, 2)
      end as delivery_rate,
      coalesce(order_stat.delivered_revenue_month, 0) as delivered_revenue_month,
      order_stat.last_activity_at
    from public.workspaces workspace
    left join owners owner on owner.workspace_id = workspace.id
    left join members member on member.workspace_id = workspace.id
    left join products product on product.workspace_id = workspace.id
    left join integrations integration on integration.workspace_id = workspace.id
    left join order_stats order_stat on order_stat.workspace_id = workspace.id
    left join latest_subscriptions latest_subscription on latest_subscription.workspace_id = workspace.id
    where (
      p_query is null or trim(p_query) = ''
      or workspace.name ilike '%' || trim(p_query) || '%'
      or coalesce(owner.owner_name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(owner.owner_email, '') ilike '%' || trim(p_query) || '%'
    )
      and (p_plan is null or trim(p_plan) = '' or lower(coalesce(latest_subscription.subscription_plan, workspace.plan, 'free')) = lower(trim(p_plan)))
      and (p_workspace_status is null or trim(p_workspace_status) = '' or lower(coalesce(workspace.status, 'active')) = lower(trim(p_workspace_status)))
      and (p_subscription_status is null or trim(p_subscription_status) = '' or lower(coalesce(latest_subscription.subscription_status, 'unassigned')) = lower(trim(p_subscription_status)))
      and (p_owner_profile_id is null or owner.owner_profile_id = p_owner_profile_id)
  ), paged as (
    select *
    from filtered
    order by last_activity_at desc nulls last, created_at desc, id
    limit page_size_value
    offset (current_page - 1) * page_size_value
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.last_activity_at desc nulls last, item.created_at desc)
      from paged item
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', page_size_value,
    'timezone', 'Africa/Casablanca',
    'period_start', month_start,
    'period_end', tomorrow_start
  ) into result;

  return result;
end;
$$;

create or replace function public.platform_set_workspace_status_v1(
  p_workspace_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_name_value text;
  normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.has_platform_permission('workspaces.manage') then
    raise exception 'WORKSPACES_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if normalized_status not in ('active', 'suspended') then
    raise exception 'INVALID_WORKSPACE_STATUS' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'WORKSPACE_STATUS_REASON_REQUIRED' using errcode = '22023';
  end if;

  update public.workspaces workspace
  set status = normalized_status,
      is_active = normalized_status = 'active'
  where workspace.id = p_workspace_id
  returning workspace.name into workspace_name_value;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.record_platform_audit(
    'workspace_' || normalized_status,
    'workspace',
    p_workspace_id,
    workspace_name_value,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

create or replace function public.platform_command_center_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'Africa/Casablanca')::date;
  selected_start date := coalesce(p_start_date, (now() at time zone 'Africa/Casablanca')::date);
  selected_end date := coalesce(p_end_date, (now() at time zone 'Africa/Casablanca')::date);
  range_start timestamptz;
  range_end timestamptz;
  today_start timestamptz := local_today::timestamp at time zone 'Africa/Casablanca';
  tomorrow_start timestamptz := (local_today + 1)::timestamp at time zone 'Africa/Casablanca';
  seven_days_start timestamptz := (local_today - 6)::timestamp at time zone 'Africa/Casablanca';
  month_start timestamptz := date_trunc('month', local_today::timestamp) at time zone 'Africa/Casablanca';
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if selected_end < selected_start or selected_end - selected_start > 366 then
    raise exception 'INVALID_COMMAND_CENTER_DATE_RANGE' using errcode = '22023';
  end if;

  range_start := selected_start::timestamp at time zone 'Africa/Casablanca';
  range_end := (selected_end + 1)::timestamp at time zone 'Africa/Casablanca';

  with owner_profiles as (
    select distinct membership.profile_id
    from public.profile_workspaces membership
    where membership.status = 'active'
      and (membership.is_owner or lower(coalesce(membership.role, '')) = 'owner')
  ), normalized_orders as (
    select
      orders.workspace_id,
      orders.created_at,
      coalesce(orders.total, 0) as total,
      lower(coalesce(orders.status, '')) as raw_status,
      public.canonical_order_status_v1(coalesce(
        nullif(orders.shipping_status, ''),
        nullif(orders.delivery_status, ''),
        orders.status
      )) as canonical_status
    from public.orders orders
    where orders.created_at >= range_start and orders.created_at < range_end
  ), order_metrics as (
    select
      count(*) as total_orders,
      count(*) filter (where canonical_status in ('NEW', 'READY')) as pending_confirmation,
      count(*) filter (where canonical_status = 'CONFIRMED') as confirmed,
      count(*) filter (where canonical_status = 'OUT_FOR_DELIVERY') as shipped,
      count(*) filter (where canonical_status = 'DELIVERED') as delivered,
      count(*) filter (where raw_status ~ '(refus|refused)') as refused,
      count(*) filter (where raw_status ~ '(retour|return)') as returned,
      count(*) filter (where raw_status ~ '(cancel|annul)') as cancelled,
      count(*) filter (where canonical_status in ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMING_BACK')) as confirmed_chain,
      coalesce(sum(total), 0) as gross_order_value,
      coalesce(sum(total) filter (where canonical_status in ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMING_BACK')), 0) as confirmed_order_value,
      coalesce(sum(total) filter (where canonical_status = 'DELIVERED'), 0) as delivered_revenue
    from normalized_orders
  ), support_metrics as (
    select
      count(*) filter (where ticket.status in ('open', 'in_progress', 'waiting_on_customer')) as open_count,
      count(*) filter (where ticket.priority = 'urgent' and ticket.status not in ('resolved', 'closed')) as urgent_count,
      count(*) filter (where ticket.status = 'waiting_on_customer') as waiting_count,
      min(ticket.created_at) filter (where ticket.status not in ('resolved', 'closed')) as oldest_unresolved_at
    from public.support_tickets ticket
  ), subscription_metrics as (
    select
      count(*) filter (where lower(subscription.status) = 'active') as active_count,
      count(*) filter (where lower(subscription.status) in ('pending', 'pending_payment', 'pending_activation')) as pending_payment_count,
      count(*) filter (where lower(subscription.status) = 'under_review') as under_review_count,
      count(*) filter (where lower(subscription.status) = 'grace') as grace_count,
      count(*) filter (where subscription.renews_at is not null and subscription.renews_at >= now() and subscription.renews_at < now() + interval '7 days') as expiring_count,
      count(*) filter (where lower(subscription.status) = 'expired') as expired_count,
      count(*) filter (where lower(subscription.status) = 'suspended') as suspended_count
    from public.workspace_subscriptions subscription
  ), attention as (
    select * from (
      select
        'support_ticket'::text as kind,
        ticket.id,
        'Urgent support ticket'::text as title,
        ticket.subject as detail,
        '/admin/support?ticket=' || ticket.id::text as href,
        ticket.created_at,
        100 as priority
      from public.support_tickets ticket
      where public.has_platform_permission('support.read')
        and ticket.priority = 'urgent'
        and ticket.status not in ('resolved', 'closed')
      union all
      select
        'subscription'::text,
        subscription.id,
        'Subscription requires attention'::text,
        lower(subscription.status),
        '/admin/subscriptions?workspace=' || subscription.workspace_id::text,
        subscription.updated_at,
        80
      from public.workspace_subscriptions subscription
      where public.has_platform_permission('billing.read')
        and lower(subscription.status) in ('pending', 'pending_payment', 'pending_activation', 'under_review', 'grace', 'expired', 'suspended')
    ) item
    order by item.priority desc, item.created_at asc
    limit 12
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'start_date', selected_start,
      'end_date', selected_end,
      'start_at', range_start,
      'end_at', range_end,
      'timezone', 'Africa/Casablanca'
    ),
    'sellers', case when public.has_platform_permission('workspaces.read') then jsonb_build_object(
      'total', (select count(*) from owner_profiles),
      'active', (select count(*) from public.profiles profile join owner_profiles owner on owner.profile_id = profile.id where coalesce(profile.is_active, true) and profile.deleted_at is null),
      'suspended', (select count(*) from public.profiles profile join owner_profiles owner on owner.profile_id = profile.id left join public.founder_account_controls control on control.profile_id = profile.id where not coalesce(profile.is_active, true) or control.state = 'suspended'),
      'active_today', (select count(*) from public.profiles profile join owner_profiles owner on owner.profile_id = profile.id where profile.last_active >= today_start and profile.last_active < tomorrow_start),
      'new_today', (select count(*) from public.profiles profile join owner_profiles owner on owner.profile_id = profile.id where profile.created_at >= today_start and profile.created_at < tomorrow_start),
      'new_month', (select count(*) from public.profiles profile join owner_profiles owner on owner.profile_id = profile.id where profile.created_at >= month_start and profile.created_at < tomorrow_start)
    ) else null end,
    'users', case when public.has_platform_permission('users.read') then jsonb_build_object(
      'total', (select count(*) from public.profiles profile where profile.deleted_at is null),
      'active_today', (select count(*) from public.profiles profile where profile.deleted_at is null and profile.last_active >= today_start and profile.last_active < tomorrow_start),
      'active_7_days', (select count(*) from public.profiles profile where profile.deleted_at is null and profile.last_active >= seven_days_start and profile.last_active < tomorrow_start),
      'suspended', (select count(*) from public.profiles profile left join public.founder_account_controls control on control.profile_id = profile.id where profile.deleted_at is null and (not coalesce(profile.is_active, true) or control.state = 'suspended')),
      'banned', null,
      'registered_in_range', (select count(*) from public.profiles profile where profile.created_at >= range_start and profile.created_at < range_end)
    ) else null end,
    'workspaces', case when public.has_platform_permission('workspaces.read') then jsonb_build_object(
      'total', (select count(*) from public.workspaces workspace where workspace.deleted_at is null),
      'active', (select count(*) from public.workspaces workspace where workspace.deleted_at is null and workspace.status = 'active' and workspace.is_active),
      'suspended', (select count(*) from public.workspaces workspace where workspace.deleted_at is null and (workspace.status = 'suspended' or not workspace.is_active)),
      'onboarding', (select count(*) from public.workspaces workspace where workspace.deleted_at is null and not exists (select 1 from public.orders orders where orders.workspace_id = workspace.id)),
      'without_active_subscription', (select count(*) from public.workspaces workspace where workspace.deleted_at is null and not exists (select 1 from public.workspace_subscriptions subscription where subscription.workspace_id = workspace.id and lower(subscription.status) in ('active', 'trial')))
    ) else null end,
    'orders', case when public.has_platform_permission('orders.read_all') then (
      select jsonb_build_object(
        'total', metrics.total_orders,
        'pending_confirmation', metrics.pending_confirmation,
        'confirmed', metrics.confirmed,
        'shipped', metrics.shipped,
        'delivered', metrics.delivered,
        'refused', metrics.refused,
        'returned', metrics.returned,
        'cancelled', metrics.cancelled
      ) from order_metrics metrics
    ) else null end,
    'business_volume', case when public.has_platform_permission('orders.read_all') then (
      select jsonb_build_object(
        'gross_order_value', metrics.gross_order_value,
        'confirmed_order_value', metrics.confirmed_order_value,
        'delivered_revenue', metrics.delivered_revenue
      ) from order_metrics metrics
    ) else null end,
    'rates', case when public.has_platform_permission('orders.read_all') then (
      select jsonb_build_object(
        'confirmation_rate', case when metrics.total_orders = 0 then 0 else round(metrics.confirmed_chain::numeric / metrics.total_orders * 100, 2) end,
        'delivery_rate', case when metrics.confirmed_chain = 0 then 0 else round(metrics.delivered::numeric / metrics.confirmed_chain * 100, 2) end,
        'cancellation_rate', case when metrics.total_orders = 0 then 0 else round(metrics.cancelled::numeric / metrics.total_orders * 100, 2) end,
        'refusal_rate', case when metrics.total_orders = 0 then 0 else round(metrics.refused::numeric / metrics.total_orders * 100, 2) end,
        'return_rate', case when metrics.total_orders = 0 then 0 else round(metrics.returned::numeric / metrics.total_orders * 100, 2) end
      ) from order_metrics metrics
    ) else null end,
    'subscriptions', case when public.has_platform_permission('billing.read') then (
      select to_jsonb(metrics) from subscription_metrics metrics
    ) else null end,
    'support', case when public.has_platform_permission('support.read') then (
      select to_jsonb(metrics) from support_metrics metrics
    ) else null end,
    'system', case when public.has_platform_permission('health.read') then jsonb_build_object(
      'application', 'unknown',
      'database', 'reachable',
      'auth', 'unknown',
      'realtime', 'unknown',
      'storage', 'unknown',
      'edge_functions', 'unknown',
      'workers', 'unknown',
      'note', 'Only database reachability is measured by this RPC. Unmeasured services remain unknown.'
    ) else null end,
    'attention', coalesce((select jsonb_agg(to_jsonb(item) order by item.priority desc, item.created_at asc) from attention item), '[]'::jsonb),
    'capabilities', jsonb_build_object(
      'official_subscriptions', false,
      'payments', false,
      'measured_service_health', false,
      'advertising_attribution', false
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.platform_resolve_support_session(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.platform_get_my_authorization_v1() from public, anon;
revoke all on function public.platform_list_admin_roles_v1() from public, anon;
revoke all on function public.platform_list_admin_assignments_v1() from public, anon;
revoke all on function public.platform_set_admin_assignment_v1(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.platform_revoke_admin_assignment_v1(uuid, text) from public, anon;
revoke all on function public.platform_start_support_session_v1(uuid, uuid, text, integer) from public, anon;
revoke all on function public.platform_elevate_support_session_v1(uuid, text, integer) from public, anon;
revoke all on function public.platform_end_support_session_v1(uuid, text) from public, anon;
revoke all on function public.platform_get_support_context_v1(uuid) from public, anon;
revoke all on function public.canonical_order_status_v1(text) from public, anon;
revoke all on function public.platform_list_workspaces_v1(integer, integer, text, text, text, text, uuid) from public, anon;
revoke all on function public.platform_set_workspace_status_v1(uuid, text, text) from public, anon;
revoke all on function public.platform_command_center_v1(date, date) from public, anon;

grant execute on function public.platform_get_my_authorization_v1() to authenticated, service_role;
grant execute on function public.platform_list_admin_roles_v1() to authenticated, service_role;
grant execute on function public.platform_list_admin_assignments_v1() to authenticated, service_role;
grant execute on function public.platform_set_admin_assignment_v1(uuid, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.platform_revoke_admin_assignment_v1(uuid, text) to authenticated, service_role;
grant execute on function public.platform_start_support_session_v1(uuid, uuid, text, integer) to authenticated, service_role;
grant execute on function public.platform_elevate_support_session_v1(uuid, text, integer) to authenticated, service_role;
grant execute on function public.platform_end_support_session_v1(uuid, text) to authenticated, service_role;
grant execute on function public.platform_get_support_context_v1(uuid) to authenticated, service_role;
grant execute on function public.platform_resolve_support_session(uuid, uuid, boolean) to service_role;
grant execute on function public.canonical_order_status_v1(text) to authenticated, service_role;
grant execute on function public.platform_list_workspaces_v1(integer, integer, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.platform_set_workspace_status_v1(uuid, text, text) to authenticated, service_role;
grant execute on function public.platform_command_center_v1(date, date) to authenticated, service_role;

commit;
