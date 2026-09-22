-- An invited agent is a member of the inviter's workspace, never its billing
-- owner.  The generic profile trigger previously treated every profile with a
-- workspace_id as a new workspace owner, which left invitations accepted with
-- the wrong membership and a payment record.
begin;

create or replace function public.ensure_profile_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_member_role text;
  created_subscription boolean := false;
begin
  if lower(coalesce(new.role, '')) in ('agent', 'supervisor') then
    normalized_member_role := case
      when lower(new.role) = 'supervisor' then 'supervisor'
      else 'agent'
    end;

    insert into public.profile_workspaces (
      profile_id, workspace_id, is_owner, role, status
    )
    values (
      new.id, new.workspace_id, false, normalized_member_role, 'active'
    )
    on conflict (profile_id, workspace_id) do update
      set is_owner = false,
          role = excluded.role,
          status = 'active';

    insert into public.team_member_profiles (profile_id, workspace_id)
    values (new.id, new.workspace_id)
    on conflict (profile_id, workspace_id) do nothing;

    return new;
  end if;

  if not exists (
    select 1 from public.user_subscriptions where owner_user_id = new.id
  ) then
    insert into public.user_subscriptions (
      owner_user_id, plan_id, billing_cycle, status, payment_status, migration_state
    )
    values (new.id, null, null, 'active', 'unpaid', 'assigned');
    created_subscription := true;
  end if;

  insert into public.workspace_subscription_owners (workspace_id, owner_user_id, reason)
  values (new.workspace_id, new.id, 'New user signup')
  on conflict (workspace_id) do nothing;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  values (new.id, new.workspace_id, true, 'owner', 'active')
  on conflict (profile_id, workspace_id) do update
    set is_owner = true,
        role = 'owner',
        status = 'active';

  if created_subscription then
    update public.user_subscriptions
    set status = 'pending_payment', updated_at = now()
    where owner_user_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_profile_workspace_membership() from public, anon, authenticated;

create or replace function public.claim_pending_invitation_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.workspace_invitations%rowtype;
  v_full_name text;
  v_member_role text;
begin
  if new.email is null then
    return new;
  end if;

  select * into v_invitation
  from public.workspace_invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_member_role := case
    when lower(coalesce(v_invitation.role, '')) = 'supervisor' then 'supervisor'
    else 'agent'
  end;

  insert into public.profiles (
    id, full_name, email, role, workspace_id, allowed_sections, status, is_active
  )
  values (
    new.id,
    v_full_name,
    lower(new.email),
    v_member_role,
    v_invitation.workspace_id,
    coalesce(v_invitation.allowed_sections, array[]::text[]),
    'active',
    true
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        email = excluded.email,
        role = excluded.role,
        workspace_id = excluded.workspace_id,
        allowed_sections = excluded.allowed_sections,
        status = coalesce(public.profiles.status, 'active'),
        is_active = true;

  update public.workspace_invitations
  set status = 'accepted', accepted_at = now(), user_id = new.id
  where id = v_invitation.id and status = 'pending';

  return new;
end;
$$;

revoke all on function public.claim_pending_invitation_for_user() from public, anon, authenticated;

commit;
