alter table public.payment_methods
  add column if not exists qr_code_path text;

update public.platform_settings
set value = jsonb_set(value, '{accent_color}', '"#e73773"'::jsonb, true),
    updated_at = now()
where setting_key = 'payment_checkout'
  and coalesce(value ->> 'accent_color', '') = '#6d3ce7';

alter table public.payment_methods
  drop constraint if exists payment_methods_qr_code_path_check;

alter table public.payment_methods
  add constraint payment_methods_qr_code_path_check
  check (
    qr_code_path is null
    or (
      length(qr_code_path) between 1 and 500
      and qr_code_path ~ '^payment-methods/[0-9a-f-]+/qr-[A-Za-z0-9._-]+$'
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-method-assets',
  'payment-method-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists payment_method_assets_admin_insert on storage.objects;
create policy payment_method_assets_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment-method-assets'
    and (storage.foldername(name))[1] = 'payment-methods'
    and public.has_platform_permission('billing.manage')
  );

drop policy if exists payment_method_assets_admin_delete on storage.objects;
create policy payment_method_assets_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'payment-method-assets'
    and (storage.foldername(name))[1] = 'payment-methods'
    and public.has_platform_permission('billing.manage')
  );

create or replace function public.update_payment_method_qr_v1(
  p_id uuid,
  p_qr_code_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_path text := nullif(trim(coalesce(p_qr_code_path, '')), '');
  method_record public.payment_methods;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_platform_permission('billing.manage') then
    raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if normalized_path is not null
     and normalized_path !~ '^payment-methods/[0-9a-f-]+/qr-[A-Za-z0-9._-]+$' then
    raise exception 'INVALID_PAYMENT_QR_PATH' using errcode = '22023';
  end if;

  update public.payment_methods
  set qr_code_path = normalized_path,
      updated_at = now()
  where id = p_id
  returning * into method_record;

  if method_record.id is null then
    raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.payment_method_history (
    payment_method_id,
    event_type,
    snapshot,
    created_by
  )
  values (
    method_record.id,
    'updated',
    to_jsonb(method_record),
    auth.uid()
  );

  return jsonb_build_object(
    'id', method_record.id,
    'qr_code_path', method_record.qr_code_path,
    'updated_at', method_record.updated_at
  );
end;
$$;

revoke all on function public.update_payment_method_qr_v1(uuid, text) from public, anon;
grant execute on function public.update_payment_method_qr_v1(uuid, text) to authenticated, service_role;
