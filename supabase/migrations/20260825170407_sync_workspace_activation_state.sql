begin;

-- Historical admin flows could update status without updating is_active. Both
-- fields are authorization inputs, so repair contradictory rows atomically.
update public.workspaces
set is_active = (status = 'active')
where status in ('active', 'suspended', 'deleted')
  and is_active is distinct from (status = 'active');

create or replace function public.founder_set_workspace_status(
  p_workspace_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_founder() then
    raise exception 'FOUNDER_ACCESS_REQUIRED';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_WORKSPACE_STATUS';
  end if;

  update public.workspaces
  set
    status = p_status,
    is_active = (p_status = 'active')
  where id = p_workspace_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  perform public.founder_audit(
    'workspace_' || p_status,
    'workspace',
    p_workspace_id,
    p_reason
  );
end;
$$;

revoke all on function public.founder_set_workspace_status(uuid, text, text) from public, anon;
grant execute on function public.founder_set_workspace_status(uuid, text, text) to authenticated, service_role;

commit;
