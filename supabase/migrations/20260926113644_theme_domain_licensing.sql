-- Theme licensing is service-only: browsers (including platform admins) never read token hashes.
create table public.theme_domain_licenses (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 120),
  domain text not null check (length(domain) between 4 and 253 and domain = lower(domain)),
  status text not null default 'active' check (status in ('active', 'disabled', 'revoked')),
  token_hash text unique check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_checked_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id)
);
create unique index theme_domain_licenses_one_active_domain
  on public.theme_domain_licenses (domain) where status = 'active';
create index theme_domain_licenses_created_at_idx on public.theme_domain_licenses (created_at desc);
alter table public.theme_domain_licenses enable row level security;
revoke all on public.theme_domain_licenses from public, anon, authenticated;
grant select, insert, update on public.theme_domain_licenses to service_role;

-- Atomic, cross-instance rate limiting; only the service role can inspect counters.
create table public.theme_license_rate_limits (
  bucket timestamptz not null,
  requester_hash text not null check (requester_hash ~ '^[a-f0-9]{64}$'),
  hits integer not null default 1 check (hits between 1 and 60),
  primary key (bucket, requester_hash)
);
alter table public.theme_license_rate_limits enable row level security;
revoke all on public.theme_license_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.theme_license_rate_limits to service_role;

create function public.theme_license_take_rate_limit(p_requester_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare accepted integer;
begin
  if p_requester_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.theme_license_rate_limits (bucket, requester_hash, hits)
  values (date_trunc('minute', now()), p_requester_hash, 1)
  on conflict (bucket, requester_hash) do update
    set hits = public.theme_license_rate_limits.hits + 1
    where public.theme_license_rate_limits.hits < 60
  returning hits into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.theme_license_take_rate_limit(text) from public, anon, authenticated;
grant execute on function public.theme_license_take_rate_limit(text) to service_role;
