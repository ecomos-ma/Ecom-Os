-- Client-centric, recoverable theme license management.
-- Existing theme_domain_licenses rows are copied, never deleted or rewritten.
begin;

create table if not exists public.client_licenses (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (length(btrim(client_name)) between 1 and 160),
  phone text not null default '' check (length(phone) <= 60),
  email text check (email is null or length(email) <= 254),
  theme_name text not null check (length(btrim(theme_name)) between 1 and 160),
  license_key_hash text unique check (license_key_hash is null or license_key_hash ~ '^[a-f0-9]{64}$'),
  license_key_encrypted text,
  license_display text not null check (length(license_display) between 1 and 80),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'MAD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'disabled', 'archived', 'revoked')),
  notes text check (notes is null or length(notes) <= 5000),
  order_reference text check (order_reference is null or length(order_reference) <= 160),
  payment_notes text check (payment_notes is null or length(payment_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  archived_at timestamptz,
  revoked_at timestamptz,
  last_check_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.license_domains (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.client_licenses(id) on delete restrict,
  hostname text not null check (length(hostname) between 4 and 253 and hostname = lower(hostname)),
  status text not null default 'active' check (status in ('active', 'disabled', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  removed_at timestamptz,
  last_check_at timestamptz
);

create table if not exists public.license_events (
  id bigint generated always as identity primary key,
  license_id uuid not null references public.client_licenses(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(event_type) between 3 and 80),
  hostname text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

-- A hostname may be recorded on more than one client license; the validation
-- lookup is always scoped by license key. Only duplicates within one license
-- are prohibited, as required by the client-license workflow.
create unique index if not exists license_domains_unique_license_hostname_idx
  on public.license_domains (license_id, hostname) where status <> 'removed';
create index if not exists client_licenses_status_created_idx on public.client_licenses (status, created_at desc);
create index if not exists client_licenses_currency_created_idx on public.client_licenses (currency, created_at desc);
create index if not exists client_licenses_client_name_idx on public.client_licenses (lower(client_name));
create index if not exists client_licenses_phone_idx on public.client_licenses (phone);
create index if not exists client_licenses_theme_name_idx on public.client_licenses (lower(theme_name));
create index if not exists license_domains_license_id_idx on public.license_domains (license_id, created_at);
create index if not exists license_domains_hostname_idx on public.license_domains (hostname);
create index if not exists license_events_license_created_idx on public.license_events (license_id, created_at desc);
create index if not exists license_events_type_created_idx on public.license_events (event_type, created_at desc);
create index if not exists client_licenses_created_by_idx on public.client_licenses (created_by) where created_by is not null;
create index if not exists license_events_actor_id_idx on public.license_events (actor_id) where actor_id is not null;

alter table public.client_licenses enable row level security;
alter table public.license_domains enable row level security;
alter table public.license_events enable row level security;
revoke all on public.client_licenses, public.license_domains, public.license_events from public, anon, authenticated;
grant select, insert, update on public.client_licenses, public.license_domains to service_role;
grant select, insert on public.license_events to service_role;
grant usage, select on sequence public.license_events_id_seq to service_role;

-- Preserve every legacy license identity and hash. Hash-only legacy keys are
-- intentionally marked unavailable until an administrator imports the exact key.
insert into public.client_licenses (
  id, client_name, phone, theme_name, license_key_hash, license_display,
  price, currency, status, created_at, updated_at, revoked_at, last_check_at, created_by
)
select
  legacy.id,
  legacy.label,
  '',
  'Legacy theme license',
  legacy.token_hash,
  case when legacy.token_hash is null then 'Legacy key unavailable' else 'Legacy key — import to recover' end,
  0,
  'MAD',
  case legacy.status when 'disabled' then 'disabled' when 'revoked' then 'revoked' else 'active' end,
  legacy.created_at,
  legacy.updated_at,
  legacy.revoked_at,
  legacy.last_checked_at,
  legacy.created_by
from public.theme_domain_licenses legacy
on conflict (id) do nothing;

insert into public.license_domains (license_id, hostname, status, created_at, updated_at, last_check_at)
select legacy.id, legacy.domain, 'active', legacy.created_at, legacy.updated_at, legacy.last_checked_at
from public.theme_domain_licenses legacy
where legacy.domain is not null
on conflict do nothing;

-- Some environments briefly had an additive text[] allowed_domains column.
-- Preserve it when present without making the migration depend on that rollout.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'theme_domain_licenses'
      and column_name = 'allowed_domains' and data_type = 'ARRAY'
  ) then
    execute $migration$
      insert into public.license_domains (license_id, hostname, status, created_at, updated_at, last_check_at)
      select legacy.id, lower(domain_name), 'active', legacy.created_at, legacy.updated_at, legacy.last_checked_at
      from public.theme_domain_licenses legacy
      cross join lateral unnest(legacy.allowed_domains) domain_name
      where domain_name is not null and btrim(domain_name) <> ''
      on conflict do nothing
    $migration$;
  end if;
end
$$;

insert into public.license_events (license_id, event_type, metadata, created_at)
select id, 'LEGACY_LICENSE_MIGRATED', jsonb_build_object('source', 'theme_domain_licenses'), created_at
from public.client_licenses
where not exists (
  select 1 from public.license_events event
  where event.license_id = client_licenses.id and event.event_type = 'LEGACY_LICENSE_MIGRATED'
);

create or replace function public.create_client_license_v1(
  p_client_name text,
  p_phone text,
  p_email text,
  p_theme_name text,
  p_license_key_hash text,
  p_license_key_encrypted text,
  p_license_display text,
  p_price numeric,
  p_currency text,
  p_notes text,
  p_order_reference text,
  p_payment_notes text,
  p_domains text[],
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  domain_name text;
begin
  if coalesce(array_length(p_domains, 1), 0) < 1 then
    raise exception using errcode = '22023', message = 'At least one domain is required';
  end if;

  insert into public.client_licenses (
    client_name, phone, email, theme_name, license_key_hash, license_key_encrypted,
    license_display, price, currency, notes, order_reference, payment_notes, created_by
  ) values (
    btrim(p_client_name), btrim(p_phone), nullif(btrim(p_email), ''), btrim(p_theme_name),
    p_license_key_hash, p_license_key_encrypted, p_license_display, p_price, upper(p_currency),
    nullif(btrim(p_notes), ''), nullif(btrim(p_order_reference), ''),
    nullif(btrim(p_payment_notes), ''), p_actor_id
  ) returning id into new_id;

  foreach domain_name in array p_domains loop
    insert into public.license_domains (license_id, hostname) values (new_id, domain_name);
  end loop;

  insert into public.license_events (license_id, actor_id, event_type, metadata)
  values (new_id, p_actor_id, 'LICENSE_CREATED', jsonb_build_object('domains', p_domains, 'theme_name', btrim(p_theme_name)));
  return new_id;
end;
$$;

create or replace function public.update_client_license_v1(
  p_license_id uuid,
  p_client_name text,
  p_phone text,
  p_email text,
  p_theme_name text,
  p_price numeric,
  p_currency text,
  p_notes text,
  p_order_reference text,
  p_payment_notes text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.client_licenses set
    client_name = btrim(p_client_name), phone = btrim(p_phone), email = nullif(btrim(p_email), ''),
    theme_name = btrim(p_theme_name), price = p_price, currency = upper(p_currency),
    notes = nullif(btrim(p_notes), ''), order_reference = nullif(btrim(p_order_reference), ''),
    payment_notes = nullif(btrim(p_payment_notes), ''), updated_at = now()
  where id = p_license_id;
  if not found then raise exception using errcode = 'P0002', message = 'License not found'; end if;
  insert into public.license_events (license_id, actor_id, event_type)
  values (p_license_id, p_actor_id, 'CLIENT_UPDATED');
end;
$$;

create or replace function public.client_license_status_action_v1(
  p_license_id uuid,
  p_action text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
  next_status text;
  event_name text;
begin
  select status into current_status from public.client_licenses where id = p_license_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'License not found'; end if;
  if current_status = 'revoked' and p_action <> 'revoke' then
    raise exception using errcode = '22023', message = 'Revoked licenses cannot be restored';
  end if;

  case p_action
    when 'disable' then next_status := 'disabled'; event_name := 'LICENSE_DISABLED';
    when 'enable' then next_status := 'active'; event_name := 'LICENSE_ENABLED';
    when 'archive' then next_status := 'archived'; event_name := 'LICENSE_ARCHIVED';
    when 'restore' then next_status := 'active'; event_name := 'LICENSE_RESTORED';
    when 'revoke' then next_status := 'revoked'; event_name := 'LICENSE_REVOKED';
    else raise exception using errcode = '22023', message = 'Invalid license action';
  end case;

  update public.client_licenses set
    status = next_status,
    disabled_at = case when next_status = 'disabled' then now() when next_status = 'active' then null else disabled_at end,
    archived_at = case when next_status = 'archived' then now() when next_status = 'active' then null else archived_at end,
    revoked_at = case when next_status = 'revoked' then now() else revoked_at end,
    updated_at = now()
  where id = p_license_id;

  insert into public.license_events (license_id, actor_id, event_type, metadata)
  values (p_license_id, p_actor_id, event_name, jsonb_build_object('previous_status', current_status));
end;
$$;

create or replace function public.client_license_domain_action_v1(
  p_license_id uuid,
  p_hostname text,
  p_action text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  domain_row public.license_domains%rowtype;
  event_name text;
begin
  if not exists (select 1 from public.client_licenses where id = p_license_id and status <> 'revoked') then
    raise exception using errcode = '22023', message = 'License cannot be changed';
  end if;

  select * into domain_row from public.license_domains
  where license_id = p_license_id and hostname = p_hostname
  order by created_at desc limit 1 for update;

  if p_action = 'add' then
    if domain_row.id is null then
      insert into public.license_domains (license_id, hostname) values (p_license_id, p_hostname);
    else
      update public.license_domains set status = 'active', disabled_at = null, removed_at = null, updated_at = now()
      where id = domain_row.id;
    end if;
    event_name := 'DOMAIN_ADDED';
  elsif domain_row.id is null then
    raise exception using errcode = 'P0002', message = 'Domain not found';
  elsif p_action = 'disable' then
    update public.license_domains set status = 'disabled', disabled_at = now(), updated_at = now() where id = domain_row.id;
    event_name := 'DOMAIN_DISABLED';
  elsif p_action = 'enable' then
    update public.license_domains set status = 'active', disabled_at = null, removed_at = null, updated_at = now() where id = domain_row.id;
    event_name := 'DOMAIN_ENABLED';
  elsif p_action = 'remove' then
    update public.license_domains set status = 'removed', removed_at = now(), updated_at = now() where id = domain_row.id;
    event_name := 'DOMAIN_REMOVED';
  else
    raise exception using errcode = '22023', message = 'Invalid domain action';
  end if;

  update public.client_licenses set updated_at = now() where id = p_license_id;
  insert into public.license_events (license_id, actor_id, event_type, hostname)
  values (p_license_id, p_actor_id, event_name, p_hostname);
end;
$$;

create or replace function public.rotate_client_license_v1(
  p_license_id uuid,
  p_license_key_hash text,
  p_license_key_encrypted text,
  p_license_display text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.client_licenses set
    license_key_hash = p_license_key_hash,
    license_key_encrypted = p_license_key_encrypted,
    license_display = p_license_display,
    status = 'active', disabled_at = null, archived_at = null,
    updated_at = now()
  where id = p_license_id and status <> 'revoked';
  if not found then raise exception using errcode = '22023', message = 'License cannot be rotated'; end if;
  insert into public.license_events (license_id, actor_id, event_type)
  values (p_license_id, p_actor_id, 'LICENSE_ROTATED');
end;
$$;

create or replace function public.import_existing_license_v1(
  p_license_id uuid,
  p_license_key_encrypted text,
  p_license_display text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.client_licenses set
    license_key_encrypted = p_license_key_encrypted,
    license_display = p_license_display,
    updated_at = now()
  where id = p_license_id;
  if not found then raise exception using errcode = 'P0002', message = 'License not found'; end if;
  insert into public.license_events (license_id, actor_id, event_type)
  values (p_license_id, p_actor_id, 'LICENSE_IMPORTED');
end;
$$;

revoke all on function public.create_client_license_v1(text,text,text,text,text,text,text,numeric,text,text,text,text,text[],uuid) from public, anon, authenticated;
revoke all on function public.update_client_license_v1(uuid,text,text,text,text,numeric,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.client_license_status_action_v1(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.client_license_domain_action_v1(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.rotate_client_license_v1(uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.import_existing_license_v1(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.create_client_license_v1(text,text,text,text,text,text,text,numeric,text,text,text,text,text[],uuid) to service_role;
grant execute on function public.update_client_license_v1(uuid,text,text,text,text,numeric,text,text,text,text,uuid) to service_role;
grant execute on function public.client_license_status_action_v1(uuid,text,uuid) to service_role;
grant execute on function public.client_license_domain_action_v1(uuid,text,text,uuid) to service_role;
grant execute on function public.rotate_client_license_v1(uuid,text,text,text,uuid) to service_role;
grant execute on function public.import_existing_license_v1(uuid,text,text,uuid) to service_role;

comment on table public.client_licenses is 'Permanent client license identities; normal application flows never delete rows.';
comment on column public.client_licenses.license_key_encrypted is 'AES-GCM ciphertext. Encryption material exists only in Edge Function secrets.';
comment on table public.license_domains is 'Soft-managed hostnames authorized by one stable client license.';
comment on table public.license_events is 'Immutable client license audit timeline.';

commit;
