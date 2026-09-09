begin;

create or replace function public.enforce_active_order_source_integration_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare integration_id uuid;
begin
  if new.source_integration_id is null then return new; end if;
  begin integration_id := new.source_integration_id::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_SOURCE_INTEGRATION' using errcode='22023';
  end;
  perform 1 from public.integrations integration
  where integration.id=integration_id
    and integration.workspace_id=new.workspace_id
    and integration.status='active'
    and (integration.access_token_encrypted is not null or integration.access_token is not null)
  for key share;
  if not found then raise exception 'SOURCE_INTEGRATION_INACTIVE' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_active_order_source_integration_v1() from public,anon,authenticated;
grant execute on function public.enforce_active_order_source_integration_v1() to service_role;

commit;
