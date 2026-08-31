-- ============================================================================
-- 20260831050000: Remove legacy unique constraint from whatsapp_reply_actions
-- ============================================================================
-- The original schema enforced unique(workspace_id, action), but the custom
-- action system remaps multiple action types to the same legacy action value
-- such as "callback". That means rows like confirm_order and request_callback
-- both end up as "callback" and collide. We must remove the legacy constraint
-- and replace it with a workspace/action_type uniqueness rule for the structured
-- action types used by the UI.

begin;

-- Remove the legacy unique constraint created by the older schema.
alter table public.whatsapp_reply_actions
  drop constraint if exists whatsapp_reply_actions_workspace_id_action_key;

drop index if exists public.whatsapp_reply_actions_workspace_id_action_key;

-- Keep the structured action types unique within a workspace, while still
-- allowing multiple reply_only entries to coexist.
create unique index if not exists whatsapp_reply_actions_workspace_action_type_key
  on public.whatsapp_reply_actions (workspace_id, action_type)
  where action_type is not null and action_type <> 'reply_only';

commit;
