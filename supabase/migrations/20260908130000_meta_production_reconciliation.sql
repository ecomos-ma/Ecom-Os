-- Additive production reconciliation for Meta Ads V2.
-- Intentionally omits legacy token clearing and legacy function drops.
-- Production Meta Ads Manager: OAuth, assets, hierarchy, daily reporting,
-- durable jobs, workflows, scaling/rules, audit logs and exact-only COD attribution.
create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function public.meta_can_access_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.role() = 'service_role' or (auth.uid() is not null and exists (
    select 1
    from public.profiles p
    join public.profile_workspaces pw
      on pw.profile_id = p.id and pw.workspace_id = p_workspace_id
    join public.workspaces w on w.id = p_workspace_id
    where p.id = auth.uid()
      and p.is_active is not false and p.deleted_at is null
      and coalesce(lower(p.status), 'active') not in ('inactive','suspended','removed','deleted')
      and w.is_active is not false and w.deleted_at is null
      and coalesce(lower(w.status), 'active') not in ('inactive','suspended','removed','deleted')
      and coalesce(lower(pw.status), 'active') = 'active'
  ));
$$;

create or replace function public.meta_can_manage_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.role() = 'service_role' or (public.meta_can_access_workspace(p_workspace_id) and exists (
    select 1
    from public.profiles p
    join public.profile_workspaces pw
      on pw.profile_id = p.id and pw.workspace_id = p_workspace_id
    where p.id = auth.uid()
      and lower(coalesce(case when pw.is_owner then 'owner' else pw.role end, p.role, ''))
        in ('founder','super_admin','owner','supervisor','admin','manager')
  ));
$$;

revoke all on function public.meta_can_access_workspace(uuid) from public, anon;
revoke all on function public.meta_can_manage_workspace(uuid) from public, anon;
grant execute on function public.meta_can_access_workspace(uuid) to authenticated, service_role;
grant execute on function public.meta_can_manage_workspace(uuid) to authenticated, service_role;

create table if not exists public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null,
  meta_user_id text,
  meta_user_name text,
  access_token_encrypted text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  declined_scopes text[] not null default '{}',
  status text not null default 'connecting'
    check (status in ('connecting','pending_asset_selection','connected','syncing','reauth_required','token_expired','permission_required','sync_failed','disconnected')),
  default_ad_account_id text,
  default_page_id text,
  default_instagram_account_id text,
  default_pixel_id text,
  auto_sync_enabled boolean not null default true,
  automation_enabled boolean not null default false,
  last_health_check_at timestamptz,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_connections_one_active_workspace_idx
  on public.meta_connections(workspace_id) where status <> 'disconnected';

create table if not exists public.meta_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  return_url text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  meta_business_id text not null,
  name text not null,
  verification_status text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, meta_business_id)
);

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  business_id text,
  meta_ad_account_id text not null,
  account_name text not null,
  currency text,
  timezone_name text,
  timezone_offset_hours numeric(5,2),
  account_status integer,
  disable_reason integer,
  amount_spent numeric(16,2),
  balance numeric(16,2),
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_error text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, meta_ad_account_id)
);
create unique index if not exists meta_ad_accounts_one_default_idx
  on public.meta_ad_accounts(workspace_id) where is_default;

create table if not exists public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  business_id text,
  meta_page_id text not null,
  name text not null,
  category text,
  picture_url text,
  is_default boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, meta_page_id)
);
create unique index if not exists meta_pages_one_default_idx
  on public.meta_pages(workspace_id) where is_default;

create table if not exists public.meta_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  meta_instagram_account_id text not null,
  page_id text,
  username text,
  name text,
  profile_picture_url text,
  followers_count bigint,
  is_default boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, meta_instagram_account_id)
);
create unique index if not exists meta_instagram_accounts_one_default_idx
  on public.meta_instagram_accounts(workspace_id) where is_default;

create table if not exists public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  ad_account_id text,
  meta_pixel_id text not null,
  name text not null,
  last_fired_time timestamptz,
  is_unavailable boolean not null default false,
  is_default boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, meta_pixel_id)
);
create unique index if not exists meta_pixels_one_default_idx
  on public.meta_pixels(workspace_id) where is_default;

-- Extend the legacy dashboard table in place so existing consumers keep working.
alter table public.meta_campaigns add column if not exists ad_account_id text;
alter table public.meta_campaigns add column if not exists name text;
alter table public.meta_campaigns add column if not exists objective text;
alter table public.meta_campaigns add column if not exists effective_status text;
alter table public.meta_campaigns add column if not exists buying_type text;
alter table public.meta_campaigns add column if not exists special_ad_categories text[] not null default '{}';
alter table public.meta_campaigns add column if not exists daily_budget numeric(16,2);
alter table public.meta_campaigns add column if not exists lifetime_budget numeric(16,2);
alter table public.meta_campaigns add column if not exists budget_remaining numeric(16,2);
alter table public.meta_campaigns add column if not exists start_time timestamptz;
alter table public.meta_campaigns add column if not exists stop_time timestamptz;
alter table public.meta_campaigns add column if not exists configured_status text;
alter table public.meta_campaigns add column if not exists raw_data jsonb not null default '{}'::jsonb;
alter table public.meta_campaigns add column if not exists synced_at timestamptz not null default now();

create table if not exists public.meta_adsets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  meta_campaign_id text not null,
  meta_adset_id text not null,
  name text not null,
  status text not null default 'UNKNOWN',
  effective_status text,
  optimization_goal text,
  billing_event text,
  bid_strategy text,
  bid_amount numeric(16,2),
  daily_budget numeric(16,2),
  lifetime_budget numeric(16,2),
  budget_remaining numeric(16,2),
  targeting_summary jsonb not null default '{}'::jsonb,
  promoted_object jsonb not null default '{}'::jsonb,
  placements jsonb not null default '{}'::jsonb,
  start_time timestamptz,
  end_time timestamptz,
  attribution_spec jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, ad_account_id, meta_adset_id)
);

create table if not exists public.meta_creatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  meta_creative_id text not null,
  name text,
  creative_type text,
  image_hash text,
  image_url text,
  video_id text,
  thumbnail_url text,
  primary_text text,
  headline text,
  description text,
  call_to_action text,
  destination_url text,
  product_url text,
  page_id text,
  instagram_account_id text,
  object_story_spec jsonb not null default '{}'::jsonb,
  asset_feed_spec jsonb not null default '{}'::jsonb,
  degrees_of_freedom_spec jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, ad_account_id, meta_creative_id)
);

create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  meta_campaign_id text not null,
  meta_adset_id text not null,
  meta_ad_id text not null,
  meta_creative_id text,
  name text not null,
  status text not null default 'UNKNOWN',
  effective_status text,
  destination_url text,
  product_id uuid references public.products(id) on delete set null,
  tracking_specs jsonb not null default '[]'::jsonb,
  conversion_specs jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, ad_account_id, meta_ad_id)
);

create table if not exists public.meta_insights_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ad_account_id text not null,
  reporting_level text not null check (reporting_level in ('account','campaign','adset','ad')),
  entity_id text not null,
  report_date date not null,
  spend numeric(16,4) not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  unique_clicks bigint not null default 0,
  ctr numeric(12,6) not null default 0,
  cpc numeric(16,6) not null default 0,
  cpm numeric(16,6) not null default 0,
  frequency numeric(12,6) not null default 0,
  actions jsonb not null default '[]'::jsonb,
  action_values jsonb not null default '[]'::jsonb,
  cost_per_action_type jsonb not null default '[]'::jsonb,
  purchases numeric(16,4) not null default 0,
  purchase_value numeric(16,4) not null default 0,
  leads numeric(16,4) not null default 0,
  video_plays bigint not null default 0,
  video_p25_watched_actions jsonb not null default '[]'::jsonb,
  video_p50_watched_actions jsonb not null default '[]'::jsonb,
  video_p75_watched_actions jsonb not null default '[]'::jsonb,
  video_p95_watched_actions jsonb not null default '[]'::jsonb,
  video_p100_watched_actions jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, ad_account_id, reporting_level, entity_id, report_date)
);

create table if not exists public.meta_bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  ad_account_id text not null,
  created_by uuid references auth.users(id) on delete set null,
  job_type text not null check (job_type in ('bulk_launch','bulk_edit','duplicate','vertical_scale','horizontal_scale','creative_scale','rule_action')),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','partial_failure','failed','cancelled')),
  create_status text not null default 'PAUSED' check (create_status in ('PAUSED','ACTIVE')),
  configuration jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  total_items integer not null default 0,
  processed_items integer not null default 0,
  succeeded_items integer not null default 0,
  failed_items integer not null default 0,
  checkpoint integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_run_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.meta_bulk_job_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.meta_bulk_jobs(id) on delete cascade,
  item_index integer not null,
  item_type text not null,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  meta_object_id text,
  parent_meta_object_id text,
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text,
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, item_index),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.meta_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  configuration jsonb not null default '{}'::jsonb,
  is_template boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.meta_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid references public.meta_workflows(id) on delete set null,
  bulk_job_id uuid references public.meta_bulk_jobs(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  resolved_configuration jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.meta_workflow_runs add column if not exists error text;

create table if not exists public.meta_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  entity_level text not null check (entity_level in ('campaign','adset','ad','product','creative')),
  conditions jsonb not null default '[]'::jsonb,
  action jsonb not null default '{}'::jsonb,
  schedule_minutes integer not null default 60 check (schedule_minutes between 15 and 10080),
  lookback_days integer not null default 3 check (lookback_days between 1 and 90),
  stale_after_minutes integer not null default 180 check (stale_after_minutes between 15 and 10080),
  max_budget_increase_percent_day numeric(6,2) not null default 30 check (max_budget_increase_percent_day between 0 and 200),
  max_duplicates_day integer not null default 3 check (max_duplicates_day between 0 and 100),
  dry_run boolean not null default true,
  enabled boolean not null default false,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.meta_rule_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_id uuid not null references public.meta_rules(id) on delete cascade,
  status text not null check (status in ('running','dry_run','completed','partial_failure','failed','skipped')),
  evaluated_entities integer not null default 0,
  matched_entities integer not null default 0,
  actions_taken integer not null default 0,
  stale_data_guard_triggered boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.meta_action_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('user','bulk_job','workflow','rule','sync','system')),
  source_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  result text not null check (result in ('pending','success','failed','skipped','dry_run')),
  provider_request_id text,
  error_category text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists fbclid text,
  add column if not exists meta_ad_account_id text,
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text,
  add column if not exists meta_creative_id text,
  add column if not exists meta_attribution_status text;

alter table public.orders drop constraint if exists orders_meta_attribution_status_check;
alter table public.orders add constraint orders_meta_attribution_status_check
  check (meta_attribution_status is null or meta_attribution_status in ('Exact','UTM matched','Source only','Unattributed'));

create index if not exists meta_oauth_states_expiry_idx on public.meta_oauth_states(expires_at) where consumed_at is null;
create index if not exists meta_connections_workspace_status_idx on public.meta_connections(workspace_id, status);
create index if not exists meta_ad_accounts_enabled_idx on public.meta_ad_accounts(workspace_id, is_enabled, meta_ad_account_id);
create index if not exists meta_campaigns_lookup_idx on public.meta_campaigns(workspace_id, ad_account_id, meta_campaign_id);
create index if not exists meta_adsets_lookup_idx on public.meta_adsets(workspace_id, ad_account_id, meta_campaign_id, meta_adset_id);
create index if not exists meta_ads_lookup_idx on public.meta_ads(workspace_id, ad_account_id, meta_adset_id, meta_ad_id);
create index if not exists meta_creatives_lookup_idx on public.meta_creatives(workspace_id, ad_account_id, meta_creative_id);
create index if not exists meta_insights_daily_date_idx on public.meta_insights_daily(workspace_id, ad_account_id, report_date desc);
create index if not exists meta_insights_daily_entity_idx on public.meta_insights_daily(workspace_id, reporting_level, entity_id, report_date desc);
create index if not exists meta_bulk_jobs_queue_idx on public.meta_bulk_jobs(status, next_run_at, created_at) where status in ('queued','processing');
create index if not exists meta_bulk_job_items_queue_idx on public.meta_bulk_job_items(job_id, status, next_retry_at, item_index) where status in ('queued','failed');
create index if not exists meta_rules_due_idx on public.meta_rules(enabled, next_evaluation_at) where enabled;
-- A non-partial unique index is intentional: PostgreSQL still permits multiple
-- NULLs, while PostgREST can infer this index for `on_conflict=bulk_job_id`.

create or replace function public.meta_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['meta_connections','meta_ad_accounts','meta_campaigns','meta_adsets','meta_ads','meta_creatives','meta_bulk_jobs','meta_bulk_job_items','meta_workflows','meta_rules']
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.meta_set_updated_at()', 'set_' || table_name || '_updated_at', table_name);
  end loop;
end $$;

create or replace function public.enqueue_meta_bulk_job(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_ad_account_id text,
  p_created_by uuid,
  p_job_type text,
  p_idempotency_key text,
  p_create_status text,
  p_configuration jsonb,
  p_preview jsonb,
  p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare job_row public.meta_bulk_jobs; existing_row public.meta_bulk_jobs; item_count integer;
begin
  item_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if item_count < 1 or item_count > 1000 then raise exception 'Provide between 1 and 1000 bulk items'; end if;
  select * into existing_row from public.meta_bulk_jobs where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('deduplicated',true,'job',to_jsonb(existing_row)); end if;
  insert into public.meta_bulk_jobs(workspace_id,connection_id,ad_account_id,created_by,job_type,idempotency_key,create_status,configuration,preview,total_items)
  values(p_workspace_id,p_connection_id,p_ad_account_id,p_created_by,p_job_type,p_idempotency_key,p_create_status,coalesce(p_configuration,'{}'::jsonb),coalesce(p_preview,'{}'::jsonb),item_count)
  returning * into job_row;
  insert into public.meta_bulk_job_items(workspace_id,job_id,item_index,item_type,idempotency_key,payload)
  select p_workspace_id,job_row.id,ordinality-1,
    case when p_job_type='bulk_launch' then 'ad' else coalesce(item->>'entity_type','ad') end,
    p_idempotency_key||':'||(ordinality-1),item
  from jsonb_array_elements(p_items) with ordinality expanded(item,ordinality);
  return jsonb_build_object('deduplicated',false,'job',to_jsonb(job_row));
exception when unique_violation then
  select * into existing_row from public.meta_bulk_jobs where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('deduplicated',true,'job',to_jsonb(existing_row)); end if;
  raise;
end;
$$;
revoke all on function public.enqueue_meta_bulk_job(uuid,uuid,text,uuid,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_meta_bulk_job(uuid,uuid,text,uuid,text,text,text,jsonb,jsonb,jsonb) to service_role;

revoke all on public.meta_connections from anon, authenticated;
alter table public.meta_oauth_states enable row level security;
revoke all on public.meta_oauth_states from public, anon, authenticated;
drop policy if exists "Authenticated users can read meta_campaigns" on public.meta_campaigns;
drop policy if exists "Workspace isolation for meta_campaigns" on public.meta_campaigns;
drop policy if exists "Service role can upsert meta_campaigns" on public.meta_campaigns;

create or replace function public.meta_resolve_order_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare matched_campaign_id text; campaign_matches integer;
begin
  if new.workspace_id is null then return new; end if;
  if lower(coalesce(new.utm_source, '')) in ('facebook','fb','instagram','ig','meta')
     or lower(coalesce(new.source_platform, '')) in ('facebook','instagram','meta')
     or new.fbclid is not null or new.meta_campaign_id is not null or new.meta_adset_id is not null or new.meta_ad_id is not null then
    new.source_platform := 'meta';
  else
    return new;
  end if;
  if new.meta_ad_id is not null or new.meta_adset_id is not null or new.meta_campaign_id is not null then
    new.meta_attribution_status := 'Exact'; return new;
  end if;
  if nullif(trim(coalesce(new.utm_campaign, '')), '') is not null then
    select count(*), min(c.meta_campaign_id) into campaign_matches, matched_campaign_id
    from public.meta_campaigns c
    where c.workspace_id = new.workspace_id
      and (c.meta_campaign_id = new.utm_campaign or lower(coalesce(c.name, c.campaign_name)) = lower(new.utm_campaign));
    if campaign_matches = 1 then
      new.meta_campaign_id := matched_campaign_id;
      new.meta_attribution_status := 'UTM matched'; return new;
    end if;
  end if;
  new.meta_attribution_status := case when new.fbclid is not null or nullif(trim(coalesce(new.utm_campaign, '')), '') is not null then 'Unattributed' else 'Source only' end;
  return new;
end;
$$;

drop trigger if exists resolve_meta_order_attribution on public.orders;
create trigger resolve_meta_order_attribution
before insert or update of source_platform, utm_source, utm_campaign, fbclid, meta_campaign_id, meta_adset_id, meta_ad_id
on public.orders for each row execute function public.meta_resolve_order_attribution();

create or replace function public.refresh_meta_order_attribution(p_workspace_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.orders set utm_campaign = utm_campaign
  where workspace_id = p_workspace_id and (
    source_platform = 'meta' or fbclid is not null or meta_campaign_id is not null
    or lower(coalesce(utm_source, '')) in ('facebook','fb','instagram','ig','meta')
  );
  get diagnostics affected = row_count;
  update public.meta_ads ad
  set product_id = linked.product_id, updated_at = now()
  from (
    select o.workspace_id, o.meta_ad_id, min(product.id::text)::uuid product_id
    from public.orders o
    join public.products product on product.workspace_id=o.workspace_id and product.sku=o.sku
    where o.workspace_id=p_workspace_id and o.meta_ad_id is not null and o.meta_attribution_status in ('Exact','UTM matched')
    group by o.workspace_id, o.meta_ad_id
    having count(distinct product.id)=1
  ) linked
  where ad.workspace_id=linked.workspace_id and ad.meta_ad_id=linked.meta_ad_id
    and ad.product_id is distinct from linked.product_id;
  return affected;
end;
$$;
revoke all on function public.refresh_meta_order_attribution(uuid) from public, anon, authenticated;
grant execute on function public.refresh_meta_order_attribution(uuid) to service_role;

create or replace function public.get_meta_integration_status(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if not public.meta_can_access_workspace(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_REQUIRED'; end if;
  select jsonb_build_object(
    'state', coalesce(c.status, 'not_connected'),
    'connection', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'status', c.status, 'meta_user_id', c.meta_user_id, 'meta_user_name', c.meta_user_name,
      'granted_scopes', c.granted_scopes, 'declined_scopes', c.declined_scopes,
      'default_ad_account_id', c.default_ad_account_id, 'default_page_id', c.default_page_id,
      'default_instagram_account_id', c.default_instagram_account_id, 'default_pixel_id', c.default_pixel_id,
      'auto_sync_enabled', c.auto_sync_enabled, 'automation_enabled', c.automation_enabled,
      'token_expires_at', c.token_expires_at, 'last_health_check_at', c.last_health_check_at,
      'last_sync_at', c.last_sync_at, 'last_successful_sync_at', c.last_successful_sync_at,
      'last_sync_error', c.last_sync_error, 'created_at', c.created_at
    ) end,
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id',b.meta_business_id,'name',b.name,'verification_status',b.verification_status) order by b.name) from public.meta_businesses b where b.workspace_id=p_workspace_id and b.connection_id=c.id), '[]'::jsonb),
    'ad_accounts', coalesce((select jsonb_agg(jsonb_build_object('id',a.meta_ad_account_id,'name',a.account_name,'currency',a.currency,'timezone',a.timezone_name,'account_status',a.account_status,'is_default',a.is_default,'is_enabled',a.is_enabled,'last_sync_at',a.last_sync_at,'last_sync_error',a.last_sync_error) order by a.account_name) from public.meta_ad_accounts a where a.workspace_id=p_workspace_id and a.connection_id=c.id), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('id',p.meta_page_id,'name',p.name,'category',p.category,'picture_url',p.picture_url,'is_default',p.is_default) order by p.name) from public.meta_pages p where p.workspace_id=p_workspace_id and p.connection_id=c.id), '[]'::jsonb),
    'instagram_accounts', coalesce((select jsonb_agg(jsonb_build_object('id',i.meta_instagram_account_id,'username',i.username,'name',i.name,'page_id',i.page_id,'profile_picture_url',i.profile_picture_url,'is_default',i.is_default) order by coalesce(i.username,i.name)) from public.meta_instagram_accounts i where i.workspace_id=p_workspace_id and i.connection_id=c.id), '[]'::jsonb),
    'pixels', coalesce((select jsonb_agg(jsonb_build_object('id',x.meta_pixel_id,'name',x.name,'ad_account_id',x.ad_account_id,'last_fired_time',x.last_fired_time,'is_default',x.is_default,'is_unavailable',x.is_unavailable) order by x.name) from public.meta_pixels x where x.workspace_id=p_workspace_id and x.connection_id=c.id), '[]'::jsonb)
  ) into result
  from (select 1) seed
  left join lateral (
    select * from public.meta_connections candidate where candidate.workspace_id=p_workspace_id
    order by (candidate.status <> 'disconnected') desc, candidate.created_at desc limit 1
  ) c on true;
  return result;
end;
$$;
revoke all on function public.get_meta_integration_status(uuid) from public, anon;
grant execute on function public.get_meta_integration_status(uuid) to authenticated, service_role;

create or replace function public.get_meta_cod_metrics(p_workspace_id uuid, p_since date, p_until date)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if not public.meta_can_access_workspace(p_workspace_id) then raise exception 'WORKSPACE_ACCESS_REQUIRED'; end if;
  select coalesce(jsonb_object_agg(entity_id, metrics), '{}'::jsonb) into result
  from (
    select entity_id,
      jsonb_build_object(
        'orders', count(*),
        'confirmed', count(*) filter (where o.order_status in ('CONFIRMED','READY','OUT_FOR_DELIVERY','DELIVERED','COMING_BACK')),
        'shipped', count(*) filter (where o.order_status in ('OUT_FOR_DELIVERY','DELIVERED')),
        'delivered', count(*) filter (where o.order_status = 'DELIVERED'),
        'returned', count(*) filter (where o.order_status = 'COMING_BACK'),
        'revenue', coalesce(sum(o.total) filter (where o.order_status = 'DELIVERED'),0),
        -- This is the order contribution after product, shipping and configured
        -- operational fees. The caller subtracts the matching Meta spend so the
        -- displayed/rule-engine value follows Ecom OS's profit engine exactly.
        'net_profit',
          coalesce(sum(
            o.total
            - case when coalesce(w.business_cost_model,'seller')='affiliate' then 0 else coalesce(o.shipping_cost,0) end
            - case
                when coalesce(item_cost.item_count,0) > 0 then coalesce(item_cost.cost,0)
                else coalesce(p.cost,w.business_product_cost,0)
              end
          ) filter (where o.order_status = 'DELIVERED'),0)
          - coalesce(sum(operational_fees.amount),0),
        'attribution_reliable', true
      ) metrics
    from (
      select source.*, public.normalize_status(coalesce(source.shipping_status, source.delivery_status, source.status, '')) order_status, ids.entity_id
      from public.orders source
      cross join lateral (values (source.meta_campaign_id),(source.meta_adset_id),(source.meta_ad_id)) ids(entity_id)
      where ids.entity_id is not null
    ) o
    join public.workspaces w on w.id=o.workspace_id
    left join lateral (
      select count(*) item_count,
        coalesce(sum(greatest(coalesce(item.quantity,1),1) * coalesce(product.cost,0)),0) cost
      from public.order_items item
      left join public.products product
        on product.id=item.product_id and product.workspace_id=o.workspace_id
      where item.workspace_id=o.workspace_id and item.order_id=o."Order ID"
    ) item_cost on true
    left join lateral (select product.cost from public.products product where product.workspace_id=o.workspace_id and product.sku=o.sku order by product.created_at desc nulls last limit 1) p on true
    left join lateral (
      select coalesce(sum(rule.amount),0) amount
      from public.workspace_cost_rules rule
      where rule.workspace_id=o.workspace_id and rule.enabled
        and (
          rule.trigger='entered'
          or (rule.trigger='confirmed' and o.order_status in ('CONFIRMED','READY','OUT_FOR_DELIVERY','DELIVERED','COMING_BACK'))
          or (rule.trigger='delivered' and o.order_status='DELIVERED')
        )
    ) operational_fees on true
    where o.workspace_id=p_workspace_id and o.meta_attribution_status in ('Exact','UTM matched')
      and o.created_at >= p_since::timestamptz and o.created_at < (p_until + 1)::timestamptz
    group by entity_id
  ) attributed;
  return coalesce(result, '{}'::jsonb);
end;
$$;
revoke all on function public.get_meta_cod_metrics(uuid,date,date) from public, anon;
grant execute on function public.get_meta_cod_metrics(uuid,date,date) to authenticated, service_role;

-- Readable operational tables are RLS protected; all mutations go through authenticated Edge Functions.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'meta_connections','meta_businesses','meta_ad_accounts','meta_pages','meta_instagram_accounts','meta_pixels',
    'meta_campaigns','meta_adsets','meta_ads','meta_creatives','meta_insights_daily','meta_bulk_jobs',
    'meta_bulk_job_items','meta_workflows','meta_workflow_runs','meta_rules','meta_rule_runs','meta_action_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

grant select on public.meta_ad_accounts, public.meta_pages, public.meta_instagram_accounts, public.meta_pixels,
  public.meta_campaigns, public.meta_adsets, public.meta_ads, public.meta_creatives, public.meta_insights_daily,
  public.meta_bulk_jobs, public.meta_bulk_job_items, public.meta_workflows, public.meta_workflow_runs,
  public.meta_rules, public.meta_rule_runs, public.meta_action_logs to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'meta_ad_accounts','meta_pages','meta_instagram_accounts','meta_pixels','meta_campaigns','meta_adsets','meta_ads',
    'meta_creatives','meta_insights_daily','meta_bulk_jobs','meta_bulk_job_items','meta_workflows','meta_workflow_runs',
    'meta_rules','meta_rule_runs','meta_action_logs'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.meta_can_access_workspace(workspace_id)))', table_name || '_select', table_name);
  end loop;
end $$;

create or replace function public.is_meta_integration_active(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select public.meta_can_access_workspace(p_workspace_id) and exists (
    select 1 from public.meta_connections c where c.workspace_id=p_workspace_id and c.status in ('connected','syncing','sync_failed','permission_required') and c.access_token_encrypted is not null
  );
$$;
revoke all on function public.is_meta_integration_active(uuid) from public, anon;
grant execute on function public.is_meta_integration_active(uuid) to authenticated, service_role;

create or replace function public.deactivate_meta_integration(p_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.meta_connections set access_token_encrypted=null,status='disconnected',automation_enabled=false,disconnected_at=now()
  where workspace_id=p_workspace_id and status<>'disconnected';
end;
$$;
revoke all on function public.deactivate_meta_integration(uuid) from public, anon, authenticated;
grant execute on function public.deactivate_meta_integration(uuid) to service_role;

-- Optional scheduler installer. No URL or secret is stored in migration SQL.
create or replace function private.install_meta_cron_jobs()
returns void language plpgsql security definer set search_path = private, public, vault, cron as $$
declare base_url text; api_key text; cron_secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into api_key from vault.decrypted_secrets where name='publishable_key' limit 1;
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name='meta_cron_secret' limit 1;
  if base_url is null or api_key is null or cron_secret is null then raise exception 'Create Vault secrets project_url, publishable_key, and meta_cron_secret first'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('meta-sync-recent','meta-bulk-worker','meta-rules-engine');
  perform cron.schedule('meta-sync-recent','*/20 * * * *',format($job$select net.http_post(url:=%L,headers:=%L::jsonb,body:='{"scheduled":true,"days":3}'::jsonb,timeout_milliseconds:=55000);$job$,base_url||'/functions/v1/meta-sync',jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text));
  perform cron.schedule('meta-bulk-worker','* * * * *',format($job$select net.http_post(url:=%L,headers:=%L::jsonb,body:='{"scheduled":true}'::jsonb,timeout_milliseconds:=55000);$job$,base_url||'/functions/v1/meta-bulk',jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text));
  perform cron.schedule('meta-rules-engine','*/15 * * * *',format($job$select net.http_post(url:=%L,headers:=%L::jsonb,body:='{"scheduled":true}'::jsonb,timeout_milliseconds:=55000);$job$,base_url||'/functions/v1/meta-rules',jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret)::text));
end;
$$;
revoke all on function private.install_meta_cron_jobs() from public, anon, authenticated;
grant execute on function private.install_meta_cron_jobs() to service_role;


