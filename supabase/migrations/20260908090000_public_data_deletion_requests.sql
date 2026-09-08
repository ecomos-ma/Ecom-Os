-- Extend the existing deletion workflow for unauthenticated provider callbacks.
-- Public callers can submit, but cannot read, enumerate, or update requests.
alter table public.data_deletion_requests
  alter column user_id drop not null;

alter table public.data_deletion_requests
  add column if not exists reference_code text,
  add column if not exists email text,
  add column if not exists source text not null default 'authenticated',
  add column if not exists workspace_id uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

update public.data_deletion_requests
set email = coalesce(email, (select email from auth.users where auth.users.id = data_deletion_requests.user_id)),
    reference_code = coalesce(reference_code, 'DEL-' || upper(substr(md5(id::text), 1, 8)))
where email is null or reference_code is null;

alter table public.data_deletion_requests
  alter column reference_code set default ('DEL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)));

create unique index if not exists data_deletion_requests_reference_idx
  on public.data_deletion_requests(reference_code);
create index if not exists data_deletion_requests_email_idx
  on public.data_deletion_requests(email, requested_at desc);

grant select, insert, update on public.data_deletion_requests to authenticated;
revoke all on public.data_deletion_requests from anon;

drop policy if exists "Users can read own deletion requests" on public.data_deletion_requests;
drop policy if exists "Users can create deletion requests" on public.data_deletion_requests;
drop policy if exists "Admin roles can manage deletion requests" on public.data_deletion_requests;
drop policy if exists data_deletion_requests_owner_select on public.data_deletion_requests;
drop policy if exists data_deletion_requests_owner_insert on public.data_deletion_requests;

create policy data_deletion_requests_owner_select on public.data_deletion_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy data_deletion_requests_owner_insert on public.data_deletion_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id and source = 'authenticated');

create policy data_deletion_requests_admin_select on public.data_deletion_requests
  for select to authenticated
  using (exists (select 1 from public.admin_roles where admin_roles.user_id = (select auth.uid()) and admin_roles.role in ('super_admin', 'legal_admin')));

create policy data_deletion_requests_admin_update on public.data_deletion_requests
  for update to authenticated
  using (exists (select 1 from public.admin_roles where admin_roles.user_id = (select auth.uid()) and admin_roles.role in ('super_admin', 'legal_admin')))
  with check (exists (select 1 from public.admin_roles where admin_roles.user_id = (select auth.uid()) and admin_roles.role in ('super_admin', 'legal_admin')));

create or replace function public.submit_public_data_deletion_request(
  p_email text,
  p_request_type text default 'data_deletion',
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  new_reference text := 'DEL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
begin
  if normalized_email = '' or position('@' in normalized_email) < 2 or length(normalized_email) > 320 then
    raise exception 'invalid request';
  end if;
  if p_request_type not in ('data_deletion', 'account_deletion') then
    raise exception 'invalid request';
  end if;
  if p_reason is not null and length(p_reason) > 1000 then
    raise exception 'invalid request';
  end if;
  if exists (
    select 1 from public.data_deletion_requests
    where email = normalized_email and source = 'public'
      and requested_at > now() - interval '1 hour'
  ) then
    raise exception 'request limit reached';
  end if;
  insert into public.data_deletion_requests (reference_code, email, request_type, source, reason, status, data_to_delete)
  values (new_reference, normalized_email, p_request_type, 'public', nullif(trim(p_reason), ''), 'requested',
    case when p_request_type = 'account_deletion' then array['account_data', 'workspace_data', 'integrations']::text[] else array['personal_data', 'integration_data']::text[] end);
  return new_reference;
end;
$$;

revoke all on function public.submit_public_data_deletion_request(text, text, text) from public;
grant execute on function public.submit_public_data_deletion_request(text, text, text) to anon, authenticated;