begin;

create unique index if not exists customers_workspace_youcan_external_all_uidx
  on public.customers(workspace_id, source_integration_id, external_customer_id);

create or replace function public.claim_youcan_sync_jobs(p_worker text, p_limit integer default 10)
returns setof public.youcan_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select job.id
    from public.youcan_sync_jobs job
    where job.status in ('pending','retry') and job.available_at <= now()
      and (
        job.job_type = 'status_outbound'
        or not exists (
          select 1 from public.youcan_sync_jobs earlier
          where earlier.integration_id=job.integration_id
            and earlier.job_type=job.job_type
            and earlier.status in ('pending','retry','processing')
            and earlier.id<>job.id
            and (earlier.status='processing' or (earlier.available_at,earlier.created_at,earlier.id) < (job.available_at,job.created_at,job.id))
        )
      )
    order by job.available_at,job.created_at
    for update of job skip locked
    limit greatest(1,least(p_limit,50))
  )
  update public.youcan_sync_jobs job set
    status='processing',attempts=job.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  from claimed where job.id=claimed.id returning job.*;
end;
$$;
revoke all on function public.claim_youcan_sync_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_youcan_sync_jobs(text,integer) to service_role;

commit;
