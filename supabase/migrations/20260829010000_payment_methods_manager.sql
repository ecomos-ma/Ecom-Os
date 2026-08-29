create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  bank_name text,
  account_name text,
  rib text,
  iban text,
  instructions text not null default 'Make the bank transfer using the details below, then upload your receipt.',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_slug_check check (trim(slug) <> ''),
  constraint payment_methods_display_name_check check (trim(display_name) <> ''),
  constraint payment_methods_sort_order_check check (sort_order >= 0)
);
create index if not exists payment_methods_active_idx
  on public.payment_methods(is_active, archived_at, sort_order, created_at desc);

create table if not exists public.payment_method_history (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  event_type text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_method_history_event_type_check check (event_type in ('created', 'updated', 'archived', 'reactivated'))
);
create index if not exists payment_method_history_payment_method_idx
  on public.payment_method_history(payment_method_id, created_at desc);

alter table public.payment_methods enable row level security;
alter table public.payment_method_history enable row level security;

create policy payment_methods_authenticated_select
  on public.payment_methods for select to authenticated
  using (is_active = true and archived_at is null);

create policy payment_methods_admin_manage
  on public.payment_methods for all to authenticated
  using (public.has_platform_permission('billing.manage'))
  with check (public.has_platform_permission('billing.manage'));

create policy payment_method_history_admin_read
  on public.payment_method_history for select to authenticated
  using (public.has_platform_permission('billing.manage'));

revoke all on public.payment_methods from anon, authenticated;
revoke all on public.payment_method_history from anon, authenticated;
grant select on public.payment_methods to authenticated;
grant select on public.payment_method_history to authenticated;
grant insert, update, delete on public.payment_methods to service_role;
grant insert, update, delete on public.payment_method_history to service_role;

create or replace function public.upsert_payment_method_v1(
  p_id uuid default null,
  p_slug text default null,
  p_display_name text default null,
  p_bank_name text default null,
  p_account_name text default null,
  p_rib text default null,
  p_iban text default null,
  p_instructions text default null,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_slug text;
  normalized_name text;
  record_id uuid;
  method_record public.payment_methods;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.has_platform_permission('billing.manage') then
    raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  normalized_slug := lower(trim(coalesce(p_slug, '')));
  if normalized_slug = '' then
    normalized_slug := lower(regexp_replace(trim(coalesce(p_display_name, '')), '[^a-z0-9]+', '-', 'g'));
  end if;
  normalized_slug := trim(both '-' from normalized_slug);
  if normalized_slug = '' then
    raise exception 'PAYMENT_METHOD_SLUG_REQUIRED' using errcode = '22023';
  end if;

  normalized_name := trim(coalesce(p_display_name, ''));
  if normalized_name = '' then
    raise exception 'PAYMENT_METHOD_NAME_REQUIRED' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.payment_methods (
      slug,
      display_name,
      bank_name,
      account_name,
      rib,
      iban,
      instructions,
      sort_order,
      is_active,
      archived_at,
      created_by,
      updated_at
    ) values (
      normalized_slug,
      normalized_name,
      nullif(trim(coalesce(p_bank_name, '')), ''),
      nullif(trim(coalesce(p_account_name, '')), ''),
      nullif(trim(coalesce(p_rib, '')), ''),
      nullif(trim(coalesce(p_iban, '')), ''),
      nullif(trim(coalesce(p_instructions, '')), '') || 'Make the bank transfer using the details below, then upload your receipt.',
      greatest(coalesce(p_sort_order, 100), 0),
      coalesce(p_is_active, true),
      null,
      auth.uid(),
      now()
    ) returning * into method_record;
    record_id := method_record.id;
    insert into public.payment_method_history(payment_method_id, event_type, snapshot, created_by)
    values (record_id, 'created', to_jsonb(method_record), auth.uid());
  else
    update public.payment_methods set
      slug = normalized_slug,
      display_name = normalized_name,
      bank_name = nullif(trim(coalesce(p_bank_name, '')), ''),
      account_name = nullif(trim(coalesce(p_account_name, '')), ''),
      rib = nullif(trim(coalesce(p_rib, '')), ''),
      iban = nullif(trim(coalesce(p_iban, '')), ''),
      instructions = nullif(trim(coalesce(p_instructions, '')), ''),
      sort_order = greatest(coalesce(p_sort_order, 100), 0),
      is_active = coalesce(p_is_active, true),
      archived_at = case when coalesce(p_is_active, true) then null else archived_at end,
      updated_at = now(),
      created_by = coalesce(created_by, auth.uid())
    where id = p_id
    returning * into method_record;

    if method_record.id is null then
      raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.payment_method_history(payment_method_id, event_type, snapshot, created_by)
    values (method_record.id, 'updated', to_jsonb(method_record), auth.uid());
  end if;

  return jsonb_build_object(
    'id', method_record.id,
    'slug', method_record.slug,
    'display_name', method_record.display_name,
    'bank_name', method_record.bank_name,
    'account_name', method_record.account_name,
    'rib', method_record.rib,
    'iban', method_record.iban,
    'instructions', method_record.instructions,
    'sort_order', method_record.sort_order,
    'is_active', method_record.is_active,
    'archived_at', method_record.archived_at,
    'created_at', method_record.created_at,
    'updated_at', method_record.updated_at
  );
end;
$$;

create or replace function public.archive_payment_method_v1(p_id uuid)
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

  update public.payment_methods
  set is_active = false,
      archived_at = now(),
      updated_at = now()
  where id = p_id
  returning * into method_record;

  if method_record.id is null then
    raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.payment_method_history(payment_method_id, event_type, snapshot, created_by)
  values (method_record.id, 'archived', to_jsonb(method_record), auth.uid());

  return jsonb_build_object(
    'id', method_record.id,
    'slug', method_record.slug,
    'display_name', method_record.display_name,
    'archived_at', method_record.archived_at
  );
end;
$$;

create or replace function public.update_subscription_payment_method_v1(
  p_request_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_method text := nullif(trim(coalesce(p_payment_method, '')), '');
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if normalized_method is not null and not exists (
    select 1 from public.payment_methods
    where slug = normalized_method and is_active = true and archived_at is null
  ) then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  update public.subscription_payment_requests
  set payment_method = normalized_method,
      updated_at = now()
  where id = p_request_id and owner_user_id = auth.uid() and status in ('unpaid', 'rejected');

  if not found then
    raise exception 'PAYMENT_REQUEST_NOT_EDITABLE' using errcode = '42501';
  end if;

  return jsonb_build_object('id', p_request_id, 'payment_method', normalized_method);
end;
$$;

revoke all on function public.upsert_payment_method_v1(uuid, text, text, text, text, text, text, text, integer, boolean) from public, anon;
revoke all on function public.archive_payment_method_v1(uuid) from public, anon;
revoke all on function public.update_subscription_payment_method_v1(uuid, text) from public, anon;
grant execute on function public.upsert_payment_method_v1(uuid, text, text, text, text, text, text, text, integer, boolean) to authenticated, service_role;
grant execute on function public.archive_payment_method_v1(uuid) to authenticated, service_role;
grant execute on function public.update_subscription_payment_method_v1(uuid, text) to authenticated, service_role;
