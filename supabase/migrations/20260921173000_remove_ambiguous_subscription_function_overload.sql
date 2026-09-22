-- A defaulted second parameter made get_effective_subscription_v1(uuid)
-- ambiguous to PostgreSQL.  The one-argument function is the public
-- contract used by the application and triggers; the service-only overload
-- is intentionally removed instead of using CASCADE.
begin;

drop function if exists public.get_effective_subscription_v1(uuid, boolean);

commit;
