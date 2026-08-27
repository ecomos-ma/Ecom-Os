-- Canonical Support Mode enforcement.
-- The old Admin Pro migration granted the root Founder FOR ALL access on
-- tenant tables. That made the read-only banner cosmetic. This migration
-- replaces it with session-scoped policies whose authority expires on the
-- server and whose write path requires an explicit elevation.

begin;

create or replace function public.has_active_support_session_for_workspace(
  p_workspace_id uuid,
  p_require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.founder_support_sessions session
    join public.workspaces workspace on workspace.id = session.workspace_id
    join public.profiles target on target.id = session.target_profile_id
    join public.profile_workspaces membership
      on membership.profile_id = session.target_profile_id
     and membership.workspace_id = session.workspace_id
    where session.founder_id = (select auth.uid())
      and session.workspace_id = p_workspace_id
      and session.ended_at is null
      and session.expires_at > now()
      and coalesce(workspace.is_active, true)
      and workspace.deleted_at is null
      and coalesce(target.is_active, true)
      and target.deleted_at is null
      and coalesce(to_jsonb(membership) ->> 'status', 'active') = 'active'
      and public.has_platform_permission(
        case when p_require_write then 'support.impersonate_write' else 'support.impersonate_read' end
      )
      and (
        not p_require_write
        or (
          session.mode = 'read_write'
          and session.write_expires_at is not null
          and session.write_expires_at > now()
        )
      )
  );
$$;

revoke all on function public.has_active_support_session_for_workspace(uuid, boolean) from public, anon;
grant execute on function public.has_active_support_session_for_workspace(uuid, boolean) to authenticated, service_role;

-- Remove the historical root-Founder blanket write policy. Cross-tenant Admin
-- pages use SECURITY DEFINER RPCs; seller-dashboard access is session scoped.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'workspaces', 'orders', 'order_items', 'order_events', 'order_assignments',
    'customers', 'products', 'stock_history', 'campaigns', 'ad_spend',
    'meta_campaigns', 'shipments', 'shipping_logs', 'shipping_payouts',
    'shipping_sync_logs', 'expenses', 'transactions', 'confirmation_activities',
    'confirmation_callbacks', 'confirmation_notes', 'confirmation_call_recordings',
    'landing_pages', 'ai_landing_pages', 'ai_products', 'ai_sawty_generations',
    'tiktok_campaigns', 'tiktok_adgroups', 'tiktok_ads', 'tiktok_ad_insights',
    'whatsapp_messages', 'whatsapp_events', 'whatsapp_manual_reviews',
    'whatsapp_reply_actions', 'whatsapp_audio_recordings', 'workspace_cost_rules',
    'workspace_affiliate_sku_costs', 'workspace_supplies',
    'workspace_supply_purchases', 'workspace_supply_usage', 'workspace_invitations'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('drop policy if exists founder_full_access on public.%I', target_table);
    end if;
  end loop;
end $$;

-- A Support Mode session may read only its selected workspace.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'orders', 'order_items', 'order_events', 'order_assignments', 'customers',
    'products', 'stock_history', 'campaigns', 'ad_spend', 'meta_campaigns',
    'shipments', 'shipping_logs', 'shipping_payouts', 'shipping_sync_logs',
    'expenses', 'transactions', 'confirmation_activities',
    'confirmation_callbacks', 'confirmation_notes', 'confirmation_call_recordings',
    'landing_pages', 'ai_landing_pages', 'ai_products', 'ai_sawty_generations',
    'tiktok_campaigns', 'tiktok_adgroups', 'tiktok_ads', 'tiktok_ad_insights',
    'whatsapp_messages', 'whatsapp_events', 'whatsapp_manual_reviews',
    'whatsapp_reply_actions', 'whatsapp_audio_recordings', 'workspace_cost_rules',
    'workspace_affiliate_sku_costs', 'workspace_supplies',
    'workspace_supply_purchases', 'workspace_supply_usage', 'workspace_invitations'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = to_regclass(format('public.%I', target_table))
          and attribute.attname = 'workspace_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
      ) then
      execute format('drop policy if exists platform_support_read_access on public.%I', target_table);
      execute format(
        'create policy platform_support_read_access on public.%I for select to authenticated using ((select public.has_active_support_session_for_workspace(workspace_id, false)))',
        target_table
      );
    end if;
  end loop;
end $$;

drop policy if exists platform_support_workspace_read on public.workspaces;
create policy platform_support_workspace_read
  on public.workspaces for select to authenticated
  using ((select public.has_active_support_session_for_workspace(id, false)));

-- Operational writes are allowed only while the same session has a live,
-- separately audited write elevation. Governance, membership, credentials,
-- and workspace ownership are intentionally excluded from this list.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'orders', 'order_items', 'order_events', 'order_assignments', 'customers',
    'products', 'stock_history', 'campaigns', 'ad_spend', 'shipments',
    'shipping_logs', 'expenses', 'transactions', 'confirmation_activities',
    'confirmation_callbacks', 'confirmation_notes', 'workspace_cost_rules',
    'workspace_affiliate_sku_costs', 'workspace_supplies',
    'workspace_supply_purchases', 'workspace_supply_usage'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = to_regclass(format('public.%I', target_table))
          and attribute.attname = 'workspace_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
      ) then
      execute format('drop policy if exists platform_support_insert_access on public.%I', target_table);
      execute format('drop policy if exists platform_support_update_access on public.%I', target_table);
      execute format('drop policy if exists platform_support_delete_access on public.%I', target_table);
      execute format(
        'create policy platform_support_insert_access on public.%I for insert to authenticated with check ((select public.has_active_support_session_for_workspace(workspace_id, true)))',
        target_table
      );
      execute format(
        'create policy platform_support_update_access on public.%I for update to authenticated using ((select public.has_active_support_session_for_workspace(workspace_id, true))) with check ((select public.has_active_support_session_for_workspace(workspace_id, true)))',
        target_table
      );
      execute format(
        'create policy platform_support_delete_access on public.%I for delete to authenticated using ((select public.has_active_support_session_for_workspace(workspace_id, true)))',
        target_table
      );
    end if;
  end loop;
end $$;

-- Profiles can be seen by the user, normal workspace peers, or a live support
-- session. Platform authority alone does not permit browser-side profile edits.
drop policy if exists profiles_select_scoped on public.profiles;
create policy profiles_select_scoped
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (workspace_id is not null and (select public.is_active_workspace_member(workspace_id)))
    or exists (
      select 1
      from public.profile_workspaces membership
      where membership.profile_id = profiles.id
        and (select public.has_active_support_session_for_workspace(membership.workspace_id, false))
    )
  );

drop policy if exists profiles_update_scoped on public.profiles;
create policy profiles_update_scoped
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and public.is_safe_self_profile_update(
      role, workspace_id, email, is_active, allowed_sections, last_login_at, deleted_at
    )
  );

-- Membership rows are browsable to Platform Admin only through RPCs, except
-- for the selected Support Mode workspace where seller pages need them.
drop policy if exists profile_workspaces_select_active on public.profile_workspaces;
create policy profile_workspaces_select_active
  on public.profile_workspaces for select to authenticated
  using (
    (select public.is_active_workspace_member(workspace_id))
    or (select public.has_active_support_session_for_workspace(workspace_id, false))
  );

-- Direct Platform Admin workspace updates are removed. Admin status changes
-- remain available through platform_set_workspace_status_v1 with audit.
drop policy if exists workspaces_update_authorized on public.workspaces;
create policy workspaces_update_authorized
  on public.workspaces for update to authenticated
  using ((select public.has_workspace_role(id, array['owner','supervisor','admin','manager'])))
  with check ((select public.has_workspace_role(id, array['owner','supervisor','admin','manager'])));

commit;
