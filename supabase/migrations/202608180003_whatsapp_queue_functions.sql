-- MIGRATION: 202608180003_whatsapp_queue_functions

-- Create a secure RPC for atomic queue claiming by the worker
-- Note: 'worker' typically connects via service role, bypassing RLS, but we enforce workspace_id in the claims.
create or replace function public.claim_whatsapp_jobs(p_workspace_id uuid, p_limit integer)
returns setof public.whatsapp_queue
language plpgsql security definer
as $$
declare
  job_rows public.whatsapp_queue;
begin
  return query
  with claimed as (
    select id
    from public.whatsapp_queue
    where 
      status = 'pending' 
      and workspace_id = p_workspace_id
      and scheduled_for <= now()
      and attempts < max_attempts
    order by scheduled_for asc
    limit p_limit
    for update skip locked
  )
  update public.whatsapp_queue q
  set 
    status = 'processing',
    processing_at = now(),
    updated_at = now()
  from claimed c
  where q.id = c.id
  returning q.*;
end;
$$;

-- Create a function to recover stale jobs (if worker crashed while 'processing')
create or replace function public.recover_stale_whatsapp_jobs(p_timeout_minutes integer)
returns integer
language plpgsql security definer
as $$
declare
  recovered_count integer;
begin
  update public.whatsapp_queue
  set 
    status = 'pending',
    processing_at = null,
    updated_at = now()
  where 
    status = 'processing' 
    and processing_at < (now() - (p_timeout_minutes || ' minutes')::interval);
    
  get diagnostics recovered_count = row_count;
  return recovered_count;
end;
$$;

-- Trigger to auto-update 'updated_at' timestamp
create or replace function public.update_whatsapp_timestamps()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger whatsapp_settings_updated_at
  before update on public.whatsapp_settings
  for each row execute function public.update_whatsapp_timestamps();

create trigger whatsapp_queue_updated_at
  before update on public.whatsapp_queue
  for each row execute function public.update_whatsapp_timestamps();
