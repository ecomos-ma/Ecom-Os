begin;

alter table public.team_screen_share_sessions
  add column viewer_auth_session_id uuid not null,
  add column agent_auth_session_id uuid;

create function public.enforce_screen_share_auth_session_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
        v_auth_session uuid := nullif((select auth.jwt()) ->> 'session_id','')::uuid;
begin
  if v_actor is null or v_auth_session is null then
    raise exception using errcode = '42501', message = 'SCREEN_SHARE_LOGIN_SESSION_REQUIRED';
  end if;
  if tg_op = 'INSERT' then
    if new.viewer_id <> v_actor then
      raise exception using errcode = '42501', message = 'SCREEN_SHARE_VIEWER_MISMATCH';
    end if;
    new.viewer_auth_session_id := v_auth_session;
    return new;
  end if;
  if old.viewer_id = v_actor then
    if old.viewer_auth_session_id is distinct from v_auth_session then
      raise exception using errcode = '42501', message = 'SCREEN_SHARE_VIEWER_SESSION_MISMATCH';
    end if;
  elsif old.agent_id = v_actor then
    if old.agent_auth_session_id is not null and old.agent_auth_session_id is distinct from v_auth_session then
      raise exception using errcode = '42501', message = 'SCREEN_SHARE_AGENT_SESSION_MISMATCH';
    end if;
    if old.status = 'requested' and new.status = 'accepted' then
      new.agent_auth_session_id := v_auth_session;
    end if;
  else
    raise exception using errcode = '42501', message = 'SCREEN_SHARE_PARTICIPANT_REQUIRED';
  end if;
  if new.viewer_auth_session_id is distinct from old.viewer_auth_session_id
    or (old.agent_auth_session_id is not null and new.agent_auth_session_id is distinct from old.agent_auth_session_id) then
    raise exception using errcode = '42501', message = 'SCREEN_SHARE_SESSION_IMMUTABLE';
  end if;
  return new;
end; $$;

create trigger team_screen_share_auth_session_guard
  before insert or update on public.team_screen_share_sessions
  for each row execute function public.enforce_screen_share_auth_session_v1();
revoke all on function public.enforce_screen_share_auth_session_v1() from public, anon, authenticated;

drop policy screen_share_participants_read on public.team_screen_share_sessions;
create policy screen_share_participants_read on public.team_screen_share_sessions
  for select to authenticated using (
    public.is_active_workspace_member(workspace_id)
    and (
      (viewer_id = (select auth.uid())
        and viewer_auth_session_id::text = ((select auth.jwt()) ->> 'session_id'))
      or (agent_id = (select auth.uid())
        and (agent_auth_session_id is null
          or agent_auth_session_id::text = ((select auth.jwt()) ->> 'session_id')))
    )
  );

drop policy screen_share_signals_read on public.team_screen_share_signals;
create policy screen_share_signals_read on public.team_screen_share_signals
  for select to authenticated using (exists (
    select 1 from public.team_screen_share_sessions s
    where s.id = session_id and public.is_active_workspace_member(s.workspace_id)
      and s.status = 'accepted' and s.expires_at > now()
      and (
        (s.viewer_id = (select auth.uid())
          and s.viewer_auth_session_id::text = ((select auth.jwt()) ->> 'session_id'))
        or (s.agent_id = (select auth.uid())
          and s.agent_auth_session_id::text = ((select auth.jwt()) ->> 'session_id'))
      )
  ));

drop policy screen_share_signals_write on public.team_screen_share_signals;
create policy screen_share_signals_write on public.team_screen_share_signals
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.team_screen_share_sessions s
      where s.id = session_id and public.is_active_workspace_member(s.workspace_id)
        and s.status = 'accepted' and s.expires_at > now()
        and (
          (s.viewer_id = sender_id
            and s.viewer_auth_session_id::text = ((select auth.jwt()) ->> 'session_id'))
          or (s.agent_id = sender_id
            and s.agent_auth_session_id::text = ((select auth.jwt()) ->> 'session_id'))
        )
    )
  );

commit;
