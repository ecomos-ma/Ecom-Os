begin;

-- Production stores profiles.allowed_sections as text[]. The previous signup
-- trigger wrote JSONB, which aborted auth.users inserts with SQLSTATE 42804.
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
  v_founder_plan_id uuid;
  v_invitation_id uuid;
  v_invitation_text text := coalesce(new.raw_user_meta_data->>'team_invitation_id', '');
  v_has_invite boolean := false;
  v_is_founder boolean := lower(coalesce(new.email, '')) = 'amineelaaouamecom@gmail.com';
begin
  v_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  if v_invitation_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_invitation_id := v_invitation_text::uuid;
  end if;

  if v_invitation_id is not null then
    select exists (
      select 1
      from public.workspace_invitations invitation
      where invitation.id = v_invitation_id
        and invitation.status = 'pending'
        and invitation.revoked_at is null
        and (invitation.expires_at is null or invitation.expires_at > now())
        and lower(invitation.email) = lower(new.email)
    ) into v_has_invite;
  end if;

  if not v_has_invite then
    select exists (
      select 1
      from public.workspace_invitations invitation
      where invitation.status = 'pending'
        and invitation.revoked_at is null
        and (invitation.expires_at is null or invitation.expires_at > now())
        and lower(invitation.email) = lower(new.email)
    ) into v_has_invite;
  end if;

  if not v_is_founder and v_has_invite then
    insert into public.profiles (
      id, full_name, email, role, workspace_id, is_active, allowed_sections
    )
    values (
      new.id, v_full_name, lower(new.email), 'agent', null, true, array[]::text[]
    )
    on conflict (id) do update
      set full_name = coalesce(nullif(excluded.full_name, ''), full_name),
          email = excluded.email,
          role = 'agent',
          workspace_id = null,
          is_active = true,
          allowed_sections = array[]::text[],
          deleted_at = null;

    return new;
  end if;

  v_workspace_name := coalesce(
    new.raw_user_meta_data->>'workspace_name',
    v_full_name || '''s Workspace'
  );

  insert into public.workspaces (name, status, plan)
  values (v_workspace_name, 'active', case when v_is_founder then 'founder' else 'free' end)
  returning id into v_workspace_id;

  insert into public.profiles (id, full_name, email, role, workspace_id, is_active)
  values (
    new.id,
    v_full_name,
    lower(new.email),
    case when v_is_founder then 'founder' else 'owner' end,
    v_workspace_id,
    true
  )
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        is_active = true,
        deleted_at = null;

  insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  values (
    new.id,
    v_workspace_id,
    true,
    case when v_is_founder then 'founder' else 'owner' end,
    'active'
  )
  on conflict (profile_id, workspace_id) do update
    set is_owner = true,
        role = excluded.role,
        status = 'active';

  if v_is_founder then
    select id into v_founder_plan_id
    from public.subscription_plans
    where code = 'founder';

    insert into public.workspace_subscription_owners (workspace_id, owner_user_id, reason)
    values (v_workspace_id, new.id, 'Protected founder entitlement')
    on conflict (workspace_id) do update
      set owner_user_id = excluded.owner_user_id,
          reason = excluded.reason,
          updated_at = now();

    insert into public.user_subscriptions (
      owner_user_id, plan_id, billing_cycle, status, payment_status,
      current_period_start, current_period_end, activated_at, migration_state
    )
    values (new.id, v_founder_plan_id, 'annual', 'active', 'waived', now(), null, now(), 'assigned')
    on conflict (owner_user_id) do update
      set plan_id = excluded.plan_id,
          billing_cycle = 'annual',
          status = 'active',
          payment_status = 'waived',
          current_period_start = excluded.current_period_start,
          current_period_end = null,
          grace_until = null,
          suspended_at = null,
          suspended_by = null,
          cancelled_at = null,
          cancellation_reason = null,
          migration_state = 'assigned',
          updated_at = now();
  else
    select id into v_free_plan_id
    from public.subscription_plans
    where name = 'free'
    limit 1;

    if v_free_plan_id is not null then
      insert into public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
      values (v_workspace_id, v_free_plan_id, 'pending_activation', now())
      on conflict do nothing;
    end if;
  end if;

  insert into public.workspace_limits (profile_id, max_workspaces)
  values (new.id, case when v_is_founder then 2147483647 else 1 end)
  on conflict (profile_id) do update
    set max_workspaces = excluded.max_workspaces;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Keep invitation acceptance independent of the physical invitation column
-- type by normalizing its value through JSONB and assigning a text[] profile.
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
    update public.workspace_invitations
    set status = 'expired'
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

  select coalesce(array_agg(section.value), array[]::text[])
  into normalized_sections
  from jsonb_array_elements_text(
    coalesce(to_jsonb(invitation_row.allowed_sections), '[]'::jsonb)
  ) section(value);

  update public.profiles
  set workspace_id = invitation_row.workspace_id,
      allowed_sections = normalized_sections,
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
    jsonb_build_object('role', normalized_role, 'allowed_sections', to_jsonb(normalized_sections))
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

commit;

