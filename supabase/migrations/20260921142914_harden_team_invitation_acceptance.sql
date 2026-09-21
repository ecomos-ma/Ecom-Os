begin;

-- Keep the normal self-escalation guard while allowing a profile change that
-- exactly matches a valid pending invitation for the signed-in email.
create or replace function public.prevent_self_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if tg_op = 'UPDATE'
     and new.id = (select auth.uid())
     and (new.is_active is distinct from old.is_active or new.role is distinct from old.role) then
    if exists (
      select 1
      from public.workspace_invitations invitation
      where invitation.workspace_id = new.workspace_id
        and invitation.status = 'pending'
        and invitation.revoked_at is null
        and (invitation.expires_at is null or invitation.expires_at > now())
        and lower(invitation.email) = current_email
        and (case when invitation.role = 'supervisor' then 'supervisor' else 'agent' end) = new.role
    ) then
      return new;
    end if;
    raise exception 'You cannot change your own activation or role state';
  end if;
  return new;
end;
$$;

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
  active_members integer := 0;
  member_limit integer := 10000;
  already_a_member boolean := false;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

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

  normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;

  if not exists (
    select 1
    from public.profile_workspaces membership
    join public.profiles inviter on inviter.id = membership.profile_id
    where membership.profile_id = invitation_row.invited_by
      and membership.workspace_id = invitation_row.workspace_id
      and coalesce(membership.status, 'active') = 'active'
      and coalesce(inviter.is_active, true)
      and inviter.deleted_at is null
      and (
        membership.is_owner
        or lower(coalesce(membership.role, inviter.role, '')) = any(array['owner','supervisor','admin','manager','founder']::text[])
      )
  ) then
    raise exception 'INVITER_NO_LONGER_AUTHORIZED';
  end if;

  if not exists (
    select 1 from public.workspaces workspace
    where workspace.id = invitation_row.workspace_id
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
  ) then
    raise exception 'WORKSPACE_NOT_AVAILABLE';
  end if;

  select exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id = current_user_id
      and membership.workspace_id = invitation_row.workspace_id
      and coalesce(membership.status, 'active') = 'active'
  ) into already_a_member;

  if not already_a_member then
    select count(*)::integer into active_members
    from public.profile_workspaces membership
    where membership.workspace_id = invitation_row.workspace_id
      and coalesce(membership.status, 'active') = 'active';

    select coalesce(active_override.team_member_limit, plan.team_member_limit, 10000)
    into member_limit
    from public.workspace_subscription_owners owner_link
    left join public.user_subscriptions subscription on subscription.owner_user_id = owner_link.owner_user_id
    left join public.subscription_plans plan on plan.id = subscription.plan_id and plan.is_official
    left join lateral (
      select limit_override.team_member_limit
      from public.subscription_limit_overrides limit_override
      where limit_override.subscription_id = subscription.id
        and limit_override.team_member_limit is not null
        and limit_override.revoked_at is null
        and limit_override.starts_at <= now()
        and (limit_override.ends_at is null or limit_override.ends_at > now())
      order by limit_override.created_at desc
      limit 1
    ) active_override on true
    where owner_link.workspace_id = invitation_row.workspace_id;

    if coalesce(member_limit, 10000) <= active_members then
      raise exception 'TEAM_MEMBER_LIMIT_REACHED';
    end if;
  end if;

  update public.profiles
  set workspace_id = invitation_row.workspace_id,
      allowed_sections = invitation_row.allowed_sections,
      role = normalized_role,
      is_active = true,
      full_name = coalesce(nullif(invitation_row.full_name, ''), full_name)
  where id = current_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  values (current_user_id, invitation_row.workspace_id, false, normalized_role, 'active')
  on conflict (profile_id, workspace_id) do update
    set role = excluded.role,
        status = 'active',
        is_owner = false;

  insert into public.team_member_profiles (profile_id, workspace_id, daily_limit, max_active_orders)
  values (
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
    invitation_row.workspace_id,
    current_user_id,
    current_email,
    'invitation_accepted',
    'invitation',
    invitation_row.id,
    invitation_row.email,
    jsonb_build_object('role', normalized_role, 'allowed_sections', to_jsonb(invitation_row.allowed_sections))
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

commit;
