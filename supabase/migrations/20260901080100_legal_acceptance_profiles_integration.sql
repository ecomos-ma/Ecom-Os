-- Add Legal Acceptance Fields to Profiles
alter table public.profiles add column if not exists terms_version_accepted text default '1.0';
alter table public.profiles add column if not exists privacy_version_accepted text default '1.0';
alter table public.profiles add column if not exists last_terms_acceptance timestamptz;
alter table public.profiles add column if not exists last_privacy_acceptance timestamptz;

-- Create trigger function
create or replace function public.update_profile_legal_acceptance()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set
    terms_version_accepted = new.terms_version,
    privacy_version_accepted = new.privacy_version,
    last_terms_acceptance = new.accepted_at,
    last_privacy_acceptance = new.accepted_at
  where id = new.user_id;
  return new;
end;
$$;

-- Create trigger only if legal_acceptance exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'legal_acceptance') then
    drop trigger if exists on_legal_acceptance_inserted on public.legal_acceptance;
    create trigger on_legal_acceptance_inserted after insert on public.legal_acceptance for each row execute function public.update_profile_legal_acceptance();
  end if;
end $$;

-- Create admin_roles table
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'legal_admin', 'billing_admin', 'compliance_admin')),
  granted_at timestamptz default now(),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_admin_roles_user_id on public.admin_roles(user_id);
alter table public.admin_roles enable row level security;

drop policy if exists "super admins manage" on public.admin_roles;
create policy "super admins manage" on public.admin_roles for all using (exists(select 1 from public.admin_roles where user_id = auth.uid() and role = 'super_admin'));
