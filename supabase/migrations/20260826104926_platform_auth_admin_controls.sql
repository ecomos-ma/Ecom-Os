-- Server-only Auth Admin coordination. The Edge Function performs GoTrue
-- operations; these functions maintain application-level JWT cut-off,
-- root protection, and an immutable actor-attributed audit record.

begin;

alter table public.profiles add column if not exists session_not_before timestamptz;

create table if not exists public.platform_auth_controls (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  banned boolean not null default false,
  ban_reason text,
  banned_at timestamptz,
  banned_by uuid references auth.users(id) on delete set null,
  force_logout_at timestamptz,
  force_logout_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_auth_controls enable row level security;

create or replace function public.platform_record_auth_action_internal_v1(
  p_actor_id uuid,
  p_target_profile_id uuid,
  p_action text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_action text := lower(trim(coalesce(p_action, '')));
  actor_email_value text;
  actor_role_value text;
  target_name_value text;
  target_email_value text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if normalized_action not in ('ban','unban','force_logout','hard_delete') then
    raise exception 'INVALID_AUTH_ACTION' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'AUTH_ACTION_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_actor_id = p_target_profile_id then
    raise exception 'ADMIN_CANNOT_APPLY_AUTH_ACTION_TO_SELF' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.platform_admin_assignments assignment
    where assignment.profile_id = p_target_profile_id
      and assignment.role_key = 'root_founder'
      and assignment.status = 'active'
  ) then
    raise exception 'ROOT_FOUNDER_IS_PROTECTED' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.platform_admin_assignments assignment
    join public.platform_admin_role_permissions role_permission on role_permission.role_key = assignment.role_key
    join public.platform_admin_permissions permission on permission.permission_key = role_permission.permission_key
    where assignment.profile_id = p_actor_id
      and assignment.status = 'active'
      and (assignment.expires_at is null or assignment.expires_at > now())
      and permission.permission_key = case
        when normalized_action in ('ban','unban') then 'users.ban'
        when normalized_action = 'hard_delete' then 'users.delete'
        else 'users.manage'
      end
  ) then
    raise exception 'AUTH_ACTION_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(auth_user.email, profile.email), coalesce(assignment.role_key, profile.role)
  into actor_email_value, actor_role_value
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  left join public.platform_admin_assignments assignment on assignment.profile_id = profile.id and assignment.status = 'active'
  where profile.id = p_actor_id;

  select profile.full_name, coalesce(auth_user.email, profile.email)
  into target_name_value, target_email_value
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_target_profile_id;
  if target_email_value is null then raise exception 'TARGET_PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;

  if normalized_action = 'ban' then
    insert into public.platform_auth_controls(profile_id, banned, ban_reason, banned_at, banned_by, updated_at)
    values (p_target_profile_id, true, trim(p_reason), now(), p_actor_id, now())
    on conflict (profile_id) do update set banned = true, ban_reason = excluded.ban_reason, banned_at = excluded.banned_at, banned_by = excluded.banned_by, updated_at = now();
    update public.profiles set is_active = false, session_not_before = now() where id = p_target_profile_id;
  elsif normalized_action = 'unban' then
    insert into public.platform_auth_controls(profile_id, banned, ban_reason, banned_at, banned_by, updated_at)
    values (p_target_profile_id, false, null, null, null, now())
    on conflict (profile_id) do update set banned = false, ban_reason = null, banned_at = null, banned_by = null, updated_at = now();
    update public.profiles profile set is_active = not exists (
      select 1 from public.founder_account_controls control
      where control.profile_id = profile.id and control.state in ('suspended','closed')
    ) where profile.id = p_target_profile_id;
  elsif normalized_action = 'force_logout' then
    insert into public.platform_auth_controls(profile_id, force_logout_at, force_logout_by, updated_at)
    values (p_target_profile_id, now(), p_actor_id, now())
    on conflict (profile_id) do update set force_logout_at = excluded.force_logout_at, force_logout_by = excluded.force_logout_by, updated_at = now();
    update public.profiles set session_not_before = now() where id = p_target_profile_id;
  end if;

  if normalized_action in ('ban','force_logout','hard_delete') then
    delete from auth.sessions where user_id = p_target_profile_id;
  end if;

  insert into public.platform_audit_logs(
    actor_id, actor_email, actor_role, action, target_type, target_id, target_name, metadata
  ) values (
    p_actor_id, lower(actor_email_value), actor_role_value,
    'user_' || normalized_action, 'profile', p_target_profile_id,
    coalesce(target_name_value, target_email_value),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', trim(p_reason), 'target_email', target_email_value)
  );
end;
$$;

-- Session cut-off is part of every tenant membership check. Deleting refresh
-- sessions stops renewal; this rejects already-issued access JWTs immediately.
create or replace function public.is_active_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_workspaces membership
    join public.profiles profile on profile.id = membership.profile_id
    left join public.platform_auth_controls auth_control on auth_control.profile_id = profile.id
    where membership.profile_id = (select auth.uid())
      and membership.workspace_id = p_workspace_id
      and membership.status = 'active'
      and coalesce(profile.is_active, true)
      and profile.deleted_at is null
      and not coalesce(auth_control.banned, false)
      and (
        profile.session_not_before is null
        or to_timestamp(nullif((select auth.jwt()) ->> 'iat', '')::bigint) >= profile.session_not_before
      )
  );
$$;

revoke all on function public.platform_record_auth_action_internal_v1(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.platform_record_auth_action_internal_v1(uuid, uuid, text, text, jsonb) to service_role;

create or replace function public.platform_list_users_v1(
  p_page integer default 1,
  p_page_size integer default 30,
  p_query text default null,
  p_platform_role text default null,
  p_membership_role text default null,
  p_account_state text default null,
  p_subscription_status text default null,
  p_has_workspace boolean default null,
  p_created_from date default null,
  p_created_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 30), 1), 100);
  result jsonb;
begin
  if not public.has_platform_permission('users.read') then raise exception 'USERS_READ_REQUIRED' using errcode = '42501'; end if;
  with user_rows as (
    select profile.id, profile.full_name, coalesce(auth_user.email, profile.email) as email,
      profile.avatar_url, profile.role, profile.workspace_id, profile.created_at,
      profile.last_login_at, profile.last_active, profile.is_active,
      coalesce(auth_control.banned, false) as banned,
      case
        when coalesce(auth_control.banned, false) then 'banned'
        when profile.deleted_at is not null or account.state = 'closed' then 'closed'
        when not coalesce(profile.is_active, true) or account.state = 'suspended' then 'suspended'
        else 'active'
      end as status,
      account.reason, account.user_message, account.effective_until,
      subscription.status as subscription_status,
      plan.code as subscription_plan,
      exists (select 1 from public.profile_workspaces membership where membership.profile_id = profile.id) as has_workspace,
      coalesce((select jsonb_agg(jsonb_build_object(
        'workspace_id', membership.workspace_id,
        'workspace_name', workspace.name,
        'workspace_status', coalesce(workspace.status, 'active'),
        'plan', coalesce(plan_for_owner.code, workspace.plan, 'unassigned'),
        'is_owner', membership.is_owner,
        'member_role', case when membership.is_owner then 'owner' else coalesce(membership.role, profile.role, 'viewer') end,
        'orders', (select count(*) from public.orders orders where orders.workspace_id = workspace.id),
        'revenue', (select coalesce(sum(orders.total), 0) from public.orders orders where orders.workspace_id = workspace.id and public.canonical_order_status_v1(coalesce(nullif(to_jsonb(orders) ->> 'shipping_status', ''), nullif(to_jsonb(orders) ->> 'delivery_status', ''), orders.status)) = 'DELIVERED')
      ) order by membership.created_at desc)
      from public.profile_workspaces membership
      join public.workspaces workspace on workspace.id = membership.workspace_id
      left join public.workspace_subscription_owners owner_link on owner_link.workspace_id = workspace.id
      left join public.user_subscriptions subscription_for_owner on subscription_for_owner.owner_user_id = owner_link.owner_user_id
      left join public.subscription_plans plan_for_owner on plan_for_owner.id = subscription_for_owner.plan_id
      where membership.profile_id = profile.id), '[]'::jsonb) as memberships
    from public.profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.founder_account_controls account on account.profile_id = profile.id
    left join public.platform_auth_controls auth_control on auth_control.profile_id = profile.id
    left join public.user_subscriptions subscription on subscription.owner_user_id = profile.id
    left join public.subscription_plans plan on plan.id = subscription.plan_id
  ), filtered as (
    select * from user_rows item
    where (p_query is null or trim(p_query) = '' or coalesce(item.full_name, '') ilike '%' || trim(p_query) || '%' or coalesce(item.email, '') ilike '%' || trim(p_query) || '%' or item.id::text = trim(p_query) or exists (select 1 from jsonb_array_elements(item.memberships) membership where membership ->> 'workspace_name' ilike '%' || trim(p_query) || '%'))
      and (p_platform_role is null or trim(p_platform_role) = '' or lower(item.role) = lower(trim(p_platform_role)))
      and (p_account_state is null or trim(p_account_state) = '' or item.status = lower(trim(p_account_state)))
      and (p_subscription_status is null or trim(p_subscription_status) = '' or coalesce(item.subscription_status, 'unassigned') = lower(trim(p_subscription_status)))
      and (p_has_workspace is null or item.has_workspace = p_has_workspace)
      and (p_membership_role is null or trim(p_membership_role) = '' or exists (select 1 from jsonb_array_elements(item.memberships) membership where lower(membership ->> 'member_role') = lower(trim(p_membership_role))))
      and (p_created_from is null or item.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or item.created_at < (p_created_to + 1)::timestamptz)
  ), paged as (
    select * from filtered order by created_at desc, id desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by paged.created_at desc) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered), 'page', current_page, 'page_size', size_value
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_get_user_360_v1(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_platform_permission('users.read') then raise exception 'USERS_READ_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', profile.id, 'full_name', profile.full_name, 'email', coalesce(auth_user.email, profile.email),
      'avatar_url', profile.avatar_url, 'role', profile.role, 'workspace_id', profile.workspace_id,
      'is_active', profile.is_active, 'created_at', profile.created_at, 'last_login_at', profile.last_login_at,
      'last_active', profile.last_active, 'banned', coalesce(auth_control.banned, false),
      'status', case when coalesce(auth_control.banned, false) then 'banned' when profile.deleted_at is not null or account.state = 'closed' then 'closed' when not coalesce(profile.is_active, true) or account.state = 'suspended' then 'suspended' else 'active' end,
      'reason', account.reason, 'user_message', account.user_message, 'effective_until', account.effective_until,
      'force_logout_at', auth_control.force_logout_at
    ),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object(
      'workspace_id', membership.workspace_id, 'workspace_name', workspace.name,
      'workspace_status', coalesce(workspace.status, 'active'),
      'plan', coalesce(owner_plan.code, workspace.plan, 'unassigned'),
      'is_owner', membership.is_owner,
      'member_role', case when membership.is_owner then 'owner' else coalesce(membership.role, profile.role, 'viewer') end,
      'orders', (select count(*) from public.orders orders where orders.workspace_id = workspace.id),
      'revenue', (select coalesce(sum(orders.total), 0) from public.orders orders where orders.workspace_id = workspace.id and public.canonical_order_status_v1(coalesce(nullif(to_jsonb(orders) ->> 'shipping_status', ''), nullif(to_jsonb(orders) ->> 'delivery_status', ''), orders.status)) = 'DELIVERED')
    ) order by membership.created_at desc)
    from public.profile_workspaces membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    left join public.workspace_subscription_owners owner_link on owner_link.workspace_id = workspace.id
    left join public.user_subscriptions owner_subscription on owner_subscription.owner_user_id = owner_link.owner_user_id
    left join public.subscription_plans owner_plan on owner_plan.id = owner_subscription.plan_id
    where membership.profile_id = profile.id), '[]'::jsonb),
    'owned_businesses', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', workspace.id, 'workspace_name', workspace.name, 'status', workspace.status) order by workspace.created_at)
      from public.workspace_subscription_owners owner join public.workspaces workspace on workspace.id = owner.workspace_id where owner.owner_user_id = profile.id), '[]'::jsonb),
    'subscription', (select public.get_effective_subscription_v1(profile.id)),
    'activity', coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at desc) from (select id, action, reason, created_at from public.founder_audit_events where target_id = profile.id order by created_at desc limit 30) event), '[]'::jsonb),
    'notes', case when public.has_platform_permission('users.manage') then coalesce((select jsonb_agg(jsonb_build_object('id', note.id, 'body', note.body, 'created_at', note.created_at) order by note.created_at desc) from public.founder_user_notes note where note.profile_id = profile.id), '[]'::jsonb) else '[]'::jsonb end,
    'tickets', case when public.has_platform_permission('support.read') then coalesce((select jsonb_agg(jsonb_build_object('id', ticket.id, 'subject', ticket.subject, 'status', ticket.status, 'priority', ticket.priority, 'created_at', ticket.created_at) order by ticket.created_at desc) from public.support_tickets ticket where ticket.created_by = profile.id), '[]'::jsonb) else '[]'::jsonb end
  ) into result
  from public.profiles profile
  left join auth.users auth_user on auth_user.id = profile.id
  left join public.founder_account_controls account on account.profile_id = profile.id
  left join public.platform_auth_controls auth_control on auth_control.profile_id = profile.id
  where profile.id = p_profile_id;
  if result is null then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.platform_list_users_v1(integer, integer, text, text, text, text, text, boolean, date, date) from public, anon;
revoke all on function public.platform_get_user_360_v1(uuid) from public, anon;
grant execute on function public.platform_list_users_v1(integer, integer, text, text, text, text, text, boolean, date, date) to authenticated, service_role;
grant execute on function public.platform_get_user_360_v1(uuid) to authenticated, service_role;

commit;
