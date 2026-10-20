begin;
create index team_screen_share_sessions_workspace_idx
  on public.team_screen_share_sessions(workspace_id);
create index team_screen_share_audit_actor_idx
  on public.team_screen_share_audit(actor_id);
commit;
