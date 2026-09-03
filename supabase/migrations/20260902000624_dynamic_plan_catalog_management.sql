begin;

-- Plans are a real admin-managed catalog. Codes are stable public identifiers,
-- but they are no longer limited to the original seeded tiers.
alter table public.subscription_plans
  drop constraint if exists subscription_plans_code_check;

alter table public.subscription_plans
  add constraint subscription_plans_code_check
  check (code is null or code ~ '^[a-z][a-z0-9-]{1,62}$');

-- RLS policies decide which signed-in users can mutate plans. Table privileges
-- must also allow those operations; the earlier revoke blocked all admin writes.
grant insert, update, delete on table public.subscription_plans to authenticated;

commit;
