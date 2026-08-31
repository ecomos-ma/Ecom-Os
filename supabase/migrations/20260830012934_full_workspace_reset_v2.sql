begin;

create schema if not exists private;

create table if not exists private.workspace_reset_audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reset_at timestamptz not null default now(),
  deleted_counts jsonb not null default '{}'::jsonb,
  retained_tables text[] not null default '{}'::text[]
);

create index if not exists workspace_reset_audit_log_workspace_id_idx
  on private.workspace_reset_audit_log (workspace_id, reset_at desc);

revoke all on table private.workspace_reset_audit_log from public, anon, authenticated;

drop function if exists public.reset_workspace_data(uuid);
drop function if exists public.reset_workspace_data_v2(uuid, uuid, text);

create function public.reset_workspace_data_v2(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_name text;
  v_target_tables text[];
  v_table text;
  v_pass integer := 0;
  v_max_passes integer;
  v_delete_count bigint;
  v_deleted_this_pass bigint;
  v_remaining boolean;
  v_blocked_tables text[] := '{}'::text[];
  v_deleted_counts jsonb := '{}'::jsonb;
  v_owner_ids uuid[];
  v_fk record;
begin
  if p_workspace_id is null or p_actor_id is null then
    raise exception 'WORKSPACE_RESET_INVALID_REQUEST' using errcode = '22023';
  end if;

  select workspace.name
    into v_workspace_name
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null
  for update;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_confirmation is distinct from ('RESET ' || v_workspace_name) then
    raise exception 'WORKSPACE_RESET_CONFIRMATION_MISMATCH' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profile_workspaces as membership
    where membership.workspace_id = p_workspace_id
      and membership.profile_id = p_actor_id
      and membership.status = 'active'
      and membership.is_owner is true
  ) and not exists (
    select 1
    from public.workspaces as workspace
    where workspace.id = p_workspace_id
      and workspace.created_by = p_actor_id
  ) then
    raise exception 'WORKSPACE_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(array_agg(membership.profile_id), '{}'::uuid[])
    into v_owner_ids
  from public.profile_workspaces as membership
  where membership.workspace_id = p_workspace_id
    and membership.status = 'active'
    and membership.is_owner is true;

  if cardinality(v_owner_ids) = 0 then
    v_owner_ids := array[p_actor_id];
  end if;

  select coalesce(array_agg(candidate.table_name order by candidate.table_name), '{}'::text[])
    into v_target_tables
  from (
    select distinct column_info.table_name
    from information_schema.columns as column_info
    join information_schema.tables as table_info
      on table_info.table_schema = column_info.table_schema
     and table_info.table_name = column_info.table_name
     and table_info.table_type = 'BASE TABLE'
    where column_info.table_schema = 'public'
      and column_info.column_name = 'workspace_id'
      and column_info.data_type = 'uuid'
      and column_info.table_name <> all (array[
        'workspaces',
        'profiles',
        'profile_workspaces',
        'workspace_subscriptions',
        'workspace_subscription_owners',
        'audit_logs',
        'security_logs',
        'founder_impersonation_audit',
        'founder_support_sessions',
        'founder_announcements',
        'plan_blocked_ingestion_events'
      ]::text[])
  ) as candidate;

  -- Break nullable cross-links (for example orders.shipment_id) before the
  -- FK-safe deletion passes. workspace_id is never nulled.
  for v_fk in
    select child.relname as child_table, child_column.attname as child_column
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_class as child on child.oid = constraint_info.conrelid
    join pg_catalog.pg_namespace as child_namespace on child_namespace.oid = child.relnamespace
    join pg_catalog.pg_class as parent on parent.oid = constraint_info.confrelid
    join pg_catalog.pg_namespace as parent_namespace on parent_namespace.oid = parent.relnamespace
    join pg_catalog.pg_attribute as child_column
      on child_column.attrelid = child.oid
     and child_column.attnum = constraint_info.conkey[1]
    where constraint_info.contype = 'f'
      and child_namespace.nspname = 'public'
      and parent_namespace.nspname = 'public'
      and cardinality(constraint_info.conkey) = 1
      and child.relname = any(v_target_tables)
      and parent.relname = any(v_target_tables)
      and child_column.attname <> 'workspace_id'
      and child_column.attnotnull is false
  loop
    execute format(
      'update public.%I set %I = null where workspace_id = $1',
      v_fk.child_table,
      v_fk.child_column
    ) using p_workspace_id;
  end loop;

  -- A failed table delete rolls back only that table's subtransaction. Later
  -- passes remove its children first, then retry the parent.
  v_max_passes := greatest(cardinality(v_target_tables) + 1, 2);
  while v_pass < v_max_passes loop
    v_pass := v_pass + 1;
    v_deleted_this_pass := 0;
    v_blocked_tables := '{}'::text[];

    foreach v_table in array v_target_tables loop
      begin
        execute format('delete from public.%I where workspace_id = $1', v_table)
          using p_workspace_id;
        get diagnostics v_delete_count = row_count;
        if v_delete_count > 0 then
          v_deleted_this_pass := v_deleted_this_pass + v_delete_count;
          v_deleted_counts := jsonb_set(
            v_deleted_counts,
            array[v_table],
            to_jsonb(coalesce((v_deleted_counts ->> v_table)::bigint, 0) + v_delete_count),
            true
          );
        end if;
      exception
        when foreign_key_violation then
          v_blocked_tables := array_append(v_blocked_tables, v_table);
      end;
    end loop;

    v_remaining := false;
    foreach v_table in array v_target_tables loop
      execute format(
        'select exists (select 1 from public.%I where workspace_id = $1)',
        v_table
      ) into v_remaining using p_workspace_id;
      exit when v_remaining;
    end loop;

    exit when not v_remaining;

    if v_deleted_this_pass = 0 then
      raise exception 'WORKSPACE_RESET_BLOCKED_TABLES: %', array_to_string(v_blocked_tables, ', ')
        using errcode = '23503';
    end if;
  end loop;

  if v_remaining then
    raise exception 'WORKSPACE_RESET_VERIFICATION_FAILED' using errcode = '23503';
  end if;

  -- Remove archived tenant notification copies kept outside the exposed schema.
  if to_regclass('private.notification_preferences_legacy_20260825') is not null then
    delete from private.notification_preferences_legacy_20260825 where workspace_id = p_workspace_id;
  end if;
  if to_regclass('private.notifications_legacy_20260825') is not null then
    delete from private.notifications_legacy_20260825 where workspace_id = p_workspace_id;
  end if;
  if to_regclass('private.push_subscriptions_legacy_20260825') is not null then
    delete from private.push_subscriptions_legacy_20260825 where workspace_id = p_workspace_id;
  end if;

  -- Move removed members to another active workspace when possible, otherwise
  -- clear their legacy primary-workspace pointer.
  update public.profiles as profile
  set workspace_id = (
    select membership.workspace_id
    from public.profile_workspaces as membership
    where membership.profile_id = profile.id
      and membership.workspace_id <> p_workspace_id
      and membership.status = 'active'
    order by membership.is_owner desc, membership.created_at asc
    limit 1
  )
  where profile.workspace_id = p_workspace_id
    and not (profile.id = any(v_owner_ids));

  with deleted as (
    delete from public.profile_workspaces as membership
    where membership.workspace_id = p_workspace_id
      and not (membership.profile_id = any(v_owner_ids))
    returning 1
  )
  select count(*) into v_delete_count from deleted;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{team_memberships}', to_jsonb(v_delete_count), true);

  update public.profiles as profile
  set current_assigned_orders = 0,
      completed_orders_today = 0,
      is_paused = false,
      confirmation_rate = 0,
      average_response_time = 0,
      average_call_duration = 0,
      working_hours_today = 0,
      performance_score = 0,
      agent_status = 'offline',
      current_capacity = coalesce(profile.daily_capacity, 100),
      success_rate = 0
  where profile.workspace_id = p_workspace_id;

  update public.workspaces
  set meta_access_token = null,
      meta_ad_account_id = null,
      business_delivery_fee = 35,
      business_confirmation_fee = 11,
      business_fulfillment_fee = 2,
      business_lead_fee = 0,
      business_product_cost = 0,
      shipping_enabled = true,
      storage_used_gb = 0,
      storage_used_bytes = 0,
      show_shipping_column = false,
      last_imported_sheet_row = 0,
      google_sheet_mapping = null,
      google_sheet_last_sync_at = null,
      google_sheet_autosync = false,
      carrier = 'ozon',
      ozon_enabled = false,
      ozon_api_key = null,
      ozon_client_id = null,
      ozon_warehouse_id = null,
      ozon_environment = 'production',
      ozon_api_url = 'https://api.ozon.ma',
      ozon_is_connected = false,
      coliaty_enabled = false,
      coliaty_api_key = null,
      coliaty_api_url = 'https://api.coliaty.ma',
      coliaty_public_key = null,
      coliaty_secret_key = null,
      coliaty_webhook_token = null,
      coliaty_is_connected = false,
      youcan_access_token = null,
      youcan_refresh_token = null,
      youcan_token_expires_at = null,
      youcan_webhook_id = null,
      language = 'en',
      business_shipping_mode = 'static',
      business_cost_model = 'seller',
      affiliate_default_product_cost = 0,
      affiliate_default_shipping_cost = 35,
      affiliate_shipping_cost_source = 'fixed',
      meta_is_connected = false,
      reporting_currency = null,
      last_tracking_sync_at = null
  where id = p_workspace_id;

  if not exists (
    select 1 from public.profile_workspaces as membership
    where membership.workspace_id = p_workspace_id
      and membership.profile_id = any(v_owner_ids)
      and membership.is_owner is true
  ) then
    raise exception 'WORKSPACE_RESET_OWNER_VERIFICATION_FAILED' using errcode = '23514';
  end if;

  insert into private.workspace_reset_audit_log (
    workspace_id,
    actor_id,
    deleted_counts,
    retained_tables
  ) values (
    p_workspace_id,
    p_actor_id,
    v_deleted_counts,
    array[
      'workspaces',
      'profiles',
      'owner profile_workspaces',
      'workspace_subscriptions',
      'workspace_subscription_owners',
      'platform audit and security records'
    ]::text[]
  );

  return jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'deleted_counts', v_deleted_counts,
    'deleted_total', (
      select coalesce(sum(value::bigint), 0)
      from jsonb_each_text(v_deleted_counts)
    ),
    'database_verified_empty', true,
    'integrations_disconnected', true,
    'owner_preserved', true,
    'subscription_preserved', true,
    'reset_at', now()
  );
end;
$$;

revoke all on function public.reset_workspace_data_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reset_workspace_data_v2(uuid, uuid, text) to service_role;

commit;
