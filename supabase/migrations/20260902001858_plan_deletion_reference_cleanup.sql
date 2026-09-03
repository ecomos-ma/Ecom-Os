begin;

-- A plan can be removed from the catalog without deleting seller, workspace,
-- or payment-history records. The records remain intact but become unassigned.
alter table public.subscription_payment_requests
  alter column requested_plan_id drop not null;

alter table public.workspace_subscriptions
  alter column plan_id drop not null;

alter table public.subscription_payment_requests
  drop constraint if exists subscription_payment_requests_current_plan_id_fkey,
  drop constraint if exists subscription_payment_requests_requested_plan_id_fkey;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_plan_id_fkey;

alter table public.workspace_subscriptions
  drop constraint if exists workspace_subscriptions_plan_id_fkey;

alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_current_plan_id_fkey
    foreign key (current_plan_id) references public.subscription_plans(id) on delete set null,
  add constraint subscription_payment_requests_requested_plan_id_fkey
    foreign key (requested_plan_id) references public.subscription_plans(id) on delete set null;

alter table public.user_subscriptions
  add constraint user_subscriptions_plan_id_fkey
    foreign key (plan_id) references public.subscription_plans(id) on delete set null;

alter table public.workspace_subscriptions
  add constraint workspace_subscriptions_plan_id_fkey
    foreign key (plan_id) references public.subscription_plans(id) on delete set null;

-- The verified root founder remains able to enter and recover the platform,
-- even when the selected workspace no longer has a plan assignment.
create or replace function public.resolve_workspace_access_v1(p_user_id uuid, p_workspace_id uuid)
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

  select exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id = p_user_id and membership.workspace_id = p_workspace_id and membership.status = 'active'
  ) into member_access;

  select owner.owner_user_id into owner_id from public.workspace_subscription_owners owner where owner.workspace_id = p_workspace_id;

  if not member_access then
    return jsonb_build_object('allowed', false, 'reason', 'not_active_workspace_member');
  end if;

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
    'reason', effective ->> 'access_reason',
    'workspace_id', p_workspace_id,
    'workspace_owner_id', owner_id,
    'subscription', effective
  );
end;
$$;

commit;
