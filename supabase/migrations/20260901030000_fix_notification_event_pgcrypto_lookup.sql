-- Keep the notification dispatcher safe for auth-triggered events.
-- The function has an immutable search path; pgcrypto lives in `extensions`.
-- Including only trusted schemas preserves that protection while making the
-- existing unqualified helper call resolvable on already-migrated projects.
ALTER FUNCTION private.emit_notification_event(
  uuid, text, text, uuid, jsonb, text, uuid, text
) SET search_path = pg_catalog, extensions;
