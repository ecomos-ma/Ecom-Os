-- Ecom OS: seller-selectable confirmation distribution and active-work leases.
--
-- This migration is additive and data preserving:
--   * assignment_mode keeps its existing shared/separated recipient meaning;
--   * distribution_mode controls Manual / Equal / Smart human assignment;
--   * existing assignment history is never deleted or rewritten;
--   * smart transfers are limited to untouched, auto-managed, callback-free,
--     unlocked orders;
--   * every lease and transfer remains auditable.

begin;

alter table public.workspace_confirmation_assignment_settings
  add column if not exists distribution_mode text not null default 'automatic_equal'
    check (distribution_mode in ('manual', 'automatic_equal', 'automatic_smart')),
  add column if not exists smart_batch_size integer not null default 3
    check (smart_batch_size between 1 and 50),
  add column if not exists offline_grace_seconds integer not null default 180
    check (offline_grace_seconds between 60 and 3600),
  add column if not exists work_lease_seconds integer not null default 180
    check (work_lease_seconds between 60 and 900);

create table if not exists public.confirmation_work_leases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  lease_token uuid not null default gen_random_uuid(),
  work_state text not null default 'open'
    check (work_state in ('open', 'call_active', 'callback_reserved')),
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  takeover_reason text,
  acquired_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lease_token)
);

create unique index if not exists confirmation_work_leases_one_current_order_idx
  on public.confirmation_work_leases (workspace_id, order_id)
  where released_at is null;
create index if not exists confirmation_work_leases_agent_current_idx
  on public.confirmation_work_leases (workspace_id, agent_id, expires_at desc)
  where released_at is null;

create table if not exists public.confirmation_work_lease_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  lease_id uuid references public.confirmation_work_leases(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'LEASE_ACQUIRED', 'LEASE_RENEWED', 'LEASE_RELEASED',
    'LEASE_EXPIRED', 'LEASE_TAKEN_OVER', 'ORDER_SAVED', 'NEXT_ORDER_CLAIMED'
  )),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists confirmation_work_lease_events_order_idx
  on public.confirmation_work_lease_events (workspace_id, order_id, created_at desc);
create index if not exists confirmation_work_lease_events_actor_idx
  on public.confirmation_work_lease_events (workspace_id, actor_id, created_at desc);

alter table public.confirmation_work_leases enable row level security;
alter table public.confirmation_work_lease_events enable row level security;

drop policy if exists confirmation_work_leases_scoped_read on public.confirmation_work_leases;
create policy confirmation_work_leases_scoped_read
  on public.confirmation_work_leases
  for select to authenticated
  using (
    agent_id = (select auth.uid())
    or (select public.can_manage_workspace_team(workspace_id))
  );

drop policy if exists confirmation_work_lease_events_scoped_read on public.confirmation_work_lease_events;
create policy confirmation_work_lease_events_scoped_read
  on public.confirmation_work_lease_events
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    or exists (
      select 1
      from public.orders scoped_order
      where scoped_order.workspace_id = confirmation_work_lease_events.workspace_id
        and scoped_order."Order ID" = confirmation_work_lease_events.order_id
        and scoped_order.assigned_to = (select auth.uid())
    )
    or (select public.can_manage_workspace_team(workspace_id))
  );

revoke all on table public.confirmation_work_leases, public.confirmation_work_lease_events from public, anon;
revoke insert, update, delete on table public.confirmation_work_leases, public.confirmation_work_lease_events from authenticated;
grant select on table public.confirmation_work_leases, public.confirmation_work_lease_events to authenticated;
grant all on table public.confirmation_work_leases, public.confirmation_work_lease_events to service_role;

-- Eligibility is evaluated at the database boundary and uses the workspace-
-- scoped permission introduced by the preceding migration. Owners are never
-- automatic human-assignment targets.
create or replace function public.confirmation_agent_is_eligible_v1(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_require_online boolean default false,
  p_grace_seconds integer default 120
)
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
    where membership.workspace_id = p_workspace_id
      and membership.profile_id = p_agent_id
      and membership.status = 'active'
      and not coalesce(membership.is_owner, false)
      and not exists (
        select 1
        from public.workspace_subscription_owners owner_row
        where owner_row.workspace_id = membership.workspace_id
          and owner_row.owner_user_id = membership.profile_id
      )
      and coalesce(profile.is_active, true)
      and lower(coalesce(membership.role, profile.role, 'agent')) in ('agent', 'supervisor')
      and (
        coalesce(cardinality(coalesce(membership.allowed_sections, profile.allowed_sections)), 0) = 0
        or 'Confirmation' = any(coalesce(membership.allowed_sections, profile.allowed_sections, array[]::text[]))
      )
      and (
        not p_require_online
        or exists (
          select 1
          from public.agent_presence presence
          where presence.workspace_id = p_workspace_id
            and presence.profile_id = p_agent_id
            and presence.status = 'online'
            and presence.last_heartbeat >= now() - make_interval(secs => greatest(60, least(p_grace_seconds, 3600)))
        )
      )
  );
$$;

create or replace function public.set_confirmation_distribution_settings_v1(
  p_workspace_id uuid,
  p_distribution_mode text,
  p_smart_batch_size integer default 3,
  p_offline_grace_seconds integer default 180,
  p_work_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then
    raise exception using errcode = '42501', message = 'TEAM_ASSIGNMENT_FORBIDDEN';
  end if;
  if p_distribution_mode not in ('manual', 'automatic_equal', 'automatic_smart') then
    raise exception using errcode = '22023', message = 'INVALID_DISTRIBUTION_MODE';
  end if;
  if p_smart_batch_size not between 1 and 50 then
    raise exception using errcode = '22023', message = 'INVALID_SMART_BATCH_SIZE';
  end if;
  if p_offline_grace_seconds not between 60 and 3600 then
    raise exception using errcode = '22023', message = 'INVALID_OFFLINE_GRACE';
  end if;
  if p_work_lease_seconds not between 60 and 900 then
    raise exception using errcode = '22023', message = 'INVALID_WORK_LEASE';
  end if;

  insert into public.workspace_confirmation_assignment_settings (
    workspace_id, distribution_mode, smart_batch_size,
    offline_grace_seconds, work_lease_seconds, updated_by, updated_at
  ) values (
    p_workspace_id, p_distribution_mode, p_smart_batch_size,
    p_offline_grace_seconds, p_work_lease_seconds, v_actor_id, now()
  )
  on conflict (workspace_id) do update
  set distribution_mode = excluded.distribution_mode,
      smart_batch_size = excluded.smart_batch_size,
      offline_grace_seconds = excluded.offline_grace_seconds,
      work_lease_seconds = excluded.work_lease_seconds,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, details)
  values (
    p_workspace_id, v_actor_id, 'confirmation_distribution_settings_changed',
    'confirmation_assignment',
    jsonb_build_object(
      'distribution_mode', p_distribution_mode,
      'smart_batch_size', p_smart_batch_size,
      'offline_grace_seconds', p_offline_grace_seconds,
      'work_lease_seconds', p_work_lease_seconds
    )
  );

  return jsonb_build_object(
    'distribution_mode', p_distribution_mode,
    'smart_batch_size', p_smart_batch_size,
    'offline_grace_seconds', p_offline_grace_seconds,
    'work_lease_seconds', p_work_lease_seconds
  );
end;
$$;

-- Equal distribution plans only unassigned or previously auto-managed work.
-- Manual assignments, callbacks, exclusive recipients and active work leases
-- are never moved by this engine.
create or replace function public.distribute_equal_confirmation_orders_internal_v3(
  p_workspace_id uuid,
  p_order_ids uuid[] default null,
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
  v_grace integer := 180;
begin
  perform pg_advisory_xact_lock(hashtextextended('confirmation-distribution:' || p_workspace_id::text, 0));

  select coalesce(settings.offline_grace_seconds, 180)
    into v_grace
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = p_workspace_id;

  select count(*) into v_online_count
  from public.profile_workspaces membership
  where membership.workspace_id = p_workspace_id
    and public.confirmation_agent_is_eligible_v1(p_workspace_id, membership.profile_id, true, v_grace);

  if v_online_count = 0 then
    return jsonb_build_object('assigned_count', 0, 'online_agent_count', 0, 'reason', 'NO_ONLINE_AGENTS');
  end if;

  with online_agents as (
    select membership.profile_id,
      row_number() over (order by membership.profile_id) as agent_position
    from public.profile_workspaces membership
    where membership.workspace_id = p_workspace_id
      and public.confirmation_agent_is_eligible_v1(p_workspace_id, membership.profile_id, true, v_grace)
  ),
  candidates as (
    select order_row."Order ID" as order_id, order_row.created_at
    from public.orders order_row
    left join lateral (
      select assignment.notes, assignment.assigned_to
      from public.order_assignments assignment
      where assignment.workspace_id = order_row.workspace_id
        and assignment.order_id = order_row."Order ID"
      order by assignment.assigned_at desc nulls last, assignment.created_at desc, assignment.id desc
      limit 1
    ) latest on true
    where order_row.workspace_id = p_workspace_id
      and lower(trim(coalesce(order_row.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      )
      and (p_order_ids is null or order_row."Order ID" = any(p_order_ids))
      and (order_row.assigned_to is null or coalesce(latest.notes, '') in ('online_auto', 'bulk_auto', 'equal_auto'))
      and not exists (
        select 1 from public.order_confirmation_recipients recipient
        where recipient.workspace_id = order_row.workspace_id
          and recipient.order_id = order_row."Order ID" and recipient.released_at is null
      )
      and not exists (
        select 1 from public.confirmation_callbacks callback
        where callback.workspace_id = order_row.workspace_id
          and callback.order_id = order_row."Order ID" and callback.status = 'scheduled'
      )
      and not exists (
        select 1 from public.confirmation_work_leases lease
        where lease.workspace_id = order_row.workspace_id
          and lease.order_id = order_row."Order ID"
          and lease.released_at is null and lease.expires_at > now()
      )
    order by order_row.created_at asc, order_row."Order ID"
    for update of order_row skip locked
  ),
  numbered as (
    select candidates.order_id,
      row_number() over (order by candidates.created_at asc, candidates.order_id) as order_position
    from candidates
  ),
  assignment_plan as (
    select numbered.order_id, online_agents.profile_id as target_agent_id
    from numbered
    join online_agents
      on online_agents.agent_position = mod(numbered.order_position - 1, v_online_count) + 1
  ),
  inserted as (
    insert into public.order_assignments (
      workspace_id, order_id, assigned_to, assigned_by, result, notes
    )
    select p_workspace_id, assignment_plan.order_id, assignment_plan.target_agent_id,
      coalesce(p_actor_id, assignment_plan.target_agent_id), 'pending', 'equal_auto'
    from assignment_plan
    join public.orders order_row
      on order_row.workspace_id = p_workspace_id
      and order_row."Order ID" = assignment_plan.order_id
    where order_row.assigned_to is distinct from assignment_plan.target_agent_id
    returning id
  )
  select count(*) into v_changed_count from inserted;

  return jsonb_build_object(
    'assigned_count', v_changed_count,
    'online_agent_count', v_online_count,
    'share_percent', round(100.0 / v_online_count, 2),
    'distribution_mode', 'automatic_equal'
  );
end;
$$;

-- Initial Smart assignment fills each online eligible agent only to the strict
-- configured batch size. It does not steal from another live queue here;
-- transfers happen only when a real terminal outcome triggers a refill.
create or replace function public.fill_smart_confirmation_batches_internal_v1(
  p_workspace_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := 3;
  v_grace_seconds integer := 180;
  v_agent record;
  v_order_id uuid;
  v_active_count integer;
  v_assigned_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('confirmation-distribution:' || p_workspace_id::text, 0));

  select coalesce(settings.smart_batch_size, 3),
         coalesce(settings.offline_grace_seconds, 180)
    into v_batch_size, v_grace_seconds
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = p_workspace_id;
  v_batch_size := coalesce(v_batch_size, 3);
  v_grace_seconds := coalesce(v_grace_seconds, 180);

  for v_agent in
    select membership.profile_id
    from public.profile_workspaces membership
    where membership.workspace_id = p_workspace_id
      and public.confirmation_agent_is_eligible_v1(
        p_workspace_id, membership.profile_id, true, v_grace_seconds
      )
    order by (
      select count(*)
      from public.orders workload
      where workload.workspace_id = p_workspace_id
        and workload.assigned_to = membership.profile_id
        and lower(trim(coalesce(workload.status, 'pending'))) in (
          'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
        )
    ), membership.profile_id
  loop
    select count(*) into v_active_count
    from public.orders workload
    where workload.workspace_id = p_workspace_id
      and workload.assigned_to = v_agent.profile_id
      and lower(trim(coalesce(workload.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      );

    while v_active_count < v_batch_size loop
      select order_row."Order ID" into v_order_id
      from public.orders order_row
      where order_row.workspace_id = p_workspace_id
        and order_row.assigned_to is null
        and lower(trim(coalesce(order_row.status, 'pending'))) in (
          'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
        )
        and not exists (
          select 1 from public.order_confirmation_recipients recipient
          where recipient.workspace_id = order_row.workspace_id
            and recipient.order_id = order_row."Order ID" and recipient.released_at is null
        )
        and not exists (
          select 1 from public.confirmation_callbacks callback
          where callback.workspace_id = order_row.workspace_id
            and callback.order_id = order_row."Order ID" and callback.status = 'scheduled'
        )
      order by order_row.created_at asc, order_row."Order ID"
      limit 1
      for update of order_row skip locked;

      exit when v_order_id is null;
      insert into public.order_assignments (
        workspace_id, order_id, assigned_to, assigned_by, result, notes
      ) values (
        p_workspace_id, v_order_id, v_agent.profile_id,
        coalesce(p_actor_id, v_agent.profile_id), 'pending', 'smart_auto'
      );
      v_active_count := v_active_count + 1;
      v_assigned_count := v_assigned_count + 1;
      v_order_id := null;
    end loop;
  end loop;

  return jsonb_build_object(
    'assigned_count', v_assigned_count,
    'smart_batch_size', v_batch_size,
    'distribution_mode', 'automatic_smart'
  );
end;
$$;

create or replace function public.run_confirmation_distribution_v1(
  p_workspace_id uuid,
  p_order_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_mode text;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then
    raise exception using errcode = '42501', message = 'TEAM_ASSIGNMENT_FORBIDDEN';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 1000 then
    raise exception using errcode = '22023', message = 'ORDER_LIMIT_EXCEEDED';
  end if;

  select coalesce(settings.distribution_mode, 'automatic_equal')
    into v_mode
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = p_workspace_id;
  v_mode := coalesce(v_mode, 'automatic_equal');

  if v_mode = 'manual' then
    return jsonb_build_object('assigned_count', 0, 'distribution_mode', v_mode, 'reason', 'MANUAL_MODE');
  elsif v_mode = 'automatic_smart' then
    if p_order_ids is not null then
      raise exception using errcode = '22023', message = 'SMART_MODE_DOES_NOT_REBALANCE_SELECTED_ORDERS';
    end if;
    return public.fill_smart_confirmation_batches_internal_v1(p_workspace_id, v_actor_id);
  end if;

  return public.distribute_equal_confirmation_orders_internal_v3(p_workspace_id, p_order_ids, v_actor_id);
end;
$$;

-- New imports respect the configured strategy. Manual mode performs no hidden
-- assignment; Equal uses least workload; Smart never exceeds the batch size.
create or replace function public.assign_new_confirmation_order_online_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ownership_mode text := 'shared';
  v_distribution_mode text := 'automatic_equal';
  v_batch_size integer := 3;
  v_grace_seconds integer := 180;
  v_agent_id uuid;
begin
  if new.assigned_to is not null then return new; end if;
  if lower(trim(coalesce(new.status, 'pending'))) not in (
    'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
  ) then return new; end if;

  select coalesce(settings.assignment_mode, 'shared'),
         coalesce(settings.distribution_mode, 'automatic_equal'),
         coalesce(settings.smart_batch_size, 3),
         coalesce(settings.offline_grace_seconds, 180)
    into v_ownership_mode, v_distribution_mode, v_batch_size, v_grace_seconds
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = new.workspace_id;
  v_ownership_mode := coalesce(v_ownership_mode, 'shared');
  v_distribution_mode := coalesce(v_distribution_mode, 'automatic_equal');
  v_batch_size := coalesce(v_batch_size, 3);
  v_grace_seconds := coalesce(v_grace_seconds, 180);
  if v_ownership_mode <> 'shared' or v_distribution_mode = 'manual' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('confirmation-distribution:' || new.workspace_id::text, 0));

  select membership.profile_id into v_agent_id
  from public.profile_workspaces membership
  where membership.workspace_id = new.workspace_id
    and public.confirmation_agent_is_eligible_v1(
      new.workspace_id, membership.profile_id, true, v_grace_seconds
    )
    and (
      v_distribution_mode <> 'automatic_smart'
      or (
        select count(*)
        from public.orders workload
        where workload.workspace_id = new.workspace_id
          and workload.assigned_to = membership.profile_id
          and lower(trim(coalesce(workload.status, 'pending'))) in (
            'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
          )
      ) < v_batch_size
    )
  order by (
    select count(*)
    from public.orders workload
    where workload.workspace_id = new.workspace_id
      and workload.assigned_to = membership.profile_id
      and lower(trim(coalesce(workload.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      )
  ), membership.profile_id
  limit 1;

  if v_agent_id is null then return new; end if;
  insert into public.order_assignments (
    workspace_id, order_id, assigned_to, assigned_by, result, notes
  ) values (
    new.workspace_id, new."Order ID", v_agent_id, v_agent_id, 'pending',
    case when v_distribution_mode = 'automatic_smart' then 'smart_auto' else 'equal_auto' end
  );
  return new;
end;
$$;

-- A genuine terminal outcome refills only the completing Smart agent. If no
-- unassigned work exists, it may transfer one untouched auto-managed order
-- from the largest slower queue. Active/manual/callback work is excluded.
create or replace function public.refill_smart_confirmation_queue_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ownership_mode text;
  v_distribution_mode text;
  v_batch_size integer;
  v_grace_seconds integer;
  v_latest_source text;
  v_active_count integer;
  v_order_id uuid;
begin
  if new.assigned_to is null then return new; end if;
  if lower(trim(coalesce(old.status, 'pending'))) in (
    'confirmed', 'cancelled', 'refused', 'blacklisted', 'duplicate', 'out_of_stock', 'shipped', 'delivered', 'returned'
  ) then return new; end if;
  if lower(trim(coalesce(new.status, 'pending'))) not in (
    'confirmed', 'cancelled', 'refused', 'blacklisted', 'duplicate', 'out_of_stock'
  ) then return new; end if;

  select coalesce(settings.assignment_mode, 'shared'),
         coalesce(settings.distribution_mode, 'automatic_equal'),
         coalesce(settings.smart_batch_size, 3),
         coalesce(settings.offline_grace_seconds, 180)
    into v_ownership_mode, v_distribution_mode, v_batch_size, v_grace_seconds
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = new.workspace_id;
  if not found or v_ownership_mode <> 'shared' or v_distribution_mode <> 'automatic_smart' then
    return new;
  end if;

  select assignment.notes into v_latest_source
  from public.order_assignments assignment
  where assignment.workspace_id = new.workspace_id and assignment.order_id = new."Order ID"
  order by assignment.assigned_at desc nulls last, assignment.created_at desc, assignment.id desc
  limit 1;
  if coalesce(v_latest_source, '') not in ('smart_auto', 'smart_refill') then return new; end if;
  if not public.confirmation_agent_is_eligible_v1(
    new.workspace_id, new.assigned_to, true, v_grace_seconds
  ) then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'confirmation-smart-refill:' || new.workspace_id::text || ':' || new.assigned_to::text, 0
  ));

  select count(*) into v_active_count
  from public.orders workload
  where workload.workspace_id = new.workspace_id
    and workload.assigned_to = new.assigned_to
    and lower(trim(coalesce(workload.status, 'pending'))) in (
      'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
    );

  while v_active_count < v_batch_size loop
    v_order_id := null;
    select order_row."Order ID" into v_order_id
    from public.orders order_row
    where order_row.workspace_id = new.workspace_id
      and order_row.assigned_to is null
      and lower(trim(coalesce(order_row.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      )
      and not exists (
        select 1 from public.confirmation_callbacks callback
        where callback.workspace_id = order_row.workspace_id
          and callback.order_id = order_row."Order ID" and callback.status = 'scheduled'
      )
    order by order_row.created_at asc, order_row."Order ID"
    limit 1
    for update of order_row skip locked;

    if v_order_id is null then
      select donor."Order ID" into v_order_id
      from public.orders donor
      join lateral (
        select assignment.notes, assignment.assigned_to
        from public.order_assignments assignment
        where assignment.workspace_id = donor.workspace_id
          and assignment.order_id = donor."Order ID"
        order by assignment.assigned_at desc nulls last, assignment.created_at desc, assignment.id desc
        limit 1
      ) latest on true
      where donor.workspace_id = new.workspace_id
        and donor.assigned_to is not null
        and donor.assigned_to <> new.assigned_to
        and latest.assigned_to = donor.assigned_to
        and latest.notes in ('smart_auto', 'smart_refill')
        and lower(trim(coalesce(donor.status, 'pending'))) in (
          'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
        )
        and not exists (
          select 1 from public.confirmation_activities activity
          where activity.workspace_id = donor.workspace_id and activity.order_id = donor."Order ID"
        )
        and not exists (
          select 1 from public.confirmation_callbacks callback
          where callback.workspace_id = donor.workspace_id
            and callback.order_id = donor."Order ID" and callback.status = 'scheduled'
        )
        and not exists (
          select 1 from public.confirmation_work_leases lease
          where lease.workspace_id = donor.workspace_id
            and lease.order_id = donor."Order ID"
            and lease.released_at is null and lease.expires_at > now()
        )
        and (
          select count(*)
          from public.orders donor_workload
          where donor_workload.workspace_id = new.workspace_id
            and donor_workload.assigned_to = donor.assigned_to
            and lower(trim(coalesce(donor_workload.status, 'pending'))) in (
              'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
            )
        ) > v_active_count
      order by (
        select count(*)
        from public.orders donor_workload
        where donor_workload.workspace_id = new.workspace_id
          and donor_workload.assigned_to = donor.assigned_to
          and lower(trim(coalesce(donor_workload.status, 'pending'))) in (
            'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
          )
      ) desc, donor.created_at desc, donor."Order ID"
      limit 1
      for update of donor skip locked;
    end if;

    exit when v_order_id is null;
    insert into public.order_assignments (
      workspace_id, order_id, assigned_to, assigned_by, result, notes
    ) values (
      new.workspace_id, v_order_id, new.assigned_to, new.assigned_to, 'pending', 'smart_refill'
    );
    v_active_count := v_active_count + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_orders_refill_confirmation_queue on public.orders;
create trigger trg_orders_refill_confirmation_queue
after update of status on public.orders
for each row execute function public.refill_smart_confirmation_queue_v1();

-- Presence changes run the configured strategy. Manual mode is always a no-op.
create or replace function public.rebalance_confirmation_on_presence_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ownership_mode text;
  v_distribution_mode text;
begin
  select coalesce(settings.assignment_mode, 'shared'),
         coalesce(settings.distribution_mode, 'automatic_equal')
    into v_ownership_mode, v_distribution_mode
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = new.workspace_id;

  if coalesce(v_ownership_mode, 'shared') <> 'shared'
     or coalesce(v_distribution_mode, 'automatic_equal') = 'manual' then
    return new;
  end if;

  if v_distribution_mode = 'automatic_smart' then
    perform public.fill_smart_confirmation_batches_internal_v1(new.workspace_id, null);
  else
    perform public.distribute_equal_confirmation_orders_internal_v3(new.workspace_id, null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agent_presence_confirmation_distribution on public.agent_presence;
create trigger trg_agent_presence_confirmation_distribution
after insert or update of status, last_heartbeat on public.agent_presence
for each row execute function public.rebalance_confirmation_on_presence_v2();

-- Server-authoritative work lease acquisition. Advisory locking serializes
-- expired-lease cleanup and takeover against another browser/tab.
create or replace function public.acquire_confirmation_work_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_work_state text default 'open',
  p_takeover_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_is_manager boolean;
  v_order public.orders%rowtype;
  v_existing public.confirmation_work_leases%rowtype;
  v_lease public.confirmation_work_leases%rowtype;
  v_lease_seconds integer := 180;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_work_state not in ('open', 'call_active', 'callback_reserved') then
    raise exception using errcode = '22023', message = 'INVALID_WORK_STATE';
  end if;

  v_is_manager := public.can_manage_workspace_team(p_workspace_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'confirmation-work:' || p_workspace_id::text || ':' || p_order_id::text, 0
  ));

  select order_row.* into v_order
  from public.orders order_row
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;

  if not v_is_manager and (
    v_order.assigned_to is distinct from v_actor_id
    or not public.confirmation_agent_is_eligible_v1(p_workspace_id, v_actor_id, false, 120)
  ) then
    raise exception using errcode = '42501', message = 'ORDER_NOT_ASSIGNED_TO_AGENT';
  end if;

  select coalesce(settings.work_lease_seconds, 180) into v_lease_seconds
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = p_workspace_id;
  v_lease_seconds := coalesce(v_lease_seconds, 180);

  update public.confirmation_work_leases lease
  set released_at = now(), release_reason = 'expired', updated_at = now()
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.released_at is null and lease.expires_at <= now()
  returning lease.* into v_existing;
  if found then
    insert into public.confirmation_work_lease_events (
      workspace_id, order_id, lease_id, actor_id, event_type, reason
    ) values (p_workspace_id, p_order_id, v_existing.id, v_actor_id, 'LEASE_EXPIRED', 'timeout');
  end if;

  select lease.* into v_existing
  from public.confirmation_work_leases lease
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.released_at is null
  for update;

  if found and v_existing.agent_id = v_actor_id then
    update public.confirmation_work_leases lease
    set heartbeat_at = now(), expires_at = now() + make_interval(secs => v_lease_seconds),
        work_state = p_work_state, updated_at = now()
    where lease.id = v_existing.id
    returning lease.* into v_lease;
    return jsonb_build_object(
      'mode', 'server', 'lease_id', v_lease.id, 'lease_token', v_lease.lease_token,
      'order_id', v_lease.order_id, 'agent_id', v_lease.agent_id,
      'work_state', v_lease.work_state, 'expires_at', v_lease.expires_at,
      'order_updated_at', v_order.updated_at
    );
  elsif found then
    if not v_is_manager or char_length(btrim(coalesce(p_takeover_reason, ''))) < 4 then
      raise exception using errcode = '55P03', message = 'ORDER_LOCKED_BY_ANOTHER_AGENT';
    end if;
    update public.confirmation_work_leases lease
    set released_at = now(), release_reason = 'supervisor_takeover',
        takeover_reason = left(btrim(p_takeover_reason), 500), updated_at = now()
    where lease.id = v_existing.id;
    insert into public.confirmation_work_lease_events (
      workspace_id, order_id, lease_id, actor_id, event_type, reason,
      metadata
    ) values (
      p_workspace_id, p_order_id, v_existing.id, v_actor_id, 'LEASE_TAKEN_OVER',
      left(btrim(p_takeover_reason), 500), jsonb_build_object('previous_agent_id', v_existing.agent_id)
    );
  end if;

  insert into public.confirmation_work_leases (
    workspace_id, order_id, agent_id, work_state, expires_at, acquired_by
  ) values (
    p_workspace_id, p_order_id, v_actor_id, p_work_state,
    now() + make_interval(secs => v_lease_seconds), v_actor_id
  ) returning * into v_lease;

  insert into public.confirmation_work_lease_events (
    workspace_id, order_id, lease_id, actor_id, event_type, metadata
  ) values (
    p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'LEASE_ACQUIRED',
    jsonb_build_object('work_state', p_work_state)
  );

  return jsonb_build_object(
    'mode', 'server', 'lease_id', v_lease.id, 'lease_token', v_lease.lease_token,
    'order_id', v_lease.order_id, 'agent_id', v_lease.agent_id,
    'work_state', v_lease.work_state, 'expires_at', v_lease.expires_at,
    'order_updated_at', v_order.updated_at
  );
end;
$$;

create or replace function public.renew_confirmation_work_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_lease_token uuid,
  p_work_state text default 'open'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_lease public.confirmation_work_leases%rowtype;
  v_lease_seconds integer := 180;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_work_state not in ('open', 'call_active', 'callback_reserved') then
    raise exception using errcode = '22023', message = 'INVALID_WORK_STATE';
  end if;
  select coalesce(settings.work_lease_seconds, 180) into v_lease_seconds
  from public.workspace_confirmation_assignment_settings settings
  where settings.workspace_id = p_workspace_id;
  v_lease_seconds := coalesce(v_lease_seconds, 180);

  update public.confirmation_work_leases lease
  set heartbeat_at = now(), expires_at = now() + make_interval(secs => v_lease_seconds),
      work_state = p_work_state, updated_at = now()
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.lease_token = p_lease_token and lease.agent_id = v_actor_id
    and lease.released_at is null and lease.expires_at > now()
  returning lease.* into v_lease;
  if not found then raise exception using errcode = '55P03', message = 'WORK_LEASE_EXPIRED'; end if;

  -- Heartbeats are deliberately not written to the material audit stream.
  -- A busy agent can renew every few seconds; only acquire, release, takeover,
  -- expiry, and completed work are retained as meaningful history.
  return jsonb_build_object('lease_token', v_lease.lease_token, 'expires_at', v_lease.expires_at, 'work_state', v_lease.work_state);
end;
$$;

create or replace function public.release_confirmation_work_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_lease_token uuid,
  p_reason text default 'closed'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_lease public.confirmation_work_leases%rowtype;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  update public.confirmation_work_leases lease
  set released_at = now(), release_reason = left(coalesce(nullif(btrim(p_reason), ''), 'closed'), 120), updated_at = now()
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.lease_token = p_lease_token and lease.agent_id = v_actor_id
    and lease.released_at is null
  returning lease.* into v_lease;
  if not found then return false; end if;
  insert into public.confirmation_work_lease_events (
    workspace_id, order_id, lease_id, actor_id, event_type, reason
  ) values (
    p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'LEASE_RELEASED', v_lease.release_reason
  );
  return true;
end;
$$;

-- Save + Next is one transaction: validate the lease and optimistic timestamp,
-- persist the outcome, let Smart refill run, release the current lease, then
-- claim the next server-authorized order. No browser-loaded queue is trusted.
create or replace function public.save_confirmation_order_with_lease_v1(
  p_workspace_id uuid,
  p_order_id uuid,
  p_lease_token uuid,
  p_expected_updated_at timestamptz default null,
  p_status text default null,
  p_is_upsell boolean default null,
  p_total numeric default null,
  p_claim_next boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_lease public.confirmation_work_leases%rowtype;
  v_normalized_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_new_total numeric;
  v_new_variant_price numeric;
  v_next_order_id uuid;
  v_next_lease jsonb;
  v_is_manager boolean;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  v_is_manager := public.can_manage_workspace_team(p_workspace_id);

  select order_row.* into v_order
  from public.orders order_row
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;

  select lease.* into v_lease
  from public.confirmation_work_leases lease
  where lease.workspace_id = p_workspace_id and lease.order_id = p_order_id
    and lease.lease_token = p_lease_token and lease.agent_id = v_actor_id
    and lease.released_at is null and lease.expires_at > now()
  for update;
  if not found then raise exception using errcode = '55P03', message = 'VALID_WORK_LEASE_REQUIRED'; end if;

  if not v_is_manager and (
    v_order.assigned_to is distinct from v_actor_id
    or not public.confirmation_agent_is_eligible_v1(p_workspace_id, v_actor_id, false, 120)
  ) then raise exception using errcode = '42501', message = 'ORDER_NOT_ASSIGNED_TO_AGENT'; end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'STALE_ORDER_VERSION';
  end if;
  if v_normalized_status is not null and v_normalized_status not in (
    'new', 'pending', 'confirmed', 'scheduled', 'no_answer', 'unreachable',
    'wrong_number', 'busy', 'cancelled', 'refused', 'out_of_stock',
    'blacklisted', 'duplicate', 'review', 'in_progress'
  ) then raise exception using errcode = '22023', message = 'INVALID_CONFIRMATION_STATUS'; end if;
  if p_total is not null and (p_total <= 0 or p_total > 10000000) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TOTAL';
  end if;
  if coalesce(p_is_upsell, false) and p_total is null then
    raise exception using errcode = '22023', message = 'UPSELL_TOTAL_REQUIRED';
  end if;

  v_new_total := coalesce(p_total, v_order.total);
  v_new_variant_price := case when p_total is null then v_order.variant_price
    else round(v_new_total / greatest(coalesce(v_order.quantity, 1), 1)::numeric, 2) end;

  update public.orders order_row
  set status = coalesce(v_normalized_status, order_row.status),
      confirmed_at = case
        when v_normalized_status = 'confirmed' and lower(coalesce(order_row.status, '')) <> 'confirmed' then now()
        else order_row.confirmed_at end,
      confirmation_method = case when v_normalized_status = 'confirmed' then 'call' else order_row.confirmation_method end,
      confirmation_source = case when v_normalized_status = 'confirmed' then 'human' else order_row.confirmation_source end,
      confirmed_by_user_id = case when v_normalized_status = 'confirmed' then v_actor_id else order_row.confirmed_by_user_id end,
      cancelled_at = case
        when v_normalized_status in ('cancelled', 'refused') and lower(coalesce(order_row.status, '')) not in ('cancelled', 'refused') then now()
        else order_row.cancelled_at end,
      is_upsell = coalesce(p_is_upsell, order_row.is_upsell),
      upsell_value = case when p_is_upsell is true then v_new_total when p_is_upsell is false then null else order_row.upsell_value end,
      upsell_at = case when p_is_upsell is true then now() when p_is_upsell is false then null else order_row.upsell_at end,
      upsell_by_user_id = case when p_is_upsell is true then v_actor_id when p_is_upsell is false then null else order_row.upsell_by_user_id end,
      total = v_new_total,
      variant_price = v_new_variant_price,
      updated_at = now()
  where order_row.workspace_id = p_workspace_id and order_row."Order ID" = p_order_id
  returning order_row.* into v_order;

  insert into public.confirmation_work_lease_events (
    workspace_id, order_id, lease_id, actor_id, event_type, metadata
  ) values (
    p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'ORDER_SAVED',
    jsonb_build_object('status', v_normalized_status, 'claim_next', p_claim_next)
  );

  if p_claim_next or v_normalized_status in ('confirmed', 'cancelled', 'refused', 'out_of_stock', 'blacklisted', 'duplicate') then
    update public.confirmation_work_leases lease
    set released_at = now(), release_reason = case when p_claim_next then 'save_and_next' else 'terminal_outcome' end, updated_at = now()
    where lease.id = v_lease.id;
    insert into public.confirmation_work_lease_events (
      workspace_id, order_id, lease_id, actor_id, event_type, reason
    ) values (
      p_workspace_id, p_order_id, v_lease.id, v_actor_id, 'LEASE_RELEASED',
      case when p_claim_next then 'save_and_next' else 'terminal_outcome' end
    );
  else
    update public.confirmation_work_leases lease
    set heartbeat_at = now(), expires_at = greatest(lease.expires_at, now() + interval '60 seconds'), updated_at = now()
    where lease.id = v_lease.id;
  end if;

  if p_claim_next then
    select next_order."Order ID" into v_next_order_id
    from public.orders next_order
    where next_order.workspace_id = p_workspace_id
      and next_order."Order ID" <> p_order_id
      and (v_is_manager or next_order.assigned_to = v_actor_id)
      and lower(trim(coalesce(next_order.status, 'pending'))) in (
        'new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number', 'review', 'in_progress'
      )
      and not exists (
        select 1 from public.confirmation_work_leases active_lease
        where active_lease.workspace_id = next_order.workspace_id
          and active_lease.order_id = next_order."Order ID"
          and active_lease.released_at is null and active_lease.expires_at > now()
      )
    order by (
      select min(callback.scheduled_at)
      from public.confirmation_callbacks callback
      where callback.workspace_id = next_order.workspace_id
        and callback.order_id = next_order."Order ID"
        and callback.status = 'scheduled' and callback.scheduled_at <= now()
    ) asc nulls last, next_order.created_at asc, next_order."Order ID"
    limit 1
    for update of next_order skip locked;

    if v_next_order_id is not null then
      v_next_lease := public.acquire_confirmation_work_v1(p_workspace_id, v_next_order_id, 'open', null);
      insert into public.confirmation_work_lease_events (
        workspace_id, order_id, lease_id, actor_id, event_type, metadata
      ) values (
        p_workspace_id, v_next_order_id, (v_next_lease ->> 'lease_id')::uuid,
        v_actor_id, 'NEXT_ORDER_CLAIMED', jsonb_build_object('previous_order_id', p_order_id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id', v_order."Order ID", 'status', v_order.status, 'total', v_order.total,
    'variant_price', v_order.variant_price, 'is_upsell', v_order.is_upsell,
    'upsell_value', v_order.upsell_value, 'upsell_at', v_order.upsell_at,
    'updated_at', v_order.updated_at, 'next_order_id', v_next_order_id,
    'next_lease', v_next_lease
  );
end;
$$;

-- Browser callers receive only audited wrappers. Internal trigger helpers stay
-- service/owner executable and cannot be invoked anonymously or by an agent.
revoke all on function public.confirmation_agent_is_eligible_v1(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.distribute_equal_confirmation_orders_internal_v3(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.fill_smart_confirmation_batches_internal_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_new_confirmation_order_online_v2() from public, anon, authenticated;
revoke all on function public.refill_smart_confirmation_queue_v1() from public, anon, authenticated;
revoke all on function public.rebalance_confirmation_on_presence_v2() from public, anon, authenticated;

grant execute on function public.confirmation_agent_is_eligible_v1(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.distribute_equal_confirmation_orders_internal_v3(uuid, uuid[], uuid) to service_role;
grant execute on function public.fill_smart_confirmation_batches_internal_v1(uuid, uuid) to service_role;
grant execute on function public.assign_new_confirmation_order_online_v2() to service_role;
grant execute on function public.refill_smart_confirmation_queue_v1() to service_role;
grant execute on function public.rebalance_confirmation_on_presence_v2() to service_role;

revoke all on function public.set_confirmation_distribution_settings_v1(uuid, text, integer, integer, integer) from public, anon;
revoke all on function public.run_confirmation_distribution_v1(uuid, uuid[]) from public, anon;
revoke all on function public.acquire_confirmation_work_v1(uuid, uuid, text, text) from public, anon;
revoke all on function public.renew_confirmation_work_v1(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.release_confirmation_work_v1(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.save_confirmation_order_with_lease_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean) from public, anon;

grant execute on function public.set_confirmation_distribution_settings_v1(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.run_confirmation_distribution_v1(uuid, uuid[]) to authenticated;
grant execute on function public.acquire_confirmation_work_v1(uuid, uuid, text, text) to authenticated;
grant execute on function public.renew_confirmation_work_v1(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.release_confirmation_work_v1(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.save_confirmation_order_with_lease_v1(uuid, uuid, uuid, timestamptz, text, boolean, numeric, boolean) to authenticated;

-- The lease-aware save is now the only browser status/price mutation path.
-- Keep the legacy routine for trusted server compatibility, but remove the
-- direct authenticated bypass that could ignore an active lease.
revoke all on function public.save_confirmation_order_v1(uuid, uuid, text, boolean, numeric) from public, anon, authenticated;
grant execute on function public.save_confirmation_order_v1(uuid, uuid, text, boolean, numeric) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'confirmation_work_leases'
    ) then
      alter publication supabase_realtime add table public.confirmation_work_leases;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'confirmation_work_lease_events'
    ) then
      alter publication supabase_realtime add table public.confirmation_work_lease_events;
    end if;
  end if;
end;
$$;

comment on column public.workspace_confirmation_assignment_settings.assignment_mode
  is 'Recipient ownership convention: shared team queue or separated agent/automation recipient.';
comment on column public.workspace_confirmation_assignment_settings.distribution_mode
  is 'Human order distribution strategy: manual, automatic_equal, or automatic_smart.';
comment on table public.confirmation_work_leases
  is 'Short-lived server-authoritative exclusive editing leases for active confirmation work.';

commit;
