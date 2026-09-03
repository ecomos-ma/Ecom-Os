create table if not exists public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'data_deletion' check (request_type in ('data_deletion','account_deletion')),
  reason text,
  status text not null default 'requested' check (status in ('requested','under_review','approved','processing','completed','rejected')),
  data_to_delete text[] not null default '{}'::text[],
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  user_visible_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_deletion_requests_user_idx on public.data_deletion_requests(user_id, requested_at desc);
create index if not exists data_deletion_requests_status_idx on public.data_deletion_requests(status, requested_at desc);
alter table public.data_deletion_requests enable row level security;
grant select, insert on public.data_deletion_requests to authenticated;
drop policy if exists data_deletion_requests_owner_select on public.data_deletion_requests;
create policy data_deletion_requests_owner_select on public.data_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists data_deletion_requests_owner_insert on public.data_deletion_requests;
create policy data_deletion_requests_owner_insert on public.data_deletion_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
