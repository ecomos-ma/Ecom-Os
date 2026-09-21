-- Fix invited-agent signups failing with "Database error saving new user".
--
-- Auth runs handle_new_user() inside the auth.users INSERT transaction. An
-- invited agent must only get a profile at this stage; workspace membership
-- and the invitation transition are completed by accept_workspace_invitation()
-- after the user is authenticated. Touching billing/workspace_limits here can
-- abort the auth transaction and leave the invitation unusable.

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

  -- Prefer the invitation token supplied by the signup page. The email
  -- fallback keeps older invitation links working when metadata was omitted.
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
    -- Keep this transaction independent of billing and workspace limits. The
    -- invitation RPC creates the actual membership after authentication.
    insert into public.profiles (
      id, full_name, email, role, workspace_id, is_active, allowed_sections
    )
    values (
      new.id, v_full_name, lower(new.email), 'agent', null, true, '[]'::jsonb
    )
    on conflict (id) do update
      set full_name = coalesce(nullif(excluded.full_name, ''), full_name),
          email = excluded.email,
          role = 'agent',
          workspace_id = null,
          is_active = true,
          allowed_sections = '[]'::jsonb,
          deleted_at = null;

    return new;
  end if;

  -- Normal owner signup and protected founder signup retain the existing
  -- workspace, subscription, and unlimited-founder provisioning behavior.
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
