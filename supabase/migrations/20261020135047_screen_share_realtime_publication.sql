begin;
-- Realtime Postgres Changes checks each subscriber against the SELECT RLS
-- policies. The browser also reconciles from the database after reconnect.
alter publication supabase_realtime add table public.team_screen_share_sessions;
alter publication supabase_realtime add table public.team_screen_share_signals;
commit;
