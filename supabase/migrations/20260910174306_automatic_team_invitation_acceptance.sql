begin;

-- Accepting an invitation must trust the inviter's active workspace membership,
-- not the denormalized current role on profiles. Founders can legitimately have
-- profile role "founder" while being the owning member of a seller workspace.
create or replace function public.accept_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.workspace_invitations%rowtype;
  current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  active_members integer;
  member_limit integer;
  normalized_role text;
begin
  if (select auth.uid()) is null or current_email = '' then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into invitation_row
  from public.workspace_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if invitation_row.status = 'accepted' and invitation_row.user_id = (select auth.uid()) then
    return;
  end if;
  if invitation_row.status <> 'pending' then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
  if invitation_row.revoked_at is not null then raise exception 'INVITATION_REVOKED'; end if;
  if invitation_row.expires_at is not null and invitation_row.expires_at <= now() then
    update public.workspace_invitations
    set status = 'expired'
    where id = invitation_row.id and status = 'pending';
    raise exception 'INVITATION_EXPIRED';
  end if;
  if lower(invitation_row.email) <> current_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

  if not exists (
    select 1
    from public.profiles inviter
    join public.profile_workspaces membership
      on membership.profile_id = inviter.id
     and membership.workspace_id = invitation_row.workspace_id
    where inviter.id = invitation_row.invited_by
      and coalesce(inviter.is_active, true)
      and inviter.deleted_at is null
      and coalesce(membership.status, 'active') = 'active'
      and (
        membership.is_owner
        or lower(coalesce(membership.role, inviter.role, '')) = any(array['owner','supervisor','admin','manager','founder']::text[])
      )
  ) then
    raise exception 'INVITER_NO_LONGER_AUTHORIZED';
  end if;

  if not exists (
    select 1 from public.workspaces
    where id = invitation_row.workspace_id
      and coalesce(is_active, true)
      and deleted_at is null
  ) then
    raise exception 'WORKSPACE_NOT_AVAILABLE';
  end if;

  if exists (
    select 1 from public.profile_workspaces
    where profile_id = (select auth.uid())
      and workspace_id = invitation_row.workspace_id
      and coalesce(status, 'active') = 'active'
  ) then
    normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;
  else
    select count(*)::integer into active_members
    from public.profile_workspaces
    where workspace_id = invitation_row.workspace_id
      and coalesce(status, 'active') = 'active';

    select coalesce(active_override.team_member_limit, plan.team_member_limit, 10000)
    into member_limit
    from public.workspace_subscription_owners owner
    left join public.user_subscriptions subscription on subscription.owner_user_id = owner.owner_user_id
    left join public.subscription_plans plan on plan.id = subscription.plan_id and plan.is_official
    left join lateral (
      select override.team_member_limit
      from public.subscription_limit_overrides override
      where override.subscription_id = subscription.id
        and override.team_member_limit is not null
        and override.revoked_at is null
        and override.starts_at <= now()
        and (override.ends_at is null or override.ends_at > now())
      order by override.created_at desc
      limit 1
    ) active_override on true
    where owner.workspace_id = invitation_row.workspace_id;

    if coalesce(member_limit, 10000) <= active_members then
      raise exception 'TEAM_MEMBER_LIMIT_REACHED';
    end if;
    normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;
  end if;

  update public.profiles
  set workspace_id = invitation_row.workspace_id,
      allowed_sections = coalesce(invitation_row.allowed_sections, '[]'::jsonb),
      role = normalized_role,
      is_active = true,
      full_name = coalesce(nullif(invitation_row.full_name, ''), full_name)
  where id = (select auth.uid());
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  values ((select auth.uid()), invitation_row.workspace_id, false, normalized_role, 'active')
  on conflict (profile_id, workspace_id) do update
    set role = excluded.role,
        status = 'active',
        is_owner = false;

  insert into public.team_member_profiles (profile_id, workspace_id, daily_limit, max_active_orders)
  values (
    (select auth.uid()),
    invitation_row.workspace_id,
    coalesce(nullif(invitation_row.agent_settings->>'daily_limit', '')::integer, 80),
    coalesce(nullif(invitation_row.agent_settings->>'max_active_orders', '')::integer, 30)
  )
  on conflict (profile_id, workspace_id) do update
    set daily_limit = excluded.daily_limit,
        max_active_orders = excluded.max_active_orders;

  update public.workspace_invitations
  set status = 'accepted',
      accepted_at = now(),
      user_id = (select auth.uid())
  where id = invitation_row.id and status = 'pending';

  insert into public.team_audit_log (
    workspace_id, actor_id, actor_email, action,
    target_type, target_id, target_email, changes
  ) values (
    invitation_row.workspace_id,
    (select auth.uid()),
    current_email,
    'invitation_accepted',
    'invitation',
    invitation_row.id,
    invitation_row.email,
    jsonb_build_object('role', normalized_role, 'allowed_sections', invitation_row.allowed_sections)
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

-- Called during authenticated application startup. It accepts only a valid,
-- unexpired invitation whose normalized email matches the signed JWT email.
create or replace function public.accept_pending_workspace_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_invitation_id uuid;
  current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if (select auth.uid()) is null or current_email = '' then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select invitation.id into pending_invitation_id
  from public.workspace_invitations invitation
  where invitation.status = 'pending'
    and invitation.revoked_at is null
    and (invitation.expires_at is null or invitation.expires_at > now())
    and lower(invitation.email) = current_email
  order by invitation.created_at desc, invitation.id desc
  limit 1;

  if pending_invitation_id is null then
    return jsonb_build_object('accepted', false);
  end if;

  perform public.accept_workspace_invitation(pending_invitation_id);
  return jsonb_build_object('accepted', true, 'invitation_id', pending_invitation_id);
end;
$$;

revoke all on function public.accept_pending_workspace_invitation() from public, anon;
grant execute on function public.accept_pending_workspace_invitation() to authenticated;

-- New accounts created with the invited email must not provision an unrelated
-- workspace or subscription while they wait for their first authenticated boot.
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
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User');

  if exists (
    select 1
    from public.workspace_invitations invitation
    where invitation.status = 'pending'
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

commit;
