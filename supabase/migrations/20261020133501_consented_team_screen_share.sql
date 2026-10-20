begin;

-- Signaling metadata only. Browser media is peer-to-peer and is never stored.
create table public.team_screen_share_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  viewer_id uuid not null references public.profiles(id),
  agent_id uuid not null references public.profiles(id),
  status text not null default 'requested' check (status in ('requested','accepted','declined','stopped','unsupported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 seconds'),
  viewer_seen_at timestamptz,
  agent_seen_at timestamptz,
  ended_at timestamptz,
  constraint different_screen_share_participants check (viewer_id <> agent_id)
);

create index team_screen_share_agent_idx on public.team_screen_share_sessions
  (agent_id, created_at desc) where status in ('requested','accepted');
create index team_screen_share_viewer_idx on public.team_screen_share_sessions
  (viewer_id, created_at desc) where status in ('requested','accepted');

create table public.team_screen_share_signals (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.team_screen_share_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('offer','answer','ice')),
  payload jsonb not null check (octet_length(payload::text) <= 65536),
  created_at timestamptz not null default now()
);
create index team_screen_share_signals_session_idx on public.team_screen_share_signals(session_id, id);
create index team_screen_share_signals_sender_idx on public.team_screen_share_signals(sender_id);
create index team_screen_share_signals_created_idx on public.team_screen_share_signals(created_at);

create table public.team_screen_share_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  session_id uuid not null references public.team_screen_share_sessions(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('requested','accepted','declined','stopped','unsupported','expired')),
  created_at timestamptz not null default now()
);
create index team_screen_share_audit_workspace_idx on public.team_screen_share_audit(workspace_id, created_at desc);
create index team_screen_share_audit_session_idx on public.team_screen_share_audit(session_id);

alter table public.team_screen_share_sessions enable row level security;
alter table public.team_screen_share_signals enable row level security;
alter table public.team_screen_share_audit enable row level security;

create policy screen_share_participants_read on public.team_screen_share_sessions
  for select to authenticated using (
    (select auth.uid()) in (viewer_id, agent_id)
    and public.is_active_workspace_member(workspace_id)
  );
create policy screen_share_signals_read on public.team_screen_share_signals
  for select to authenticated using (exists (
    select 1 from public.team_screen_share_sessions s
    where s.id = session_id and (select auth.uid()) in (s.viewer_id, s.agent_id)
      and public.is_active_workspace_member(s.workspace_id)
      and s.status = 'accepted' and s.expires_at > now()
  ));
create policy screen_share_signals_write on public.team_screen_share_signals
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.team_screen_share_sessions s
      where s.id = session_id and sender_id in (s.viewer_id, s.agent_id)
        and public.is_active_workspace_member(s.workspace_id)
        and s.status = 'accepted' and s.expires_at > now()
    )
  );
create policy screen_share_audit_participants_read on public.team_screen_share_audit
  for select to authenticated using (
    public.can_manage_workspace_team(workspace_id)
    or exists (select 1 from public.team_screen_share_sessions s
      where s.id = session_id and s.agent_id = (select auth.uid())
        and public.is_active_workspace_member(s.workspace_id))
  );

revoke all on public.team_screen_share_sessions, public.team_screen_share_signals,
  public.team_screen_share_audit from public, anon, authenticated;
grant select on public.team_screen_share_sessions, public.team_screen_share_signals,
  public.team_screen_share_audit to authenticated;
grant insert on public.team_screen_share_signals to authenticated;
grant usage, select on sequence public.team_screen_share_signals_id_seq to authenticated;

create function public.request_team_screen_share(p_workspace_id uuid, p_agent_id uuid)
returns public.team_screen_share_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_session public.team_screen_share_sessions%rowtype;
begin
  if v_actor is null or not public.can_manage_workspace_team(p_workspace_id) then
    raise exception using errcode = '42501', message = 'SCREEN_SHARE_FORBIDDEN';
  end if;
  if p_agent_id = v_actor or not exists (
    select 1 from public.profile_workspaces m join public.profiles p on p.id = m.profile_id
    where m.workspace_id = p_workspace_id and m.profile_id = p_agent_id
      and m.status = 'active' and coalesce(p.is_active, true) and p.deleted_at is null
  ) then raise exception using errcode = '42501', message = 'AGENT_NOT_ACTIVE_IN_WORKSPACE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_workspace_id::text || ':' || p_agent_id::text, 0));
  -- Keep sensitive SDP/ICE metadata short-lived even without an external cron.
  delete from public.team_screen_share_signals
    where created_at < now() - interval '1 day';
  if (select count(*) from public.team_screen_share_sessions
      where viewer_id = v_actor and created_at > now() - interval '1 minute') >= 5 then
    raise exception using errcode = '42901', message = 'TOO_MANY_SCREEN_SHARE_REQUESTS';
  end if;
  if exists (select 1 from public.team_screen_share_sessions
      where workspace_id = p_workspace_id and agent_id = p_agent_id
        and status in ('requested','accepted') and expires_at > now()) then
    raise exception using errcode = '55000', message = 'SCREEN_SHARE_ALREADY_PENDING_OR_ACTIVE';
  end if;
  insert into public.team_screen_share_sessions(workspace_id, viewer_id, agent_id, viewer_seen_at)
    values (p_workspace_id, v_actor, p_agent_id, now()) returning * into v_session;
  insert into public.team_screen_share_audit(workspace_id,session_id,actor_id,action)
    values (p_workspace_id,v_session.id,v_actor,'requested');
  return v_session;
end; $$;

create function public.act_team_screen_share(p_session_id uuid, p_action text)
returns public.team_screen_share_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_session public.team_screen_share_sessions%rowtype;
begin
  select * into v_session from public.team_screen_share_sessions where id = p_session_id for update;
  if not found or v_actor is null or v_actor not in (v_session.viewer_id, v_session.agent_id)
    or not public.is_active_workspace_member(v_session.workspace_id)
    or (v_actor = v_session.viewer_id and not public.can_manage_workspace_team(v_session.workspace_id)) then
    raise exception using errcode = '42501', message = 'SCREEN_SHARE_FORBIDDEN';
  end if;
  if p_action = 'accept' and v_actor = v_session.agent_id
    and v_session.status = 'requested' and v_session.expires_at > now() then
    update public.team_screen_share_sessions set status = 'accepted', agent_seen_at = now(),
      expires_at = now() + interval '30 seconds', updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'decline' and v_actor = v_session.agent_id
    and v_session.status = 'requested' then
    update public.team_screen_share_sessions set status = 'declined', ended_at = now(), expires_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'unsupported' and v_actor = v_session.agent_id
    and v_session.status = 'requested' then
    update public.team_screen_share_sessions set status = 'unsupported', ended_at = now(), expires_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'stop' and v_session.status in ('requested','accepted') then
    update public.team_screen_share_sessions set status = 'stopped', ended_at = now(), expires_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'heartbeat' and v_session.status in ('requested','accepted')
    and v_session.expires_at > now() then
    update public.team_screen_share_sessions set
      viewer_seen_at = case when v_actor = viewer_id then now() else viewer_seen_at end,
      agent_seen_at = case when v_actor = agent_id then now() else agent_seen_at end,
      expires_at = case when status = 'accepted' then now() + interval '30 seconds' else expires_at end,
      updated_at = now() where id = p_session_id returning * into v_session;
    return v_session;
  else
    raise exception using errcode = '22023', message = 'INVALID_SCREEN_SHARE_TRANSITION';
  end if;
  insert into public.team_screen_share_audit(workspace_id,session_id,actor_id,action)
    values (v_session.workspace_id,v_session.id,v_actor,v_session.status);
  return v_session;
end; $$;

revoke all on function public.request_team_screen_share(uuid,uuid),
  public.act_team_screen_share(uuid,text) from public, anon;
grant execute on function public.request_team_screen_share(uuid,uuid),
  public.act_team_screen_share(uuid,text) to authenticated;

commit;
