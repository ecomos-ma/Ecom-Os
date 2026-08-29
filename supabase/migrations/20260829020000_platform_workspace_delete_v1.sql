BEGIN;

create or replace function public.platform_delete_workspace_v1(
  p_workspace_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_name_value text;
begin
  if not public.has_platform_permission('workspaces.manage') then
    raise exception 'WORKSPACES_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'WORKSPACE_ID_REQUIRED' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'WORKSPACE_DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select workspace.name
    into workspace_name_value
  from public.workspaces workspace
  where workspace.id = p_workspace_id
  for update;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if to_regclass('public.profile_workspaces') is not null then
    delete from public.profile_workspaces where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.workspace_subscriptions') is not null then
    delete from public.workspace_subscriptions where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.orders') is not null then
    delete from public.orders where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.order_items') is not null then
    delete from public.order_items where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.customers') is not null then
    delete from public.customers where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.products') is not null then
    delete from public.products where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.integrations') is not null then
    delete from public.integrations where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.support_tickets') is not null then
    delete from public.support_tickets where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.notifications') is not null then
    delete from public.notifications where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.ai_generation_jobs') is not null then
    delete from public.ai_generation_jobs where workspace_id = p_workspace_id;
  end if;

  if to_regclass('public.whatsapp_settings') is not null then
    delete from public.whatsapp_settings where workspace_id = p_workspace_id;
  end if;

  delete from public.workspaces where id = p_workspace_id;

  perform public.record_platform_audit(
    'workspace_deleted',
    'workspace',
    p_workspace_id,
    workspace_name_value,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.platform_delete_workspace_v1(uuid, text) from public, anon;
grant execute on function public.platform_delete_workspace_v1(uuid, text) to authenticated, service_role;

COMMIT;
