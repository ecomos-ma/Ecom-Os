begin;

-- The public pricing catalog and the signed-in mobile entitlement gate both
-- react to plan edits without requiring a browser refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'subscription_plans'
  ) then
    alter publication supabase_realtime add table public.subscription_plans;
  end if;
end
$$;

commit;
