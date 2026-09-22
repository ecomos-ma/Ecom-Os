-- Real team workload, response-time, shipping and upsell telemetry.
-- This migration is additive: the existing order assignment history remains the
-- source of record, while orders.assigned_to is kept in sync for fast queues.

alter table public.orders
  add column if not exists is_upsell boolean not null default false,
  add column if not exists upsell_value numeric(12,2),
  add column if not exists upsell_at timestamptz,
  add column if not exists upsell_by_user_id uuid references public.profiles(id) on delete set null;

create index if not exists orders_workspace_assignee_created_idx
  on public.orders (workspace_id, assigned_to, created_at desc)
  where assigned_to is not null;

create index if not exists confirmation_activities_workspace_agent_created_idx
  on public.confirmation_activities (workspace_id, agent_id, created_at desc);

-- Repair historical assignment rows created before the assignment trigger was
-- introduced, so existing agents get their real workload immediately.
with latest_assignment as (
  select distinct on (oa.workspace_id, oa.order_id)
    oa.workspace_id, oa.order_id, oa.assigned_to
  from public.order_assignments oa
  order by oa.workspace_id, oa.order_id, oa.assigned_at desc, oa.id desc
)
update public.orders o
set assigned_to = latest_assignment.assigned_to
from latest_assignment
where o.workspace_id = latest_assignment.workspace_id
  and o."Order ID" = latest_assignment.order_id
  and o.assigned_to is distinct from latest_assignment.assigned_to;

-- Keep the activity enum open only to the concrete CRM actions we display.
alter table public.confirmation_activities
  drop constraint if exists confirmation_activities_activity_type_check;
alter table public.confirmation_activities
  add constraint confirmation_activities_activity_type_check
  check (activity_type in (
    'ORDER_OPENED', 'NOTE_ADDED', 'CALL_STARTED', 'CALL_ENDED',
    'CALLBACK_SCHEDULED', 'CALLBACK_COMPLETED', 'RECORDING_SAVED',
    'UPSELL_MARKED', 'UPSELL_REMOVED'
  ));

-- Trigger writes are intentional: browser users cannot forge another agent's
-- timeline, while genuine order and CRM actions remain visible to team leads.
create or replace function public.log_confirmation_activity_for_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_label text;
begin
  select coalesce(o.display_order_id, o.order_number, o."Order ID"::text)
    into order_label
  from public.orders o
  where o.workspace_id = new.workspace_id
    and o."Order ID" = new.order_id;

  insert into public.member_activity_log (
    workspace_id, profile_id, action, entity_type, entity_id, entity_label, page
  ) values (
    new.workspace_id,
    new.agent_id,
    lower(new.activity_type),
    'order',
    new.order_id::text,
    order_label,
    'confirmation'
  );
  return new;
end;
$$;

drop trigger if exists trg_confirmation_activity_team_log on public.confirmation_activities;
create trigger trg_confirmation_activity_team_log
after insert on public.confirmation_activities
for each row execute function public.log_confirmation_activity_for_team();

create or replace function public.sync_order_assignment_for_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_label text;
begin
  update public.orders
     set assigned_to = new.assigned_to
   where workspace_id = new.workspace_id
     and "Order ID" = new.order_id
   returning coalesce(display_order_id, order_number, "Order ID"::text)
      into order_label;

  insert into public.member_activity_log (
    workspace_id, profile_id, action, entity_type, entity_id, entity_label, new_value, page
  ) values (
    new.workspace_id, new.assigned_to, 'order_assigned', 'order',
    new.order_id::text, order_label, 'assigned', 'team'
  );

  if new.assigned_by is not null and new.assigned_by <> new.assigned_to then
    insert into public.member_activity_log (
      workspace_id, profile_id, action, entity_type, entity_id, entity_label, new_value, page
    ) values (
      new.workspace_id, new.assigned_by, 'assigned_order', 'order',
      new.order_id::text, order_label, new.assigned_to::text, 'team'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_assignment_team_sync on public.order_assignments;
create trigger trg_order_assignment_team_sync
after insert on public.order_assignments
for each row execute function public.sync_order_assignment_for_team();

create or replace function public.log_team_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  order_label text;
begin
  -- Do not attribute carrier or background changes to an agent. Only an
  -- authenticated workspace member is recorded as the actor.
  select pw.profile_id
    into actor_id
  from public.profile_workspaces pw
  where pw.workspace_id = new.workspace_id
    and pw.profile_id = (select auth.uid())
    and pw.status = 'active'
  limit 1;

  if actor_id is null then
    return new;
  end if;

  order_label := coalesce(new.display_order_id, new.order_number, new."Order ID"::text);
  if new.status is distinct from old.status then
    insert into public.member_activity_log (
      workspace_id, profile_id, action, entity_type, entity_id, entity_label, old_value, new_value, page
    ) values (
      new.workspace_id, actor_id, 'confirmation_status_changed', 'order',
      new."Order ID"::text, order_label, old.status, new.status, 'confirmation'
    );
  end if;

  if new.shipping_status is distinct from old.shipping_status
     or new.delivery_status is distinct from old.delivery_status then
    insert into public.member_activity_log (
      workspace_id, profile_id, action, entity_type, entity_id, entity_label, old_value, new_value, page
    ) values (
      new.workspace_id, actor_id, 'shipping_status_changed', 'order',
      new."Order ID"::text, order_label,
      coalesce(old.shipping_status, old.delivery_status),
      coalesce(new.shipping_status, new.delivery_status), 'shipping'
    );
  end if;

  if new.is_upsell is distinct from old.is_upsell then
    insert into public.member_activity_log (
      workspace_id, profile_id, action, entity_type, entity_id, entity_label, old_value, new_value, page
    ) values (
      new.workspace_id, actor_id,
      case when new.is_upsell then 'upsell_marked' else 'upsell_removed' end,
      'order', new."Order ID"::text, order_label,
      case when old.is_upsell then 'upsell' else null end,
      case when new.is_upsell then 'upsell' else null end,
      'orders'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_team_activity on public.orders;
create trigger trg_orders_team_activity
after update of status, shipping_status, delivery_status, is_upsell on public.orders
for each row execute function public.log_team_order_change();

-- One ordered path for manual assignment. It validates the manager and target
-- membership before writing history; the trigger above synchronizes the queue.
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
  order_id uuid;
  assigned_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then raise exception 'ORDER_REQUIRED'; end if;

  if not exists (
    select 1 from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id
      and pw.profile_id = p_assigned_to
      and pw.status = 'active'
      and coalesce(p.is_active, true)
  ) then raise exception 'ACTIVE_TEAM_MEMBER_REQUIRED'; end if;

  foreach order_id in array p_order_ids loop
    if exists (
      select 1 from public.orders o
      where o.workspace_id = p_workspace_id and o."Order ID" = order_id
      for update
    ) then
      insert into public.order_assignments (
        workspace_id, order_id, assigned_to, assigned_by, result
      ) values (
        p_workspace_id, order_id, p_assigned_to, (select auth.uid()), 'pending'
      );
      assigned_count := assigned_count + 1;
    end if;
  end loop;

  return jsonb_build_object('assigned_count', assigned_count, 'assigned_to', p_assigned_to);
end;
$$;

-- Fairly fill active confirmation agents. Each pass assigns one order per
-- agent, which yields an even split (two agents receive a 50/50 batch) while
-- honoring each member's configured active-work limit.
create or replace function public.auto_assign_confirmation_orders_v1(
  p_workspace_id uuid,
  p_per_agent_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_row record;
  order_id uuid;
  active_count integer;
  capacity integer;
  assigned_count integer := 0;
  batch_limit integer := greatest(1, least(coalesce(p_per_agent_limit, 20), 200));
  assigned_in_pass integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;

  -- Revisit agents one at a time. This prevents the first agent from taking
  -- an entire batch before the next agent receives any work.
  loop
    assigned_in_pass := 0;
    for agent_row in
      select p.id, coalesce(tmp.max_active_orders, 20) as max_active_orders
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      left join public.team_member_profiles tmp
        on tmp.workspace_id = pw.workspace_id and tmp.profile_id = pw.profile_id
      where pw.workspace_id = p_workspace_id
        and pw.status = 'active'
        and not coalesce(pw.is_owner, false)
        and coalesce(p.is_active, true)
        and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
        and (
          coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0
          or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb
        )
      order by (
        select count(*) from public.orders o
        where o.workspace_id = p_workspace_id and o.assigned_to = p.id
          and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number')
      ), p.id
    loop
      select count(*) into active_count
      from public.orders o
      where o.workspace_id = p_workspace_id and o.assigned_to = agent_row.id
        and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number');
      capacity := greatest(0, least(batch_limit, agent_row.max_active_orders) - active_count);
      if capacity = 0 then continue; end if;

      select o."Order ID" into order_id
      from public.orders o
      where o.workspace_id = p_workspace_id
        and o.assigned_to is null
        and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy')
      order by o.created_at asc, o."Order ID"
      limit 1
      for update skip locked;
      if not found then exit; end if;

      insert into public.order_assignments (workspace_id, order_id, assigned_to, assigned_by, result)
      values (p_workspace_id, order_id, agent_row.id, (select auth.uid()), 'pending');
      assigned_count := assigned_count + 1;
      assigned_in_pass := assigned_in_pass + 1;
    end loop;
    exit when assigned_in_pass = 0;
  end loop;
  return jsonb_build_object('assigned_count', assigned_count, 'per_agent_limit', batch_limit);
end;
$$;

-- When an agent completes a confirmation outcome, immediately reserve the
-- next unassigned confirmation order for that same agent if a workload slot
-- is available. This is trigger-only; it cannot be invoked by the browser.
create or replace function public.refill_agent_confirmation_queue_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_limit integer;
  active_count integer;
  next_order_id uuid;
begin
  if new.assigned_to is null then return new; end if;
  if lower(coalesce(old.status, 'pending')) in ('confirmed', 'cancelled', 'shipped', 'delivered', 'returned', 'refused', 'blacklisted', 'duplicate', 'out_of_stock') then return new; end if;
  if lower(coalesce(new.status, 'pending')) not in ('confirmed', 'cancelled', 'shipped', 'delivered', 'returned', 'refused', 'blacklisted', 'duplicate', 'out_of_stock') then return new; end if;

  -- Serialize refills for the same agent. Two simultaneous status changes
  -- cannot overfill a single agent's configured active-order capacity.
  perform pg_advisory_xact_lock(hashtext(new.workspace_id::text || ':' || new.assigned_to::text));

  select coalesce(tmp.max_active_orders, 20) into agent_limit
  from public.profile_workspaces pw
  join public.profiles p on p.id = pw.profile_id
  left join public.team_member_profiles tmp on tmp.workspace_id = pw.workspace_id and tmp.profile_id = pw.profile_id
  where pw.workspace_id = new.workspace_id
    and pw.profile_id = new.assigned_to
    and pw.status = 'active'
    and not coalesce(pw.is_owner, false)
    and coalesce(p.is_active, true)
    and lower(coalesce(pw.role, p.role, 'agent')) in ('agent', 'supervisor')
    and (coalesce(jsonb_array_length(to_jsonb(p.allowed_sections)), 0) = 0 or coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) @> '["Confirmation"]'::jsonb);
  if agent_limit is null then return new; end if;

  select count(*) into active_count
  from public.orders o
  where o.workspace_id = new.workspace_id and o.assigned_to = new.assigned_to
    and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number');
  if active_count >= agent_limit then return new; end if;

  select o."Order ID" into next_order_id
  from public.orders o
  where o.workspace_id = new.workspace_id
    and o.assigned_to is null
    and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy')
  order by o.created_at asc, o."Order ID"
  limit 1
  for update skip locked;
  if next_order_id is null then return new; end if;

  insert into public.order_assignments (workspace_id, order_id, assigned_to, assigned_by, result)
  values (new.workspace_id, next_order_id, new.assigned_to, new.assigned_to, 'pending');
  return new;
end;
$$;

drop trigger if exists trg_orders_refill_confirmation_queue on public.orders;
create trigger trg_orders_refill_confirmation_queue
after update of status on public.orders
for each row execute function public.refill_agent_confirmation_queue_v1();

revoke all on function public.log_confirmation_activity_for_team() from public;
revoke all on function public.sync_order_assignment_for_team() from public;
revoke all on function public.log_team_order_change() from public;
revoke all on function public.refill_agent_confirmation_queue_v1() from public;
revoke all on function public.assign_team_orders_v1(uuid, uuid[], uuid) from public, anon;
revoke all on function public.auto_assign_confirmation_orders_v1(uuid, integer) from public, anon;
grant execute on function public.assign_team_orders_v1(uuid, uuid[], uuid) to authenticated;
grant execute on function public.auto_assign_confirmation_orders_v1(uuid, integer) to authenticated;
