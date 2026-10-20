-- Public-safe fallback copy for themes that fail license authorization.
-- These values are plain text only and are never combined with customer data.
begin;

alter table public.client_licenses
  add column if not exists has_custom_unauthorized_message boolean not null default false,
  add column if not exists unauthorized_title text,
  add column if not exists unauthorized_message text,
  add column if not exists unauthorized_primary_button_text text,
  add column if not exists unauthorized_primary_button_url text,
  add column if not exists unauthorized_secondary_button_text text,
  add column if not exists unauthorized_secondary_button_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_licenses_unauthorized_message_plain_text_check' and conrelid = 'public.client_licenses'::regclass) then
    alter table public.client_licenses add constraint client_licenses_unauthorized_message_plain_text_check check (
      (unauthorized_title is null or (length(unauthorized_title) between 1 and 120 and unauthorized_title !~ '[<>[:cntrl:]]')) and
      (unauthorized_message is null or (length(unauthorized_message) between 1 and 1200 and unauthorized_message !~ '[<>[:cntrl:]]')) and
      (unauthorized_primary_button_text is null or (length(unauthorized_primary_button_text) between 1 and 80 and unauthorized_primary_button_text !~ '[<>[:cntrl:]]')) and
      (unauthorized_secondary_button_text is null or (length(unauthorized_secondary_button_text) between 1 and 80 and unauthorized_secondary_button_text !~ '[<>[:cntrl:]]')) and
      (unauthorized_primary_button_url is null or (length(unauthorized_primary_button_url) <= 2048 and unauthorized_primary_button_url ~ '^https://')) and
      (unauthorized_secondary_button_url is null or (length(unauthorized_secondary_button_url) <= 2048 and unauthorized_secondary_button_url ~ '^https://')) and
      (not has_custom_unauthorized_message or (
        unauthorized_title is not null and unauthorized_message is not null and
        unauthorized_primary_button_text is not null and unauthorized_primary_button_url is not null
      )) and
      ((unauthorized_secondary_button_text is null) = (unauthorized_secondary_button_url is null))
    );
  end if;
end
$$;

create table if not exists public.license_unauthorized_message_defaults (
  singleton boolean primary key default true check (singleton),
  title text not null check (length(title) between 1 and 120 and title !~ '[<>[:cntrl:]]'),
  message text not null check (length(message) between 1 and 1200 and message !~ '[<>[:cntrl:]]'),
  primary_button_text text not null check (length(primary_button_text) between 1 and 80 and primary_button_text !~ '[<>[:cntrl:]]'),
  primary_button_url text not null check (length(primary_button_url) <= 2048 and primary_button_url ~ '^https://'),
  secondary_button_text text check (secondary_button_text is null or (length(secondary_button_text) between 1 and 80 and secondary_button_text !~ '[<>[:cntrl:]]')),
  secondary_button_url text check (secondary_button_url is null or (length(secondary_button_url) <= 2048 and secondary_button_url ~ '^https://')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check ((secondary_button_text is null) = (secondary_button_url is null))
);

insert into public.license_unauthorized_message_defaults (
  singleton, title, message, primary_button_text, primary_button_url
) values (
  true,
  'Want This Theme?',
  'This theme is not activated for this domain. To purchase or activate it, contact Ecom OS.',
  'Purchase Theme',
  'https://ecomos.ma'
) on conflict (singleton) do nothing;

alter table public.license_unauthorized_message_defaults enable row level security;
revoke all on public.license_unauthorized_message_defaults from public, anon, authenticated;
grant select, insert, update on public.license_unauthorized_message_defaults to service_role;

create or replace function public.update_client_unauthorized_message_v1(
  p_license_id uuid,
  p_has_custom boolean,
  p_title text,
  p_message text,
  p_primary_button_text text,
  p_primary_button_url text,
  p_secondary_button_text text,
  p_secondary_button_url text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.client_licenses set
    has_custom_unauthorized_message = p_has_custom,
    unauthorized_title = case when p_has_custom then nullif(btrim(p_title), '') else null end,
    unauthorized_message = case when p_has_custom then nullif(btrim(p_message), '') else null end,
    unauthorized_primary_button_text = case when p_has_custom then nullif(btrim(p_primary_button_text), '') else null end,
    unauthorized_primary_button_url = case when p_has_custom then nullif(btrim(p_primary_button_url), '') else null end,
    unauthorized_secondary_button_text = case when p_has_custom then nullif(btrim(p_secondary_button_text), '') else null end,
    unauthorized_secondary_button_url = case when p_has_custom then nullif(btrim(p_secondary_button_url), '') else null end,
    updated_at = now()
  where id = p_license_id;
  if not found then raise exception using errcode = 'P0002', message = 'License not found'; end if;

  insert into public.license_events (license_id, actor_id, event_type, metadata)
  values (p_license_id, p_actor_id, 'UNAUTHORIZED_MESSAGE_UPDATED', jsonb_build_object('custom_message_enabled', p_has_custom));
end;
$$;

create or replace function public.update_license_unauthorized_message_default_v1(
  p_title text,
  p_message text,
  p_primary_button_text text,
  p_primary_button_url text,
  p_secondary_button_text text,
  p_secondary_button_url text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.license_unauthorized_message_defaults (
    singleton, title, message, primary_button_text, primary_button_url,
    secondary_button_text, secondary_button_url, updated_at, updated_by
  ) values (
    true, btrim(p_title), btrim(p_message), btrim(p_primary_button_text), btrim(p_primary_button_url),
    nullif(btrim(p_secondary_button_text), ''), nullif(btrim(p_secondary_button_url), ''), now(), p_actor_id
  ) on conflict (singleton) do update set
    title = excluded.title,
    message = excluded.message,
    primary_button_text = excluded.primary_button_text,
    primary_button_url = excluded.primary_button_url,
    secondary_button_text = excluded.secondary_button_text,
    secondary_button_url = excluded.secondary_button_url,
    updated_at = now(),
    updated_by = p_actor_id;
end;
$$;

revoke all on function public.update_client_unauthorized_message_v1(uuid,boolean,text,text,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.update_license_unauthorized_message_default_v1(text,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.update_client_unauthorized_message_v1(uuid,boolean,text,text,text,text,text,text,uuid) to service_role;
grant execute on function public.update_license_unauthorized_message_default_v1(text,text,text,text,text,text,uuid) to service_role;

comment on table public.license_unauthorized_message_defaults is 'Singleton fallback shown publicly by customer themes when license authorization fails.';
commit;
