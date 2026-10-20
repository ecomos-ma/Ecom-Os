-- Existing workflows remain visible to their workspace; new presets are private
-- to their creator unless explicitly shared.
alter table public.meta_workflows
  add column if not exists visibility text not null default 'workspace';
alter table public.meta_workflows
  alter column visibility set default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meta_workflows'::regclass
      and conname = 'meta_workflows_visibility_check'
  ) then
    alter table public.meta_workflows add constraint meta_workflows_visibility_check
      check (visibility in ('private', 'workspace'));
  end if;
end $$;

alter table public.meta_workflows
  drop constraint if exists meta_workflows_workspace_id_name_key;
create unique index if not exists meta_workflows_owner_name_key
  on public.meta_workflows (workspace_id, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid), name);
create index if not exists meta_workflows_visible_idx
  on public.meta_workflows (workspace_id, visibility, updated_at desc);

drop policy if exists meta_workflows_select on public.meta_workflows;
create policy meta_workflows_select on public.meta_workflows
  for select to authenticated
  using (
    (select public.meta_can_access_workspace(workspace_id))
    and (visibility = 'workspace' or created_by = (select auth.uid()))
  );
