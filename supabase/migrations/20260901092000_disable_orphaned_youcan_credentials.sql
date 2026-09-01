begin;

-- Any legacy credential set that could not be mapped to an owned canonical
-- integration is disabled. Historical orders remain untouched.
update public.integration_sync_state sync
set enabled = false, sync_lock = null, updated_at = now()
where sync.provider = 'youcan'
  and not exists (
    select 1 from public.integrations integration
    where integration.workspace_id = sync.workspace_id
      and integration.provider = 'youcan'
      and integration.status = 'active'
  );

delete from public.youcan_tokens token
where not exists (
  select 1 from public.integrations integration
  where integration.workspace_id = token.workspace_id
    and integration.provider = 'youcan'
    and integration.status = 'active'
);

update public.workspaces workspace
set youcan_access_token = null,
    youcan_refresh_token = null,
    youcan_token_expires_at = null,
    youcan_webhook_id = null
where (workspace.youcan_access_token is not null or workspace.youcan_webhook_id is not null)
  and not exists (
    select 1 from public.integrations integration
    where integration.workspace_id = workspace.id
      and integration.provider = 'youcan'
      and integration.status = 'active'
  );

commit;
