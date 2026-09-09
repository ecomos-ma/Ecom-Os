-- Targeted production hardening for confirmed high-impact SECURITY DEFINER
-- functions and the legacy admin workspace RPC. This intentionally does not
-- attempt to reconcile every advisor finding in one migration.

-- The legacy admin RPC exposed the former plaintext Meta token column and had
-- no authorization check. Keep the RPC name only for trusted server callers.
drop function if exists public.admin_get_all_workspaces();
create function public.admin_get_all_workspaces()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  is_active boolean,
  status text,
  created_by uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.name, w.created_at, w.is_active, w.status, w.created_by
  from public.workspaces as w
  where exists (
    select 1
    from public.profiles as p
    where (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or (
        p.id = auth.uid()
        and p.is_active is not false
        and p.deleted_at is null
        and lower(coalesce(p.role, '')) in ('founder', 'super_admin', 'supervisor')
      )
    )
  )
  order by w.created_at desc;
$$;

create or replace function public.admin_get_all_profiles()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  workspace_id uuid,
  created_at timestamptz,
  is_active boolean,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.role, p.workspace_id,
         p.created_at, p.is_active, p.deleted_at
  from public.profiles as p
  where exists (
    select 1
    from public.profiles as actor
    where (
      current_setting('request.jwt.claim.role', true) = 'service_role'
      or (
        actor.id = auth.uid()
        and actor.is_active is not false
        and actor.deleted_at is null
        and lower(coalesce(actor.role, '')) in ('founder', 'super_admin', 'supervisor')
      )
    )
  )
  order by p.created_at desc;
$$;

revoke all on function public.admin_get_all_profiles() from public, anon, authenticated;
revoke all on function public.admin_get_all_workspaces() from public, anon, authenticated;
grant execute on function public.admin_get_all_profiles() to service_role;
grant execute on function public.admin_get_all_workspaces() to service_role;

-- These functions either handle secrets, mutate inventory/workspaces, or
-- return tenant-sensitive data. They are called by trusted server paths only.
revoke all on function public.reset_workspace(uuid, uuid) from public, anon, authenticated;
alter function public.reset_workspace(uuid, uuid) set search_path = public;
grant execute on function public.reset_workspace(uuid, uuid) to service_role;

revoke all on function public.delete_workspace_completely(uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_workspace_completely(uuid, boolean) to service_role;

revoke all on function public.decrypt_secret(text) from public, anon, authenticated;
alter function public.decrypt_secret(text) set search_path = public;
grant execute on function public.decrypt_secret(text) to service_role;

revoke all on function public.upsert_shipping_credentials(uuid, text, text, text, text) from public, anon, authenticated;
alter function public.upsert_shipping_credentials(uuid, text, text, text, text) set search_path = public;
grant execute on function public.upsert_shipping_credentials(uuid, text, text, text, text) to service_role;

revoke all on function public.create_inventory_movement(uuid, uuid, uuid, text, integer, text, numeric, text, text, uuid, uuid, text, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_inventory_movement(uuid, uuid, uuid, text, integer, text, numeric, text, text, uuid, uuid, text, uuid, uuid, text, uuid, text, jsonb) to service_role;

revoke all on function public.increment_returned_stock(uuid, integer) from public, anon, authenticated;
alter function public.increment_returned_stock(uuid, integer) set search_path = public;
grant execute on function public.increment_returned_stock(uuid, integer) to service_role;

revoke all on function public.get_whatsapp_conversation(uuid) from public, anon, authenticated;
alter function public.get_whatsapp_conversation(uuid) set search_path = public;
grant execute on function public.get_whatsapp_conversation(uuid) to service_role;

revoke all on function public.get_daily_ad_spend(date, date, uuid) from public, anon, authenticated;
alter function public.get_daily_ad_spend(date, date, uuid) set search_path = public;
grant execute on function public.get_daily_ad_spend(date, date, uuid) to service_role;

revoke all on function public.can_reset_workspace(uuid) from public, anon, authenticated;
alter function public.can_reset_workspace(uuid) set search_path = public;
grant execute on function public.can_reset_workspace(uuid) to service_role;

-- The deployed destructive legacy reset path is retired in favor of the
-- confirmation-bound, service-only reset_workspace_data_v2 function.
revoke all on function public.reset_workspace_data_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reset_workspace_data_v2(uuid, uuid, text) to service_role;

-- Enforce querying-user RLS semantics for the leaderboard view. The view does
-- not need definer privileges and should not become a cross-tenant read path.
alter view public.agent_leaderboard set (security_invoker = true);
revoke all on table public.agent_leaderboard from anon;
grant select on table public.agent_leaderboard to authenticated, service_role;