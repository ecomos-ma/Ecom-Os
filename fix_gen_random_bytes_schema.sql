-- ============================================================
-- Fix gen_random_bytes schema reference in notification function
-- 
-- The private.emit_notification_event function uses set search_path = '' 
-- for security, which prevents it from finding gen_random_bytes.
-- This fix updates the function to call public.gen_random_bytes explicitly.
-- ============================================================

-- Drop and recreate the function with proper schema-qualified function call
create or replace function private.emit_notification_event(
  p_workspace_id uuid,
  p_event_key text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_recipient_user_id uuid default null,
  p_source_event_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.notification_event_catalog%rowtype;
  recipient record;
  settings_row public.notification_user_settings%rowtype;
  preference_row public.notification_preferences%rowtype;
  effective_in_app boolean;
  effective_push boolean;
  effective_sound boolean;
  effective_dedupe text;
  safe_title text;
  safe_message text;
  safe_action text;
  created_count integer := 0;
begin
  select * into event_row from public.notification_event_catalog where event_key = p_event_key;
  if not found then raise exception 'UNKNOWN_NOTIFICATION_EVENT'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_NOTIFICATION_PAYLOAD'; end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and coalesce(w.is_active, true) and w.deleted_at is null
      and coalesce(lower(w.status), 'active') not in ('suspended','removed','deleted','inactive')
  ) then return 0; end if;

  safe_title := private.notification_safe_text(coalesce(p_payload->>'title', event_row.default_title), 180);
  safe_message := private.notification_safe_text(coalesce(p_payload->>'message', event_row.default_title), 600);
  safe_action := case when coalesce(p_payload->>'action_url','') ~ '^/[A-Za-z0-9/_?=&.%:-]*$' and p_payload->>'action_url' not like '//%' then p_payload->>'action_url' else null end;
  -- FIXED: Use extensions.gen_random_bytes instead of gen_random_bytes (function is in extensions schema)
  effective_dedupe := coalesce(nullif(p_dedupe_key,''), p_event_key || ':' || p_workspace_id::text || ':' || coalesce(p_related_entity_id::text, encode(extensions.gen_random_bytes(12), 'hex')));
  if event_row.dedupe_strategy = 'source_event' and nullif(p_source_event_id, '') is not null then
    effective_dedupe := effective_dedupe || ':source:' || p_source_event_id;
  elsif event_row.dedupe_strategy in ('entity_window','failure_window') and event_row.cooldown_seconds > 0 then
    effective_dedupe := effective_dedupe || ':window:' || floor(extract(epoch from now()) / event_row.cooldown_seconds)::bigint;
  end if;
  effective_dedupe := left(effective_dedupe, 500);

  for recipient in
    select
      pw.profile_id as user_id,
      case lower(case when pw.is_owner then 'owner' else coalesce(pw.role, p.role, 'viewer') end)
        when 'employee' then 'agent'
        when 'user' then 'viewer'
        else lower(case when pw.is_owner then 'owner' else coalesce(pw.role, p.role, 'viewer') end)
      end as member_role,
      coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb) as allowed_sections
    from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id
      and pw.status = 'active'
      and (p_recipient_user_id is null or pw.profile_id = p_recipient_user_id)
      and coalesce(p.is_active, true) and p.deleted_at is null
      and coalesce(lower(p.status), 'active') not in ('suspended','removed','deleted','inactive')
  loop
    if not (recipient.member_role = any(event_row.allowed_roles)) then continue; end if;
    if event_row.required_section is not null
      and recipient.member_role not in ('owner','supervisor','admin','manager')
      and not (recipient.allowed_sections @> to_jsonb(array[event_row.required_section])) then continue; end if;

    insert into public.notification_user_settings (workspace_id, user_id)
    values (p_workspace_id, recipient.user_id)
    on conflict (workspace_id, user_id) do nothing;
    select * into settings_row from public.notification_user_settings where workspace_id = p_workspace_id and user_id = recipient.user_id;
    select * into preference_row from public.notification_preferences where workspace_id = p_workspace_id and user_id = recipient.user_id and event_key = p_event_key;

    if not settings_row.notifications_enabled or (settings_row.muted_until is not null and settings_row.muted_until > now()) then continue; end if;
    if event_row.default_priority <> 'critical' and (
      select count(*) from public.notifications recent
      where recent.workspace_id = p_workspace_id
        and recent.recipient_user_id = recipient.user_id
        and recent.created_at > now() - interval '5 minutes'
    ) >= 60 then continue; end if;
    effective_in_app := settings_row.in_app_enabled and coalesce(preference_row.in_app_enabled, event_row.default_in_app_enabled) and coalesce(preference_row.delivery_mode, 'immediate') <> 'off';
    effective_push := settings_row.push_enabled and coalesce(preference_row.push_enabled, event_row.default_push_enabled) and 'push' = any(event_row.available_channels) and coalesce(preference_row.delivery_mode, 'immediate') <> 'off';
    effective_sound := effective_in_app and settings_row.sound_enabled and event_row.sound_allowed and coalesce(preference_row.sound_enabled, event_row.default_sound_enabled);
    if not effective_in_app and not effective_push then continue; end if;

    insert into public.notifications (
      workspace_id, recipient_user_id, event_key, category, priority, title, message,
      related_entity_type, related_entity_id, action_url, payload, dedupe_key,
      in_app_visible, push_requested, sound_requested
    ) values (
      p_workspace_id, recipient.user_id, p_event_key, event_row.category,
      case when p_payload->>'priority' in ('low','normal','high','critical') then p_payload->>'priority' else event_row.default_priority end, safe_title, safe_message,
      nullif(p_related_entity_type,''), p_related_entity_id, safe_action,
      private.notification_safe_payload(coalesce(p_payload, '{}'::jsonb)),
      effective_dedupe, effective_in_app, effective_push, effective_sound
    );
    created_count := created_count + 1;
  end loop;
  
  return created_count;
end;
$$;
