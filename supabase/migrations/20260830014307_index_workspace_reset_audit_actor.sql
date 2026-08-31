begin;

create index if not exists workspace_reset_audit_log_actor_id_idx
  on private.workspace_reset_audit_log (actor_id);

commit;
