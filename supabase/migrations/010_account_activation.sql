-- ============================================================
-- Account activation / deactivation support
-- ============================================================

create table if not exists public.account_activity_logs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid references auth.users(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  action text not null check (action in ('activate','disable')),
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.account_activity_logs enable row level security;

create policy "Supervisors can read account logs"
  on public.account_activity_logs for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'supervisor'
    )
  );

create policy "Supervisors can insert account logs"
  on public.account_activity_logs for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'supervisor'
    )
  );

create or replace function public.is_supervisor_or_owner()
returns boolean
language sql
stable
security definer
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), '') in ('supervisor','owner');
$$;

create policy "Protected profile updates"
  on public.profiles for update using (
    auth.uid() = id or public.is_supervisor_or_owner()
  )
  with check (
    auth.uid() = id or public.is_supervisor_or_owner()
  );

create or replace function public.prevent_self_profile_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'UPDATE' and NEW.id = auth.uid() and (NEW.is_active is distinct from OLD.is_active or NEW.role is distinct from OLD.role) then
    raise exception 'You cannot change your own activation or role state';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_self_profile_changes on public.profiles;
create trigger trg_prevent_self_profile_changes
before update on public.profiles
for each row execute function public.prevent_self_profile_changes();
