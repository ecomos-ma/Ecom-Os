-- Targeted fixes for the Meta objects reported by the Supabase advisors.
-- These are additive indexes and service-only access hardening; no Meta data is
-- modified and no legacy fields are dropped.

create index if not exists meta_action_logs_workspace_idx on public.meta_action_logs(workspace_id);
create index if not exists meta_action_logs_actor_user_idx on public.meta_action_logs(actor_user_id);
create index if not exists meta_ad_accounts_connection_idx on public.meta_ad_accounts(connection_id);
create index if not exists meta_ads_product_idx on public.meta_ads(product_id);
create index if not exists meta_bulk_jobs_connection_idx on public.meta_bulk_jobs(connection_id);
create index if not exists meta_bulk_jobs_created_by_idx on public.meta_bulk_jobs(created_by);
create index if not exists meta_businesses_connection_idx on public.meta_businesses(connection_id);
create index if not exists meta_connections_connected_by_idx on public.meta_connections(connected_by);
create index if not exists meta_instagram_accounts_connection_idx on public.meta_instagram_accounts(connection_id);
create index if not exists meta_oauth_states_connection_idx on public.meta_oauth_states(connection_id);
create index if not exists meta_oauth_states_user_idx on public.meta_oauth_states(user_id);
create index if not exists meta_oauth_states_workspace_idx on public.meta_oauth_states(workspace_id);
create index if not exists meta_pages_connection_idx on public.meta_pages(connection_id);
create index if not exists meta_pixels_connection_idx on public.meta_pixels(connection_id);
create index if not exists meta_rule_runs_rule_idx on public.meta_rule_runs(rule_id);
create index if not exists meta_rule_runs_workspace_idx on public.meta_rule_runs(workspace_id);
create index if not exists meta_rules_created_by_idx on public.meta_rules(created_by);
create index if not exists meta_workflow_runs_bulk_job_idx on public.meta_workflow_runs(bulk_job_id);
create index if not exists meta_workflow_runs_created_by_idx on public.meta_workflow_runs(created_by);
create index if not exists meta_workflow_runs_workflow_idx on public.meta_workflow_runs(workflow_id);
create index if not exists meta_workflow_runs_workspace_idx on public.meta_workflow_runs(workspace_id);
create index if not exists meta_workflows_created_by_idx on public.meta_workflows(created_by);

-- These tables are deliberately private to Edge Functions. Policies are
-- service-role-only so RLS remains explicit without granting browser access.
drop policy if exists meta_connections_service_role_only on public.meta_connections;
create policy meta_connections_service_role_only on public.meta_connections
  for all to service_role using (true) with check (true);
drop policy if exists meta_businesses_service_role_only on public.meta_businesses;
create policy meta_businesses_service_role_only on public.meta_businesses
  for all to service_role using (true) with check (true);
drop policy if exists meta_oauth_states_service_role_only on public.meta_oauth_states;
create policy meta_oauth_states_service_role_only on public.meta_oauth_states
  for all to service_role using (true) with check (true);

-- service_role bypasses RLS, so the legacy public policy is unnecessary and
-- causes per-row auth evaluation. Trigger functions and internal RPCs are not
-- public endpoints.
drop policy if exists "Service role full access meta_campaigns" on public.meta_campaigns;
revoke all on function public.meta_resolve_order_attribution() from public, anon, authenticated;
revoke all on function public.get_meta_integration_status(uuid) from public, anon, authenticated;
grant execute on function public.get_meta_integration_status(uuid) to service_role;
revoke all on function public.is_meta_integration_active(uuid) from public, anon, authenticated;
grant execute on function public.is_meta_integration_active(uuid) to service_role;
