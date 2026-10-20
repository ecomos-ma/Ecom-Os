-- Reuse the durable bulk worker while keeping manual-token credentials and
-- OAuth credentials in their separate stores.
alter table public.meta_bulk_jobs alter column connection_id drop not null;
alter table public.meta_bulk_jobs
  add column if not exists legacy_connection_id uuid
  references public.meta_legacy_connections(id) on delete restrict;
create index if not exists meta_bulk_jobs_legacy_connection_idx
  on public.meta_bulk_jobs (legacy_connection_id)
  where legacy_connection_id is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.meta_bulk_jobs'::regclass
      and conname = 'meta_bulk_jobs_one_connection_check'
  ) then
    alter table public.meta_bulk_jobs
      add constraint meta_bulk_jobs_one_connection_check
      check ((connection_id is not null) <> (legacy_connection_id is not null));
  end if;
end $$;

create or replace function public.enqueue_meta_legacy_bulk_job(
  p_workspace_id uuid,
  p_legacy_connection_id uuid,
  p_ad_account_id text,
  p_created_by uuid,
  p_idempotency_key text,
  p_create_status text,
  p_configuration jsonb,
  p_preview jsonb,
  p_items jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job_row public.meta_bulk_jobs;
  existing_row public.meta_bulk_jobs;
  item_count integer;
begin
  item_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if item_count < 1 or item_count > 1000 then
    raise exception 'Provide between 1 and 1000 launch items';
  end if;
  if not exists (
    select 1 from public.meta_legacy_connections c
    where c.id = p_legacy_connection_id
      and c.workspace_id = p_workspace_id
      and c.ad_account_id = p_ad_account_id
      and c.access_token_encrypted is not null
      and c.status in ('connected', 'syncing', 'sync_failed')
  ) then
    raise exception 'Legacy Meta connection is unavailable';
  end if;
  select * into existing_row from public.meta_bulk_jobs
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('deduplicated', true, 'job', to_jsonb(existing_row));
  end if;
  insert into public.meta_bulk_jobs (
    workspace_id, legacy_connection_id, ad_account_id, created_by,
    job_type, idempotency_key, create_status, configuration, preview, total_items
  ) values (
    p_workspace_id, p_legacy_connection_id, p_ad_account_id, p_created_by,
    'bulk_launch', p_idempotency_key, p_create_status,
    coalesce(p_configuration, '{}'::jsonb), coalesce(p_preview, '{}'::jsonb), item_count
  ) returning * into job_row;
  insert into public.meta_bulk_job_items (
    workspace_id, job_id, item_index, item_type, idempotency_key, payload
  )
  select p_workspace_id, job_row.id, ordinality - 1, 'ad',
    p_idempotency_key || ':' || (ordinality - 1), item
  from jsonb_array_elements(p_items) with ordinality expanded(item, ordinality);
  return jsonb_build_object('deduplicated', false, 'job', to_jsonb(job_row));
exception when unique_violation then
  select * into existing_row from public.meta_bulk_jobs
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('deduplicated', true, 'job', to_jsonb(existing_row));
  end if;
  raise;
end;
$$;
revoke all on function public.enqueue_meta_legacy_bulk_job(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_meta_legacy_bulk_job(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb)
  to service_role;
