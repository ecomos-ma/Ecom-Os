begin;

-- Billing belongs to the workspace, not to an invited member. Resolve every
-- active member through workspace_subscription_owners and the canonical
-- one-argument subscription function. This also removes the stale call to the
-- deleted get_effective_subscription_v1(uuid, boolean) overload.
create or replace function public.resolve_workspace_access_v1(
  p_user_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  effective jsonb;
  member_access boolean;
  member_is_owner boolean;
  member_role text;
  blocked jsonb;
begin
  if p_user_id <> (select auth.uid())
     and not public.has_platform_permission('support.impersonate_read')
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'WORKSPACE_ACCESS_READ_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if public.is_root_founder() then
    effective := public.get_effective_subscription_v1(p_user_id);
    return jsonb_build_object(
      'allowed', true,
      'reason', 'root_founder_bypass',
      'workspace_id', p_workspace_id,
      'workspace_owner_id', p_user_id,
      'subscription', effective
    );
  end if;

  select
    true,
    coalesce(membership.is_owner, false),
    lower(coalesce(membership.role, ''))
  into member_access, member_is_owner, member_role
  from public.profile_workspaces membership
  where membership.profile_id = p_user_id
    and membership.workspace_id = p_workspace_id
    and coalesce(membership.status, 'active') = 'active';

  if not coalesce(member_access, false) then
    return jsonb_build_object('allowed', false, 'reason', 'not_active_workspace_member');
  end if;

  -- An accepted agent or supervisor is covered by workspace membership, not
  -- a personal subscription. They must be able to open their assigned
  -- workspace immediately, even while owner billing is reviewed or changed.
  if not coalesce(member_is_owner, false)
     and member_role = any (array['agent', 'supervisor']::text[]) then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'team_member_workspace_access',
      'workspace_id', p_workspace_id,
      'subscription', jsonb_build_object(
        'status', 'active',
        'operational_access', true,
        'access_reason', 'team_member_workspace_access',
        'plan', jsonb_build_object('code', 'team_member'),
        'limits', jsonb_build_object('workspaces', 0)
      )
    );
  end if;

  select billing_owner.owner_user_id into owner_id
  from public.workspace_subscription_owners billing_owner
  where billing_owner.workspace_id = p_workspace_id;

  if owner_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'workspace_billing_owner_missing');
  end if;

  effective := public.get_effective_subscription_v1(owner_id);
  blocked := public.is_subscription_blocked_v1(p_workspace_id);

  if coalesce((blocked ->> 'blocked')::boolean, false) then
    return jsonb_build_object(
      'allowed', false,
      'reason', blocked ->> 'reason',
      'message', blocked ->> 'message',
      'workspace_id', p_workspace_id,
      'workspace_owner_id', owner_id,
      'subscription', coalesce(blocked -> 'subscription', effective),
      'limit', blocked -> 'limit',
      'used', blocked -> 'used',
      'period_end', blocked ->> 'period_end',
      'block_detail', blocked
    );
  end if;

  return jsonb_build_object(
    'allowed', coalesce((effective ->> 'operational_access')::boolean, false),
    'reason', case
      when owner_id = p_user_id then effective ->> 'access_reason'
      else 'team_member_inherited_access'
    end,
    'workspace_id', p_workspace_id,
    'workspace_owner_id', owner_id,
    'subscription', effective
  );
end;
$$;

comment on function public.resolve_workspace_access_v1(uuid, uuid) is
  'Authorizes active agents and supervisors by workspace membership; invited members never need a separate plan or payment review.';

revoke all on function public.resolve_workspace_access_v1(uuid, uuid) from public, anon;
grant execute on function public.resolve_workspace_access_v1(uuid, uuid) to authenticated, service_role;

commit;
