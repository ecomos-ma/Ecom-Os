-- Preserve any usable V2 connection during a reauthorization attempt. Legacy
-- raw workspace tokens are deliberately not copied into the V2 credential
-- store; they are marked for an explicit encrypted reconnect instead.
insert into public.meta_connections (
  workspace_id,
  status,
  auto_sync_enabled,
  automation_enabled,
  last_sync_error
)
select
  w.id,
  'reauth_required',
  false,
  false,
  'Secure reconnect required for this legacy Meta connection.'
from public.workspaces w
where nullif(btrim(w.meta_access_token), '') is not null
  and not exists (
    select 1
    from public.meta_connections c
    where c.workspace_id = w.id
      and c.status <> 'disconnected'
  );
