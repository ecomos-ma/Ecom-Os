begin;

-- Replace the historical status-only preference with the single workspace UI
-- locale. This block is safe for databases where either, both, or neither
-- column exists (migration drift existed before this change).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'status_language'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'language'
  ) then
    alter table public.workspaces rename column status_language to language;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'status_language'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'language'
  ) then
    update public.workspaces
       set language = case
         when lower(status_language::text) in ('en', 'fr') then lower(status_language::text)
         else 'en'
       end
     where language is null or lower(language::text) not in ('en', 'fr');
    alter table public.workspaces drop column status_language;
  else
    alter table public.workspaces add column if not exists language text;
  end if;
end
$$;

alter table public.workspaces
  alter column language type text using lower(coalesce(language::text, 'en'));

update public.workspaces
   set language = 'en'
 where language is null or language not in ('en', 'fr');

alter table public.workspaces
  alter column language set default 'en',
  alter column language set not null;

alter table public.workspaces
  drop constraint if exists workspaces_language_check;

alter table public.workspaces
  add constraint workspaces_language_check check (language in ('en', 'fr'));

-- Workspace settings are mutable only by tenant managers. The previous policy
-- used user_has_workspace_access(), which allowed every member to update every
-- workspace column.
drop policy if exists "Users and supervisors can update workspaces" on public.workspaces;
drop policy if exists workspaces_update_authorized on public.workspaces;

create policy workspaces_update_authorized
  on public.workspaces
  for update
  to authenticated
  using (
    (select public.is_platform_admin())
    or (select public.has_workspace_role(id, array['owner','supervisor','admin','manager']))
  )
  with check (
    (select public.is_platform_admin())
    or (select public.has_workspace_role(id, array['owner','supervisor','admin','manager']))
  );

-- One narrow write path avoids saving stale copies of unrelated workspace
-- settings when only the language changes.
create or replace function public.update_workspace_language(
  p_workspace_id uuid,
  p_language text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_language text := lower(trim(coalesce(p_language, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_language not in ('en', 'fr') then
    raise exception 'Unsupported workspace language' using errcode = '22023';
  end if;

  if not (
    (select public.is_platform_admin())
    or (select public.has_workspace_role(p_workspace_id, array['owner','supervisor','admin','manager']))
  ) then
    raise exception 'Not authorized to update workspace language' using errcode = '42501';
  end if;

  update public.workspaces
     set language = normalized_language
   where id = p_workspace_id;

  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  return normalized_language;
end;
$$;

revoke all on function public.update_workspace_language(uuid, text) from public, anon;
grant execute on function public.update_workspace_language(uuid, text) to authenticated, service_role;

-- Keep founder Support Mode on the same workspace projection after the column
-- rename. No credential columns are exposed.
create or replace function public.founder_open_support_dashboard(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare payload jsonb;
begin
  if not public.is_founder() then raise exception 'FOUNDER_ACCESS_REQUIRED'; end if;
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'status', coalesce(w.status, 'active'),
      'created_at', w.created_at,
      'language', w.language
    ),
    'profile', jsonb_build_object(
      'id', p.id,
      'workspace_id', p.workspace_id,
      'full_name', p.full_name,
      'email', coalesce(au.email, p.email),
      'role', p.role,
      'created_at', p.created_at,
      'is_active', coalesce(p.is_active, true),
      'allowed_sections', coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb),
      'avatar_url', p.avatar_url
    )
  ) into payload
  from public.founder_support_sessions s
  join public.workspaces w on w.id = s.workspace_id
  join public.profiles p on p.id = coalesce(
    s.target_profile_id,
    (select candidate.id from public.profiles candidate
      where candidate.workspace_id = w.id and candidate.deleted_at is null
      order by (candidate.role = 'owner') desc, candidate.created_at asc limit 1)
  )
  left join auth.users au on au.id = p.id
  where s.id = p_session_id
    and s.founder_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now();
  if payload is null then raise exception 'SUPPORT_SESSION_NOT_ACTIVE'; end if;
  return payload;
end;
$$;

-- Postgres Changes applies table RLS to each subscriber. Adding this table lets
-- active members receive the new language without a page reload.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'workspaces'
     ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end
$$;

commit;
