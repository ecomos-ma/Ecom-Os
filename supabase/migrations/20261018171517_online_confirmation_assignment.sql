-- Online confirmation assignment
--
-- Automatic assignment is intentionally presence-aware and never includes a
-- workspace owner. Manual owner assignments are marked separately so a later
-- presence heartbeat cannot silently undo an explicit management decision.

create index if not exists agent_presence_online_workspace_heartbeat_idx
  on public.agent_presence (workspace_id, last_heartbeat desc, profile_id)
  where status = 'online';

alter table public.order_assignments
  add column if not exists assigned_at timestamptz default now(),
  add column if not exists notes text;

create index if not exists order_assignments_workspace_order_latest_idx
  on public.order_assignments (workspace_id, order_id, assigned_at desc, id desc);

-- Shared implementation used by the management RPC and presence trigger.
-- p_include_manual = false limits a background rebalance to unassigned and
-- previously auto-managed orders. An explicit owner "Balance all" request can
-- opt in to rebalancing every open confirmation order.
create or replace function public.distribute_online_confirmation_orders_internal_v2(
  p_workspace_id uuid,
  p_order_ids uuid[] default null,
  p_include_manual boolean default false,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_online_count integer := 0;
  v_changed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('online-confirmation:' || p_workspace_id::text));

  select count(*) into v_online_count
  from public.profile_workspaces pw
  join public.profiles p on p.id = pw.profile_id
  join public.agent_presence ap
    on ap.workspace_id = pw.workspace_id
   and ap.profile_id = pw.profile_id
   and ap.status = 'online'
   and ap.last_heartbeat >= now() - interval '2 minutes'
  where pw.workspace_id = p_workspace_id
    and pw.status = 'active'
    and not coalesce(pw.is_owner, false)
    and not exists (
      select 1 from public.workspace_subscription_owners owner
      where owner.workspace_id = pw.workspace_id and owner.owner_user_id = pw.profile_id
    )
    and coalesce(p.is_active, true)
    and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
    and (
      coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0
      or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
    );

  if v_online_count = 0 then
    return jsonb_build_object(
      'assigned_count', 0,
      'online_agent_count', 0,
      'reason', 'NO_ONLINE_AGENTS'
    );
  end if;

  with online_agents as (
    select
      pw.profile_id,
      row_number() over (order by pw.profile_id) as agent_position
    from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    join public.agent_presence ap
      on ap.workspace_id = pw.workspace_id
     and ap.profile_id = pw.profile_id
     and ap.status = 'online'
     and ap.last_heartbeat >= now() - interval '2 minutes'
    where pw.workspace_id = p_workspace_id
      and pw.status = 'active'
      and not coalesce(pw.is_owner, false)
      and not exists (
        select 1 from public.workspace_subscription_owners owner
        where owner.workspace_id = pw.workspace_id and owner.owner_user_id = pw.profile_id
      )
      and coalesce(p.is_active, true)
      and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
      and (
        coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0
        or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
      )
  ),
  locked_orders as (
    select o."Order ID" as order_id, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and lower(trim(coalesce(o.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number'
      )
      and (p_order_ids is null or o."Order ID" = any(p_order_ids))
      and not exists (
        select 1
        from public.order_confirmation_recipients recipient
        where recipient.workspace_id = o.workspace_id
          and recipient.order_id = o."Order ID"
          and recipient.released_at is null
      )
      and (
        p_order_ids is not null
        or p_include_manual
        or o.assigned_to is null
        or coalesce((
          select latest.notes
          from public.order_assignments latest
          where latest.workspace_id = o.workspace_id
            and latest.order_id = o."Order ID"
          order by latest.assigned_at desc nulls last, latest.id desc
          limit 1
        ), '') in ('online_auto', 'bulk_auto')
      )
    order by o.created_at asc, o."Order ID"
    for update of o skip locked
  ),
  numbered_orders as (
    select
      locked_orders.order_id,
      row_number() over (order by locked_orders.created_at asc, locked_orders.order_id) as order_position
    from locked_orders
  ),
  plan as (
    select numbered_orders.order_id, online_agents.profile_id as target_agent_id
    from numbered_orders
    join online_agents
      on online_agents.agent_position = mod(numbered_orders.order_position - 1, v_online_count) + 1
  ),
  inserted as (
    insert into public.order_assignments (
      workspace_id,
      order_id,
      assigned_to,
      assigned_by,
      result,
      notes
    )
    select
      p_workspace_id,
      plan.order_id,
      plan.target_agent_id,
      coalesce(p_actor_id, plan.target_agent_id),
      'pending',
      case when p_order_ids is null then 'online_auto' else 'bulk_auto' end
    from plan
    join public.orders o
      on o.workspace_id = p_workspace_id
     and o."Order ID" = plan.order_id
    where o.assigned_to is distinct from plan.target_agent_id
    returning assigned_to
  )
  select count(*) into v_changed_count from inserted;

  return jsonb_build_object(
    'assigned_count', v_changed_count,
    'online_agent_count', v_online_count,
    'share_percent', round(100.0 / v_online_count, 2)
  );
end;
$$;

-- Owner/manager endpoint for an explicit all-queue balance or selected-order
-- split. Passing selected IDs never creates orders or expands workspace scope.
create or replace function public.distribute_online_confirmation_orders_v2(
  p_workspace_id uuid,
  p_order_ids uuid[] default null,
  p_rebalance_all boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 1000 then raise exception 'ORDER_LIMIT_EXCEEDED'; end if;

  select assignment_mode into v_mode
  from public.workspace_confirmation_assignment_settings
  where workspace_id = p_workspace_id;
  if coalesce(v_mode, 'shared') <> 'shared' then
    raise exception 'ONLINE_DISTRIBUTION_REQUIRES_SHARED_MODE';
  end if;

  return public.distribute_online_confirmation_orders_internal_v2(
    p_workspace_id,
    p_order_ids,
    p_rebalance_all,
    (select auth.uid())
  );
end;
$$;

-- Keep the established manual RPC, but enforce the same recipient contract:
-- an owner can manage assignments but can never be an assignment target.
create or replace function public.assign_team_orders_v1(
  p_workspace_id uuid,
  p_order_ids uuid[],
  p_assigned_to uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assigned_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then raise exception 'ORDER_REQUIRED'; end if;
  if array_length(p_order_ids, 1) > 1000 then raise exception 'ORDER_LIMIT_EXCEEDED'; end if;

  if not exists (
    select 1
    from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id
      and pw.profile_id = p_assigned_to
      and pw.status = 'active'
      and not coalesce(pw.is_owner, false)
      and not exists (
        select 1 from public.workspace_subscription_owners owner
        where owner.workspace_id = pw.workspace_id and owner.owner_user_id = pw.profile_id
      )
      and coalesce(p.is_active, true)
      and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
      and (
        coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0
        or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
      )
  ) then raise exception 'ACTIVE_NON_OWNER_CONFIRMATION_AGENT_REQUIRED'; end if;

  with locked_orders as (
    select o."Order ID" as order_id
    from public.orders o
    where o.workspace_id = p_workspace_id
      and o."Order ID" = any(p_order_ids)
      and lower(trim(coalesce(o.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number'
      )
      and not exists (
        select 1
        from public.order_confirmation_recipients recipient
        where recipient.workspace_id = o.workspace_id
          and recipient.order_id = o."Order ID"
          and recipient.released_at is null
      )
    order by o.created_at asc, o."Order ID"
    for update of o skip locked
  ),
  inserted as (
    insert into public.order_assignments (
      workspace_id, order_id, assigned_to, assigned_by, result, notes
    )
    select
      p_workspace_id, locked_orders.order_id, p_assigned_to,
      (select auth.uid()), 'pending', 'manual'
    from locked_orders
    join public.orders o
      on o.workspace_id = p_workspace_id
     and o."Order ID" = locked_orders.order_id
    where o.assigned_to is distinct from p_assigned_to
    returning id
  )
  select count(*) into v_assigned_count from inserted;

  return jsonb_build_object(
    'assigned_count', v_assigned_count,
    'assigned_to', p_assigned_to
  );
end;
$$;

-- Backward-compatible entry point for older clients. The old limit argument is
-- retained in the signature, but online equal distribution intentionally has
-- no per-agent cap because every pending order must have an online recipient.
create or replace function public.auto_assign_confirmation_orders_v1(
  p_workspace_id uuid,
  p_per_agent_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  return public.distribute_online_confirmation_orders_internal_v2(
    p_workspace_id, null, true, (select auth.uid())
  );
end;
$$;

-- New orders are assigned to the least-loaded online non-owner agent. This is
-- O(number of online agents), so large imports do not repeatedly rebalance the
-- full queue row by row.
create or replace function public.assign_new_confirmation_order_online_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_agent_id uuid;
begin
  if new.assigned_to is not null then return new; end if;
  if lower(trim(coalesce(new.status, 'pending'))) not in (
    'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number'
  ) then return new; end if;

  select assignment_mode into v_mode
  from public.workspace_confirmation_assignment_settings
  where workspace_id = new.workspace_id;
  if coalesce(v_mode, 'shared') <> 'shared' then return new; end if;

  perform pg_advisory_xact_lock(hashtext('online-confirmation:' || new.workspace_id::text));

  select pw.profile_id into v_agent_id
  from public.profile_workspaces pw
  join public.profiles p on p.id = pw.profile_id
  join public.agent_presence ap
    on ap.workspace_id = pw.workspace_id
   and ap.profile_id = pw.profile_id
   and ap.status = 'online'
   and ap.last_heartbeat >= now() - interval '2 minutes'
  where pw.workspace_id = new.workspace_id
    and pw.status = 'active'
    and not coalesce(pw.is_owner, false)
    and not exists (
      select 1 from public.workspace_subscription_owners owner
      where owner.workspace_id = pw.workspace_id and owner.owner_user_id = pw.profile_id
    )
    and coalesce(p.is_active, true)
    and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
    and (
      coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0
      or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
    )
  order by (
    select count(*)
    from public.orders workload
    where workload.workspace_id = new.workspace_id
      and workload.assigned_to = pw.profile_id
      and lower(trim(coalesce(workload.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number'
      )
  ), pw.profile_id
  limit 1;

  if v_agent_id is null then return new; end if;

  insert into public.order_assignments (
    workspace_id, order_id, assigned_to, assigned_by, result, notes
  ) values (
    new.workspace_id, new."Order ID", v_agent_id, v_agent_id, 'pending', 'online_auto'
  );
  return new;
end;
$$;

drop trigger if exists trg_orders_online_confirmation_assignment on public.orders;
create trigger trg_orders_online_confirmation_assignment
after insert on public.orders
for each row execute function public.assign_new_confirmation_order_online_v2();

-- A join/leave/idle transition changes the equal share. Heartbeats also let an
-- active agent clean up assignments left on a now-stale peer. The distribution
-- function is deterministic, so ordinary heartbeats are no-ops after balance.
create or replace function public.rebalance_confirmation_on_presence_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_should_rebalance boolean := new.status = 'online';
begin
  if tg_op = 'UPDATE' then
    v_should_rebalance := v_should_rebalance or old.status = 'online';
  end if;
  if v_should_rebalance then
    perform public.distribute_online_confirmation_orders_internal_v2(
      new.workspace_id, null, false, null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agent_presence_confirmation_distribution on public.agent_presence;
create trigger trg_agent_presence_confirmation_distribution
after insert or update of status, last_heartbeat on public.agent_presence
for each row execute function public.rebalance_confirmation_on_presence_v2();

-- The legacy refill can assign to merely active/offline agents and conflicts
-- with the online-only equal-share contract.
drop trigger if exists trg_orders_refill_confirmation_queue on public.orders;

revoke all on function public.distribute_online_confirmation_orders_internal_v2(uuid, uuid[], boolean, uuid) from public, anon, authenticated;
revoke all on function public.distribute_online_confirmation_orders_v2(uuid, uuid[], boolean) from public, anon;
revoke all on function public.assign_new_confirmation_order_online_v2() from public, anon, authenticated;
revoke all on function public.rebalance_confirmation_on_presence_v2() from public, anon, authenticated;
revoke all on function public.assign_team_orders_v1(uuid, uuid[], uuid) from public, anon;
revoke all on function public.auto_assign_confirmation_orders_v1(uuid, integer) from public, anon;

grant execute on function public.distribute_online_confirmation_orders_v2(uuid, uuid[], boolean) to authenticated;
grant execute on function public.assign_team_orders_v1(uuid, uuid[], uuid) to authenticated;
grant execute on function public.auto_assign_confirmation_orders_v1(uuid, integer) to authenticated;
