create or replace function public.delete_payment_method_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  method_record public.payment_methods;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_platform_permission('billing.manage') then
    raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  select *
  into method_record
  from public.payment_methods
  where id = p_id
  for update;

  if method_record.id is null then
    raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.payment_methods
  where id = method_record.id;

  return jsonb_build_object(
    'id', method_record.id,
    'display_name', method_record.display_name,
    'qr_code_path', method_record.qr_code_path,
    'deleted', true
  );
end;
$$;

revoke all on function public.delete_payment_method_v1(uuid) from public, anon;
grant execute on function public.delete_payment_method_v1(uuid) to authenticated, service_role;
