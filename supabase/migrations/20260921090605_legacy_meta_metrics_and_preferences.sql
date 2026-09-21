-- Meta's campaign endpoint and its insights endpoint expose different data.
-- Keep the raw, selected insight values alongside the normalized legacy columns
-- so the UI can render the exact metrics a user selects without inventing a
-- cross-object "results" calculation.
alter table public.meta_legacy_campaigns
  add column if not exists meta_metrics jsonb not null default '{}'::jsonb;

create table if not exists public.meta_legacy_metric_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dashboard_metrics text[] not null default array['spend', 'reach', 'impressions', 'inline_link_clicks', 'purchases']::text[],
  table_metrics text[] not null default array['spend', 'reach', 'impressions', 'inline_link_clicks', 'outbound_clicks', 'ctr', 'cpc', 'cpm']::text[],
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id),
  check (cardinality(dashboard_metrics) between 1 and 5),
  check (cardinality(table_metrics) between 1 and 12)
);

alter table public.meta_legacy_metric_preferences enable row level security;

grant select, insert, update on public.meta_legacy_metric_preferences to authenticated;

drop policy if exists meta_legacy_metric_preferences_select on public.meta_legacy_metric_preferences;
create policy meta_legacy_metric_preferences_select
  on public.meta_legacy_metric_preferences
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.meta_can_access_workspace(workspace_id))
  );

drop policy if exists meta_legacy_metric_preferences_insert on public.meta_legacy_metric_preferences;
create policy meta_legacy_metric_preferences_insert
  on public.meta_legacy_metric_preferences
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.meta_can_access_workspace(workspace_id))
  );

drop policy if exists meta_legacy_metric_preferences_update on public.meta_legacy_metric_preferences;
create policy meta_legacy_metric_preferences_update
  on public.meta_legacy_metric_preferences
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.meta_can_access_workspace(workspace_id))
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.meta_can_access_workspace(workspace_id))
  );
