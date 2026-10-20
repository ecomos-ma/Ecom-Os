-- Workspace-scoped team permissions
--
-- Existing memberships keep allowed_sections = NULL and continue to fall back
-- to profiles.allowed_sections. New invitations and later edits write the
-- workspace-specific value. This avoids a silent permission backfill while
-- closing cross-workspace permission bleed for all new changes.

begin;

alter table public.profile_workspaces
  add column if not exists allowed_sections text[];

comment on column public.profile_workspaces.allowed_sections is
  'Workspace-specific module access. NULL means legacy fallback to profiles.allowed_sections until the owner saves this membership.';

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
      join public.profiles profile on profile.id = membership.profile_id
      where membership.profile_id = (select auth.uid())
        and membership.workspace_id = p_workspace_id
        and membership.status = 'active'
        and coalesce(profile.is_active, true)
        and profile.deleted_at is null
        and exists (
          select 1
          from unnest(
            coalesce(
              membership.allowed_sections,
              profile.allowed_sections,
              array[]::text[]
            )
          ) section_name
          where lower(section_name) = lower(coalesce(p_section, ''))
        )
    );
$$;

revoke all on function public.can_access_workspace_section(uuid, text) from public, anon;
grant execute on function public.can_access_workspace_section(uuid, text) to authenticated, service_role;

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
  normalized_sections text[] := array[]::text[];
  next_membership public.profile_workspaces%rowtype;
  all_sections constant text[] := array[
    'Dashboard','Orders','Confirmation','Shipping','Customers','Products',
    'Inventory','Ads Manager','TikTok Ads','Expenses','COD Scenarios',
    'Analytics','Team','Settings'
  ]::text[];
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_MANAGEMENT_FORBIDDEN'; end if;

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
      select coalesce(array_agg(section_name order by section_name), array[]::text[])
      into normalized_sections
      from (
        select distinct requested.value as section_name
        from jsonb_array_elements_text(coalesce(p_allowed_sections, '[]'::jsonb)) requested(value)
        where requested.value = any(all_sections)
      ) filtered;
      if coalesce(array_length(normalized_sections, 1), 0) = 0 then
        normalized_sections := array['Dashboard']::text[];
      end if;
    end if;

    update public.profile_workspaces
    set role = normalized_role,
        allowed_sections = normalized_sections
    where id = target_membership.id;

    -- profiles remains the compatibility cache for the currently selected
    -- workspace. Authorization reads the membership value first.
    update public.profiles
    set role = normalized_role,
        allowed_sections = normalized_sections
    where id = p_profile_id and workspace_id = p_workspace_id;

  elsif p_action = 'set_status' then
    if p_is_active is null then raise exception 'ACTIVE_STATUS_REQUIRED'; end if;
    update public.profile_workspaces
    set status = case when p_is_active then 'active' else 'suspended' end
    where id = target_membership.id;

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
          allowed_sections = coalesce(next_membership.allowed_sections, allowed_sections),
          is_active = true
      where id = p_profile_id and workspace_id = p_workspace_id;
    else
      update public.profiles
      set workspace_id = null,
          role = 'agent',
          allowed_sections = array[]::text[],
          is_active = false
      where id = p_profile_id and workspace_id = p_workspace_id;
    end if;
  else
    raise exception 'UNSUPPORTED_TEAM_ACTION';
  end if;

  insert into public.team_audit_log (
    workspace_id, actor_id, action, target_type, target_id, changes
  ) values (
    p_workspace_id, (select auth.uid()), 'member_' || p_action,
    'profile', p_profile_id,
    jsonb_build_object(
      'role', normalized_role,
      'allowed_sections', to_jsonb(normalized_sections),
      'active', p_is_active
    )
  );

  return jsonb_build_object('success', true, 'action', p_action, 'profile_id', p_profile_id);
end;
$$;

revoke all on function public.manage_workspace_team_member(uuid,uuid,text,text,jsonb,boolean) from public, anon;
grant execute on function public.manage_workspace_team_member(uuid,uuid,text,text,jsonb,boolean) to authenticated;

-- Replaces the drifted live function that temporarily dropped a global profile
-- protection trigger. Invitation acceptance is now row-locked and never changes
-- schema objects at runtime.
create or replace function public.accept_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.workspace_invitations%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  normalized_role text;
  normalized_sections text[] := array[]::text[];
begin
  if current_user_id is null or current_email = '' then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into invitation_row
  from public.workspace_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if invitation_row.status = 'accepted' and invitation_row.user_id = current_user_id then return; end if;
  if invitation_row.status <> 'pending' then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
  if invitation_row.revoked_at is not null then raise exception 'INVITATION_REVOKED'; end if;
  if invitation_row.expires_at is not null and invitation_row.expires_at <= now() then
    update public.workspace_invitations set status = 'expired'
    where id = invitation_row.id and status = 'pending';
    raise exception 'INVITATION_EXPIRED';
  end if;
  if lower(invitation_row.email) <> current_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

  if not exists (
    select 1
    from public.profile_workspaces membership
    join public.profiles inviter on inviter.id = membership.profile_id
    where membership.profile_id = invitation_row.invited_by
      and membership.workspace_id = invitation_row.workspace_id
      and membership.status = 'active'
      and coalesce(inviter.is_active, true)
      and inviter.deleted_at is null
      and (
        membership.is_owner
        or lower(coalesce(membership.role, inviter.role, ''))
          = any(array['owner','supervisor','admin','manager','founder']::text[])
      )
  ) then raise exception 'INVITER_NO_LONGER_AUTHORIZED'; end if;

  if not exists (
    select 1 from public.workspaces workspace
    where workspace.id = invitation_row.workspace_id
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
  ) then raise exception 'WORKSPACE_NOT_AVAILABLE'; end if;

  normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;
  select coalesce(array_agg(section.value), array[]::text[])
  into normalized_sections
  from jsonb_array_elements_text(coalesce(to_jsonb(invitation_row.allowed_sections), '[]'::jsonb)) section(value);

  update public.profiles
  set workspace_id = invitation_row.workspace_id,
      allowed_sections = normalized_sections,
      role = normalized_role,
      is_active = true,
      full_name = coalesce(nullif(invitation_row.full_name, ''), full_name)
  where id = current_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.profile_workspaces (
    profile_id, workspace_id, is_owner, role, status, allowed_sections
  ) values (
    current_user_id, invitation_row.workspace_id, false, normalized_role,
    'active', normalized_sections
  )
  on conflict (profile_id, workspace_id) do update
    set role = excluded.role,
        status = 'active',
        is_owner = false,
        allowed_sections = excluded.allowed_sections;

  insert into public.team_member_profiles (
    profile_id, workspace_id, daily_limit, max_active_orders
  ) values (
    current_user_id,
    invitation_row.workspace_id,
    coalesce(nullif(invitation_row.agent_settings->>'daily_limit', '')::integer, 80),
    coalesce(nullif(invitation_row.agent_settings->>'max_active_orders', '')::integer, 30)
  )
  on conflict (profile_id, workspace_id) do update
    set daily_limit = excluded.daily_limit,
        max_active_orders = excluded.max_active_orders;

  update public.workspace_invitations
  set status = 'accepted', accepted_at = now(), user_id = current_user_id
  where id = invitation_row.id and status = 'pending';

  insert into public.team_audit_log (
    workspace_id, actor_id, actor_email, action,
    target_type, target_id, target_email, changes
  ) values (
    invitation_row.workspace_id, current_user_id, current_email,
    'invitation_accepted', 'invitation', invitation_row.id,
    invitation_row.email,
    jsonb_build_object(
      'role', normalized_role,
      'allowed_sections', to_jsonb(normalized_sections)
    )
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

commit;
