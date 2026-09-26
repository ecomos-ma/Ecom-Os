-- Connecting a Sheet only stores its URL. Import starts after the user saves
-- a mapping and completes the first manual Sync action.
alter table public.google_sheets_credentials
  add column if not exists mapping_saved_at timestamptz,
  add column if not exists sync_enabled boolean not null default false;

alter table public.google_sheets_credentials
  add constraint google_sheets_sync_requires_saved_mapping
  check (
    not sync_enabled or (
      mapping_saved_at is not null
      and case when jsonb_typeof(field_mappings) = 'array'
        then jsonb_array_length(field_mappings) > 0 else false end
    )
  );

create or replace function public.pause_google_sheets_sync_on_mapping_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.web_app_url is distinct from old.web_app_url then
    new.mapping_saved_at := null;
    new.sync_enabled := false;
    new.field_mappings := '[]'::jsonb;
    new.last_processed_row := 0;
    new.last_seen_sheet_row := 0;
  elsif new.field_mappings is distinct from old.field_mappings then
    new.sync_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists pause_google_sheets_sync_on_mapping_change on public.google_sheets_credentials;
create trigger pause_google_sheets_sync_on_mapping_change
before update of web_app_url, field_mappings on public.google_sheets_credentials
for each row execute function public.pause_google_sheets_sync_on_mapping_change();

create or replace function public.get_workspaces_needing_google_sheets_sync()
returns table (
  workspace_id uuid,
  web_app_url text,
  last_processed_row integer,
  last_seen_sheet_row integer,
  sync_error_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select gsc.workspace_id,
         gsc.web_app_url,
         coalesce(gsc.last_processed_row, 0),
         coalesce(gsc.last_seen_sheet_row, 0),
         coalesce(gsc.sync_error_count, 0)
  from public.google_sheets_credentials gsc
  where gsc.sync_enabled
    and gsc.mapping_saved_at is not null
    and case when jsonb_typeof(gsc.field_mappings) = 'array'
      then jsonb_array_length(gsc.field_mappings) > 0 else false end
    and gsc.is_connected is true
    and nullif(gsc.web_app_url, '') is not null
    and coalesce(gsc.sync_error_count, 0) < 10;
$$;

-- Retire the older unauthenticated 30-minute cron. The fast-sync cron above
-- remains available once a workspace passes the explicit gate.
select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-google-sheets-orders';
