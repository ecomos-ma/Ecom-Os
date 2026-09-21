begin;

-- Invitation acceptance is an authenticated, server-side transition. Keep it
-- independent from billing tables: an invited member uses the owner's
-- workspace and must not be blocked because subscription data is incomplete
-- or has a legacy shape.
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
begin
  if current_user_id is null or current_email = '' then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into invitation_row
  from public.workspace_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if invitation_row.status = 'accepted' and invitation_row.user_id = current_user_id then
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
  if lower(invitation_row.email) <> current_email then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;

  -- The invitation is valid only while its sender still has authority in the
  -- target workspace. The check uses membership, not only the profile role.
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
    select 1
    from public.workspaces workspace
    where workspace.id = invitation_row.workspace_id
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
  ) then
    raise exception 'WORKSPACE_NOT_AVAILABLE';
  end if;

  normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;

  update public.profiles
  set workspace_id = invitation_row.workspace_id,
      allowed_sections = coalesce(invitation_row.allowed_sections, '[]'::jsonb),
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
    jsonb_build_object('role', normalized_role, 'allowed_sections', invitation_row.allowed_sections)
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

-- Existing invited users can accept after a normal sign-in, even if they do
-- not revisit the original email link.
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

commit;
