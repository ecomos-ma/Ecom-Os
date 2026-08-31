begin;

-- The existing shared write guard returned NEW from a BEFORE DELETE trigger.
-- PostgreSQL defines NEW as null for DELETE, which silently cancelled every
-- allowed delete on guarded workspace tables. Return OLD for DELETE instead.
create or replace function public.block_impersonation_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_founder_email text;
  v_target_workspace_id uuid;
  v_impersonated_workspace_id uuid;
begin
  v_founder_email := auth.jwt() ->> 'email';

  if not public.is_founder_internal_user() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_target_workspace_id := old.workspace_id;
  else
    v_target_workspace_id := new.workspace_id;
  end if;

  if v_target_workspace_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select audit.workspace_id
    into v_impersonated_workspace_id
  from public.founder_impersonation_audit as audit
  where audit.founder_email = v_founder_email
    and audit.session_end is null
    and audit.session_start > now() - interval '2 hours'
  order by audit.session_start desc
  limit 1;

  if v_impersonated_workspace_id is not null
     and v_target_workspace_id = v_impersonated_workspace_id then
    raise exception 'Write operations are not allowed during impersonation mode on workspace %.', v_target_workspace_id
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

commit;
