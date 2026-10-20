-- Team / Confirmation Phase 1 security boundary
--
-- This migration is intentionally data preserving. It does not rewrite orders,
-- assignments, earnings, invoices, or historical audit rows. It only narrows
-- direct browser access and removes RPC access to internal payroll/trigger
-- functions. Authorized command RPCs and service-role integrations continue to
-- operate as before.

begin;

-- Keep this migration independently deployable after drift reconciliation.
-- Both columns already exist in the intended local chain, but the live project
-- may receive this hardening migration after an older partial assignment build.
alter table public.order_assignments
  add column if not exists assigned_at timestamptz default now(),
  add column if not exists notes text;

-- Internal SECURITY DEFINER helpers are implementation details. Trigger
-- execution does not require browser roles to hold EXECUTE, and the public
-- payroll command calls the internal generator as its postgres owner.
revoke all on function public.notify_agent_payroll_event_v1() from public, anon, authenticated;
revoke all on function public.enforce_separated_confirmation_recipient_v1() from public, anon, authenticated;
revoke all on function public.capture_confirmation_event_v1() from public, anon, authenticated;
revoke all on function public.materialize_agent_earnings_for_order_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_agent_order_earnings_v1() from public, anon, authenticated;
revoke all on function public.sync_agent_event_earnings_v1() from public, anon, authenticated;
revoke all on function public.generate_agent_payroll_invoices_internal_v1(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.log_confirmation_activity_for_team() from public, anon, authenticated;
revoke all on function public.sync_order_assignment_for_team() from public, anon, authenticated;
revoke all on function public.log_team_order_change() from public, anon, authenticated;

grant execute on function public.notify_agent_payroll_event_v1() to service_role;
grant execute on function public.enforce_separated_confirmation_recipient_v1() to service_role;
grant execute on function public.capture_confirmation_event_v1() to service_role;
grant execute on function public.materialize_agent_earnings_for_order_v1(uuid, uuid) to service_role;
grant execute on function public.sync_agent_order_earnings_v1() to service_role;
grant execute on function public.sync_agent_event_earnings_v1() to service_role;
grant execute on function public.generate_agent_payroll_invoices_internal_v1(uuid, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.log_confirmation_activity_for_team() to service_role;
grant execute on function public.sync_order_assignment_for_team() to service_role;
grant execute on function public.log_team_order_change() to service_role;

-- The scheduler is service-only. Re-state this explicitly so a future CREATE OR
-- REPLACE does not accidentally inherit an unsafe default PUBLIC grant.
revoke all on function public.run_due_agent_payroll_schedules_v1() from public, anon, authenticated;
grant execute on function public.run_due_agent_payroll_schedules_v1() to service_role;

-- RLS predicates use workspace_id + assigned_to together. This index supports
-- both agent queue reads and assignment-history policy checks.
create index if not exists order_assignments_workspace_assignee_latest_idx
  on public.order_assignments (workspace_id, assigned_to, assigned_at desc, id desc);

alter table public.orders enable row level security;
alter table public.order_assignments enable row level security;

-- Keep support-session access functional while ensuring every authenticated
-- order read is either management-scoped or limited to the current assignee.
drop policy if exists orders_membership_read_boundary on public.orders;
create policy orders_membership_read_boundary
  on public.orders
  as restrictive
  for select
  to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
    or (
      assigned_to = (select auth.uid())
      and (select public.is_active_workspace_member(workspace_id))
      and exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and coalesce(profile.is_active, true)
          and profile.deleted_at is null
          and (
            coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb)
              ?| array['Orders', 'Confirmation', 'Shipping']
          )
      )
    )
  );

-- Direct row mutation remains available to management/support. An agent may
-- update only an order that remains assigned to that same active agent and for
-- which an operational section was granted. Confirmation UI writes continue
-- through save_confirmation_order_v1, which additionally validates fields and
-- status values.
drop policy if exists orders_scoped_update_boundary on public.orders;
create policy orders_scoped_update_boundary
  on public.orders
  as restrictive
  for update
  to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
    or (
      assigned_to = (select auth.uid())
      and (select public.is_active_workspace_member(workspace_id))
      and exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and coalesce(profile.is_active, true)
          and profile.deleted_at is null
          and (
            coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb)
              ?| array['Orders', 'Confirmation', 'Shipping']
          )
      )
    )
  )
  with check (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
    or (
      assigned_to = (select auth.uid())
      and (select public.is_active_workspace_member(workspace_id))
      and exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and coalesce(profile.is_active, true)
          and profile.deleted_at is null
          and (
            coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb)
              ?| array['Orders', 'Confirmation', 'Shipping']
          )
      )
    )
  );

-- Creating and deleting orders are management operations. Service-role imports
-- bypass RLS and active platform support sessions retain their explicit path.
drop policy if exists orders_management_insert_boundary on public.orders;
create policy orders_management_insert_boundary
  on public.orders
  as restrictive
  for insert
  to authenticated
  with check (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists orders_management_delete_boundary on public.orders;
create policy orders_management_delete_boundary
  on public.orders
  as restrictive
  for delete
  to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

-- Remove the legacy ALL policies that let any profile in its primary workspace
-- create, rewrite, or delete assignment history.
drop policy if exists "Workspace isolation for order_assignments" on public.order_assignments;
drop policy if exists oa_workspace on public.order_assignments;

drop policy if exists order_assignments_manager_all on public.order_assignments;
create policy order_assignments_manager_all
  on public.order_assignments
  for all
  to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  )
  with check (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, true))
  );

drop policy if exists order_assignments_assignee_select on public.order_assignments;
create policy order_assignments_assignee_select
  on public.order_assignments
  for select
  to authenticated
  using (
    assigned_to = (select auth.uid())
    and (select public.is_active_workspace_member(workspace_id))
  );

-- Defense in depth: a later permissive policy cannot expose another agent's
-- assignment history without also updating this restrictive boundary.
drop policy if exists order_assignments_read_boundary on public.order_assignments;
create policy order_assignments_read_boundary
  on public.order_assignments
  as restrictive
  for select
  to authenticated
  using (
    (select public.can_manage_workspace_team(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
    or (
      assigned_to = (select auth.uid())
      and (select public.is_active_workspace_member(workspace_id))
    )
  );

revoke all on table public.order_assignments from anon;
grant select on table public.order_assignments to authenticated;

commit;
