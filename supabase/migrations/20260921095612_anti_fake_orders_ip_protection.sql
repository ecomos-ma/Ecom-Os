-- Anti-Fake Orders: workspace-scoped YouCan visual access guard.
--
-- This data is intentionally not exposed through PostgREST. Authenticated
-- management and public visitor decisions both go through the
-- anti-fake-orders Edge Function, which performs its own authorization and
-- returns only the minimum decision payload.

create table if not exists public.anti_fake_order_stores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  store_url text not null,
  hostname text not null,
  site_key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled boolean not null default true,
  customer_guard_enabled boolean not null default true,
  default_block_mode text not null default 'message'
    check (default_block_mode in ('message', 'cyber_prank')),
  default_message text not null default 'Access to this store is restricted.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anti_fake_order_stores_workspace_unique unique (workspace_id),
  constraint anti_fake_order_stores_id_workspace_unique unique (id, workspace_id),
  constraint anti_fake_order_stores_site_key_unique unique (site_key),
  constraint anti_fake_order_stores_hostname_length check (char_length(hostname) between 1 and 253),
  constraint anti_fake_order_stores_message_length check (char_length(default_message) between 1 and 500)
);

create table if not exists public.anti_fake_order_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  rule_type text not null
    check (rule_type in ('ip', 'phone', 'name', 'address', 'address_contains')),
  rule_value text not null,
  normalized_value text,
  ip_address inet,
  block_mode text not null default 'message'
    check (block_mode in ('message', 'cyber_prank')),
  message text,
  note text not null default '',
  enabled boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  hit_count bigint not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anti_fake_order_rules_value_length check (char_length(rule_value) between 1 and 500),
  constraint anti_fake_order_rules_note_length check (char_length(note) <= 500),
  constraint anti_fake_order_rules_message_length check (message is null or char_length(message) <= 500),
  constraint anti_fake_order_rules_expiry check (expires_at is null or expires_at > starts_at),
  constraint anti_fake_order_rules_store_workspace_fk
    foreign key (store_id, workspace_id)
    references public.anti_fake_order_stores(id, workspace_id)
    on delete cascade,
  constraint anti_fake_order_rules_value_shape check (
    (rule_type = 'ip' and ip_address is not null and normalized_value is null)
    or
    (rule_type <> 'ip' and ip_address is null and normalized_value is not null)
  )
);

create unique index if not exists anti_fake_order_rules_store_ip_unique
  on public.anti_fake_order_rules (store_id, ip_address)
  where rule_type = 'ip';

create unique index if not exists anti_fake_order_rules_store_customer_unique
  on public.anti_fake_order_rules (store_id, rule_type, normalized_value)
  where rule_type <> 'ip';

create index if not exists anti_fake_order_rules_active_ip_lookup
  on public.anti_fake_order_rules (store_id, ip_address)
  where enabled and rule_type = 'ip';

create index if not exists anti_fake_order_rules_active_customer_lookup
  on public.anti_fake_order_rules (store_id, rule_type, normalized_value)
  where enabled and rule_type <> 'ip';

drop trigger if exists anti_fake_order_stores_set_updated_at on public.anti_fake_order_stores;
create trigger anti_fake_order_stores_set_updated_at
  before update on public.anti_fake_order_stores
  for each row execute function public.set_updated_at();

drop trigger if exists anti_fake_order_rules_set_updated_at on public.anti_fake_order_rules;
create trigger anti_fake_order_rules_set_updated_at
  before update on public.anti_fake_order_rules
  for each row execute function public.set_updated_at();

alter table public.anti_fake_order_stores enable row level security;
alter table public.anti_fake_order_rules enable row level security;

revoke all on table public.anti_fake_order_stores from public, anon, authenticated;
revoke all on table public.anti_fake_order_rules from public, anon, authenticated;
grant all on table public.anti_fake_order_stores to service_role;
grant all on table public.anti_fake_order_rules to service_role;

create or replace function public.record_anti_fake_order_rule_hit(p_rule_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.anti_fake_order_rules
  set hit_count = hit_count + 1,
      last_hit_at = now()
  where id = p_rule_id;
$$;

revoke all on function public.record_anti_fake_order_rule_hit(uuid) from public, anon, authenticated;
grant execute on function public.record_anti_fake_order_rule_hit(uuid) to service_role;
