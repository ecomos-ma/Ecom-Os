begin;

-- Team tables existed in the historical 067 migration. Recreate them only
-- when absent so a clean environment and the drifted production environment
-- converge without dropping or rewriting existing team data.
create table if not exists public.team_member_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  phone text,
  department text,
  avatar_url text,
  agent_status text not null default 'offline'
    check (agent_status in ('online','offline','busy','break','lunch','vacation','idle')),
  shift text not null default 'morning'
    check (shift in ('morning','evening','night','custom','off')),
  daily_limit integer not null default 80,
  max_active_orders integer not null default 30,
  assignment_weight numeric not null default 1.0,
  xp integer not null default 0,
  rank text not null default 'Bronze',
  total_points integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, profile_id)
);

create table if not exists public.member_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  entity_label text,
  old_value text,
  new_value text,
  ip_address text,
  device text,
  browser text,
  page text,
  session_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_presence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'offline'
    check (status in ('online','offline','busy','break','lunch','vacation','idle')),
  last_heartbeat timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_presence
  add column if not exists current_path text,
  add column if not exists current_page text,
  add column if not exists active_call boolean not null default false,
  add column if not exists active_call_started_at timestamptz;

create index if not exists team_member_profiles_workspace_profile_idx
  on public.team_member_profiles (workspace_id, profile_id);
create index if not exists member_activity_log_workspace_created_idx
  on public.member_activity_log (workspace_id, created_at desc);
create index if not exists member_activity_log_profile_created_idx
  on public.member_activity_log (profile_id, created_at desc);
create index if not exists agent_presence_workspace_heartbeat_idx
  on public.agent_presence (workspace_id, last_heartbeat desc);

create or replace function public.can_manage_workspace_team(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_platform_admin(), false)
    or public.has_workspace_role(
      p_workspace_id,
      array['owner','supervisor','admin','manager']::text[]
    );
$$;

revoke all on function public.can_manage_workspace_team(uuid) from public, anon;
grant execute on function public.can_manage_workspace_team(uuid) to authenticated, service_role;

alter table public.team_member_profiles enable row level security;
alter table public.member_activity_log enable row level security;
alter table public.agent_presence enable row level security;

do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array['team_member_profiles','member_activity_log','agent_presence']
  loop
    for policy_name in
      select policyname
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, target_table);
    end loop;
  end loop;
end
$$;

create policy team_member_profiles_select_scoped
  on public.team_member_profiles
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.can_manage_workspace_team(workspace_id))
  );

create policy member_activity_log_select_scoped
  on public.member_activity_log
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.can_manage_workspace_team(workspace_id))
  );

create policy member_activity_log_insert_self
  on public.member_activity_log
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select public.is_active_workspace_member(workspace_id))
    and action in ('page_view','session_active','call_started','call_ended')
  );

create policy agent_presence_select_scoped
  on public.agent_presence
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.can_manage_workspace_team(workspace_id))
  );

create policy agent_presence_insert_self
  on public.agent_presence
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select public.is_active_workspace_member(workspace_id))
  );

create policy agent_presence_update_self
  on public.agent_presence
  for update to authenticated
  using (
    profile_id = (select auth.uid())
    and (select public.is_active_workspace_member(workspace_id))
  )
  with check (
    profile_id = (select auth.uid())
    and (select public.is_active_workspace_member(workspace_id))
  );

revoke insert, update, delete on public.team_member_profiles from authenticated;
revoke update, delete on public.member_activity_log from authenticated;
revoke delete on public.agent_presence from authenticated;
grant select on public.team_member_profiles, public.member_activity_log, public.agent_presence to authenticated;
grant insert on public.member_activity_log to authenticated;
grant insert, update on public.agent_presence to authenticated;

-- The browser never mutates another member directly. All role, permission,
-- suspension and removal changes pass through this audited workspace RPC.
create or replace function public.manage_workspace_team_member(
  p_workspace_id uuid,
  p_profile_id uuid,
  p_action text,
  p_role text default null,
  p_allowed_sections jsonb default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.profile_workspaces%rowtype;
  normalized_role text;
  normalized_sections jsonb := '[]'::jsonb;
  next_membership public.profile_workspaces%rowtype;
  all_sections constant jsonb := '["Dashboard","Orders","Confirmation","Shipping","Customers","Products","Inventory","Ads Manager","TikTok Ads","Expenses","COD Scenarios","Analytics","Team","Settings"]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.can_manage_workspace_team(p_workspace_id) then
    raise exception 'TEAM_MANAGEMENT_FORBIDDEN';
  end if;

  select * into target_membership
  from public.profile_workspaces
  where profile_id = p_profile_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TEAM_MEMBER_NOT_FOUND'; end if;
  if target_membership.is_owner then raise exception 'WORKSPACE_OWNER_CANNOT_BE_CHANGED'; end if;
  if p_profile_id = (select auth.uid()) then raise exception 'CANNOT_CHANGE_OWN_MEMBERSHIP'; end if;

  if p_action = 'update' then
    normalized_role := case when lower(coalesce(p_role, '')) = 'supervisor' then 'supervisor' else 'agent' end;
    if normalized_role = 'supervisor' then
      normalized_sections := all_sections;
    else
      select coalesce(jsonb_agg(section_name order by section_name), '[]'::jsonb)
      into normalized_sections
      from (
        select distinct allowed.value as section_name
        from jsonb_array_elements_text(coalesce(p_allowed_sections, '[]'::jsonb)) allowed(value)
        where all_sections ? allowed.value
      ) filtered;
      if jsonb_array_length(normalized_sections) = 0 then
        normalized_sections := '["Dashboard"]'::jsonb;
      end if;
    end if;

    update public.profile_workspaces
    set role = normalized_role
    where id = target_membership.id;

    update public.profiles
    set role = normalized_role,
        allowed_sections = normalized_sections
    where id = p_profile_id and workspace_id = p_workspace_id;

  elsif p_action = 'set_status' then
    if p_is_active is null then raise exception 'ACTIVE_STATUS_REQUIRED'; end if;
    update public.profile_workspaces
    set status = case when p_is_active then 'active' else 'suspended' end
    where id = target_membership.id;
    update public.profiles
    set is_active = p_is_active
    where id = p_profile_id and workspace_id = p_workspace_id;

  elsif p_action = 'remove' then
    update public.profile_workspaces
    set status = 'removed'
    where id = target_membership.id;

    select * into next_membership
    from public.profile_workspaces
    where profile_id = p_profile_id
      and workspace_id <> p_workspace_id
      and status = 'active'
    order by is_owner desc, created_at asc
    limit 1;

    if found then
      update public.profiles
      set workspace_id = next_membership.workspace_id,
          role = case when next_membership.is_owner then 'owner' else coalesce(next_membership.role, 'agent') end,
          is_active = true
      where id = p_profile_id and workspace_id = p_workspace_id;
    else
      update public.profiles
      set workspace_id = null,
          role = 'agent',
          allowed_sections = '[]'::jsonb,
          is_active = false
      where id = p_profile_id and workspace_id = p_workspace_id;
    end if;
  else
    raise exception 'UNSUPPORTED_TEAM_ACTION';
  end if;

  insert into public.team_audit_log (
    workspace_id, actor_id, action, target_type, target_id, changes
  ) values (
    p_workspace_id,
    (select auth.uid()),
    'member_' || p_action,
    'profile',
    p_profile_id,
    jsonb_build_object(
      'role', normalized_role,
      'allowed_sections', normalized_sections,
      'active', p_is_active
    )
  );

  return jsonb_build_object('success', true, 'action', p_action, 'profile_id', p_profile_id);
end;
$$;

revoke all on function public.manage_workspace_team_member(uuid,uuid,text,text,jsonb,boolean) from public, anon;
grant execute on function public.manage_workspace_team_member(uuid,uuid,text,text,jsonb,boolean) to authenticated;

-- A valid invitation signup creates a profile only. It does not provision a
-- separate workspace or subscription; acceptance attaches it to the inviter's
-- workspace and that workspace's subscription. Invalid invite metadata keeps
-- the existing normal owner-signup flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_workspace_name text;
  v_full_name text;
  v_free_plan_id uuid;
  v_invitation_id uuid;
  v_invitation_text text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User');
  v_invitation_text := coalesce(new.raw_user_meta_data->>'team_invitation_id', '');

  if v_invitation_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_invitation_id := v_invitation_text::uuid;
  end if;

  if v_invitation_id is not null and exists (
    select 1
    from public.workspace_invitations invitation
    where invitation.id = v_invitation_id
      and invitation.status = 'pending'
      and invitation.revoked_at is null
      and (invitation.expires_at is null or invitation.expires_at > now())
      and lower(invitation.email) = lower(new.email)
  ) then
    insert into public.profiles (id, full_name, email, role, workspace_id, is_active, allowed_sections)
    values (new.id, v_full_name, lower(new.email), 'agent', null, true, '[]'::jsonb)
    on conflict (id) do update
      set full_name = excluded.full_name,
          email = excluded.email;

    insert into public.workspace_limits (profile_id, max_workspaces)
    values (new.id, 1)
    on conflict (profile_id) do nothing;
    return new;
  end if;

  v_workspace_name := coalesce(new.raw_user_meta_data->>'workspace_name', v_full_name || '''s Workspace');
  insert into public.workspaces (name, status, plan)
  values (v_workspace_name, 'active', 'free')
  returning id into v_workspace_id;

  insert into public.profiles (id, full_name, email, role, workspace_id)
  values (new.id, v_full_name, lower(new.email), 'owner', v_workspace_id)
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        full_name = excluded.full_name,
        email = excluded.email;

  select id into v_free_plan_id
  from public.subscription_plans
  where name = 'free'
  limit 1;

  if v_free_plan_id is not null then
    insert into public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
    values (v_workspace_id, v_free_plan_id, 'pending_activation', now())
    on conflict do nothing;
  end if;

  insert into public.workspace_limits (profile_id, max_workspaces)
  values (new.id, 1)
  on conflict (profile_id) do nothing;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner)
  values (new.id, v_workspace_id, true)
  on conflict (profile_id, workspace_id) do nothing;

  return new;
end;
$$;

-- Keep Postgres Changes enabled for the low-frequency presence row. The
-- client heartbeats once per minute; high-frequency cursor/screen streaming is
-- intentionally not stored or broadcast.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'agent_presence'
    ) then
    alter publication supabase_realtime add table public.agent_presence;
  end if;
end
$$;

commit;
