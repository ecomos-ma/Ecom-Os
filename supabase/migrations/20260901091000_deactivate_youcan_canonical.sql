begin;

-- Keep the legacy generic disconnect RPC safe for older clients. It now
-- revokes the canonical integration as well, so no old caller can leave the
-- importer active.
create or replace function public.deactivate_youcan_integration(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and not public.has_workspace_role(p_workspace_id, array['owner','admin','manager']) then
    raise exception 'WORKSPACE_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  update public.integrations
  set status = 'revoked', disconnected_at = now()
  where workspace_id = p_workspace_id and provider = 'youcan';

  update public.workspaces
  set youcan_access_token = null,
      youcan_refresh_token = null,
      youcan_token_expires_at = null,
      youcan_webhook_id = null
  where id = p_workspace_id;

  delete from public.youcan_tokens where workspace_id = p_workspace_id;
  delete from public.youcan_credentials where workspace_id = p_workspace_id;
  update public.integration_sync_state
  set enabled = false, sync_lock = null, updated_at = now()
  where workspace_id = p_workspace_id and provider = 'youcan';
end;
$$;

revoke all on function public.deactivate_youcan_integration(uuid) from public, anon;
grant execute on function public.deactivate_youcan_integration(uuid) to authenticated, service_role;

commit;
