begin;

-- YouCan Integration V2 production reconciliation.
-- Additive by design: existing sellers, orders, products, and legacy credential
-- columns remain intact while Edge Functions migrate credentials server-side.

alter table public.integrations
  add column if not exists access_token_encrypted text,
  add column if not exists refresh_token_encrypted text,
  add column if not exists token_encryption_version integer not null default 0,
  add column if not exists granted_scopes text[] not null default '{}',
  add column if not exists needs_reconnect boolean not null default false,
  add column if not exists store_slug text,
  add column if not exists store_domain text,
  add column if not exists store_public_url text,
  add column if not exists store_logo_url text,
  add column if not exists store_currency text,
  add column if not exists provider_store_status text,
  add column if not exists provider_store_active boolean,
  add column if not exists webhook_health text not null default 'pending',
  add column if not exists webhook_last_checked_at timestamptz,
  add column if not exists webhook_last_received_at timestamptz,
  add column if not exists webhook_last_error text,
  add column if not exists last_full_sync_at timestamptz;

alter table public.orders
  add column if not exists gclid text,
  add column if not exists youcan_status_raw text,
  add column if not exists youcan_shipping_status_raw text,
  add column if not exists youcan_payment_status_raw text,
  add column if not exists youcan_status_synced_at timestamptz,
  add column if not exists youcan_status_sync_error text,
  add column if not exists youcan_sync_origin text,
  add column if not exists provider_payload_updated_at timestamptz;

alter table public.customers
  add column if not exists normalized_phone text,
  add column if not exists address text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists postal_code text,
  add column if not exists source_integration_id uuid references public.integrations(id) on delete set null,
  add column if not exists external_customer_id text,
  add column if not exists provider_updated_at timestamptz;

alter table public.products
  add column if not exists source_integration_id uuid references public.integrations(id) on delete set null,
  add column if not exists external_product_id text,
  add column if not exists provider_inventory integer,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists provider_published boolean;

alter table public.product_variants
  add column if not exists source_integration_id uuid references public.integrations(id) on delete set null,
  add column if not exists external_variant_id text,
  add column if not exists provider_inventory integer,
  add column if not exists provider_updated_at timestamptz;

-- A YouCan product id is tenant-local. Remove only the incorrect global
-- uniqueness rule; retain the existing workspace-scoped unique index.
alter table public.products drop constraint if exists products_youcan_product_id_key;

create unique index if not exists customers_workspace_youcan_external_uidx
  on public.customers(workspace_id, source_integration_id, external_customer_id)
  where external_customer_id is not null;
create index if not exists customers_workspace_normalized_phone_idx
  on public.customers(workspace_id, normalized_phone)
  where normalized_phone is not null;
create unique index if not exists products_workspace_integration_external_uidx
  on public.products(workspace_id, source_integration_id, external_product_id)
  where external_product_id is not null;
create unique index if not exists product_variants_workspace_integration_external_uidx
  on public.product_variants(workspace_id, source_integration_id, external_variant_id)
  where external_variant_id is not null;
create index if not exists orders_workspace_youcan_status_pending_idx
  on public.orders(workspace_id, updated_at)
  where source = 'youcan' and youcan_status_synced_at is null;
create index if not exists orders_workspace_gclid_idx
  on public.orders(workspace_id, gclid)
  where gclid is not null;

create table if not exists public.youcan_order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  external_line_id text not null,
  external_product_id text,
  external_variant_id text,
  sku text,
  product_name text,
  variant_name text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, order_id, external_line_id)
);

create table if not exists public.youcan_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  event_type text not null check (event_type in ('order.created','order.updated','order.paid','app.uninstalled')),
  provider_subscription_id text,
  status text not null default 'pending' check (status in ('pending','active','deactivated','failed')),
  last_verified_at timestamptz,
  last_delivery_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, event_type)
);

create table if not exists public.youcan_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  delivery_id text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing','processed','ignored','failed')),
  attempts integer not null default 1 check (attempts > 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (integration_id, delivery_id)
);

create table if not exists public.youcan_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  job_type text not null check (job_type in ('initial_backfill','orders','products','checkout_fields','finance','webhook_repair','status_outbound')),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','retry','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, integration_id, job_type, idempotency_key)
);

create table if not exists public.integration_field_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null default 'youcan',
  external_field_id text not null,
  external_label text,
  canonical_field text not null,
  language text,
  source text not null default 'automatic' check (source in ('automatic','seller_override')),
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, external_field_id)
);

create table if not exists public.youcan_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  captured_at timestamptz not null default now(),
  currency text,
  balance numeric,
  due_amount numeric,
  unpaid_invoices_amount numeric,
  provider_store_status text,
  unique (integration_id, captured_at)
);

create index if not exists youcan_order_items_workspace_order_idx on public.youcan_order_items(workspace_id, order_id);
create index if not exists youcan_webhook_subscriptions_health_idx on public.youcan_webhook_subscriptions(status, last_verified_at);
create index if not exists youcan_webhook_deliveries_retention_idx on public.youcan_webhook_deliveries(received_at);
create index if not exists youcan_sync_jobs_claim_idx on public.youcan_sync_jobs(status, available_at, created_at)
  where status in ('pending','retry');
create index if not exists youcan_sync_jobs_workspace_idx on public.youcan_sync_jobs(workspace_id, created_at desc);
create index if not exists integration_field_mappings_lookup_idx on public.integration_field_mappings(workspace_id, provider, canonical_field);
create index if not exists youcan_financial_snapshots_workspace_idx on public.youcan_financial_snapshots(workspace_id, captured_at desc);

alter table public.youcan_order_items enable row level security;
alter table public.youcan_webhook_subscriptions enable row level security;
alter table public.youcan_webhook_deliveries enable row level security;
alter table public.youcan_sync_jobs enable row level security;
alter table public.integration_field_mappings enable row level security;
alter table public.youcan_financial_snapshots enable row level security;

drop policy if exists youcan_order_items_member_select on public.youcan_order_items;
create policy youcan_order_items_member_select on public.youcan_order_items for select to authenticated
using ((select public.is_active_workspace_member(workspace_id)));
drop policy if exists integration_field_mappings_member_select on public.integration_field_mappings;
create policy integration_field_mappings_member_select on public.integration_field_mappings for select to authenticated
using ((select public.is_active_workspace_member(workspace_id)));
drop policy if exists youcan_financial_snapshots_member_select on public.youcan_financial_snapshots;
create policy youcan_financial_snapshots_member_select on public.youcan_financial_snapshots for select to authenticated
using ((select public.is_active_workspace_member(workspace_id)));

-- Operational tables are deliberately server-only even with RLS enabled.
revoke all on public.youcan_webhook_subscriptions, public.youcan_webhook_deliveries, public.youcan_sync_jobs from anon, authenticated;
grant all on public.youcan_webhook_subscriptions, public.youcan_webhook_deliveries, public.youcan_sync_jobs to service_role;
grant select on public.youcan_order_items, public.integration_field_mappings, public.youcan_financial_snapshots to authenticated;
grant all on public.youcan_order_items, public.integration_field_mappings, public.youcan_financial_snapshots to service_role;

create or replace function public.get_store_integration_status_v1(p_workspace_id uuid, p_provider text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare item public.integrations;
begin
  if not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into item from public.integrations integration
  where integration.workspace_id = p_workspace_id and lower(integration.provider) = lower(trim(p_provider));
  if not found then return jsonb_build_object('connected', false, 'status', 'inactive'); end if;
  return jsonb_build_object(
    'integration_id', item.id, 'provider', item.provider,
    'connected', item.status = 'active', 'status', item.status,
    'external_store_id', item.external_store_id, 'store_name', item.store_name,
    'store_slug', item.store_slug, 'store_domain', item.store_domain,
    'store_public_url', item.store_public_url, 'store_logo_url', item.store_logo_url,
    'store_currency', item.store_currency, 'provider_store_status', item.provider_store_status,
    'provider_store_active', item.provider_store_active, 'needs_reconnect', item.needs_reconnect,
    'webhook_health', item.webhook_health, 'webhook_last_checked_at', item.webhook_last_checked_at,
    'webhook_last_received_at', item.webhook_last_received_at,
    'last_full_sync_at', item.last_full_sync_at,
    'connected_at', item.connected_at, 'updated_at', item.updated_at
  );
end;
$$;
revoke all on function public.get_store_integration_status_v1(uuid,text) from public, anon;
grant execute on function public.get_store_integration_status_v1(uuid,text) to authenticated, service_role;

create or replace function public.admin_get_youcan_integrations_v2()
returns table (
  workspace_id uuid, connected boolean, status text, store_name text, external_store_id text,
  store_domain text, store_currency text, webhook_health text, webhook_last_received_at timestamptz,
  last_full_sync_at timestamptz, needs_reconnect boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.workspace_id, i.status='active', i.status, i.store_name, i.external_store_id,
    i.store_domain, i.store_currency, i.webhook_health, i.webhook_last_received_at,
    i.last_full_sync_at, i.needs_reconnect
  from public.integrations i
  where i.provider='youcan' and public.has_platform_permission('workspaces.read');
$$;
revoke all on function public.admin_get_youcan_integrations_v2() from public, anon;
grant execute on function public.admin_get_youcan_integrations_v2() to authenticated, service_role;

create or replace function private.enqueue_youcan_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare integration_id_value uuid;
begin
  if new.source <> 'youcan' or new.youcan_order_id is null then return new; end if;
  if new.youcan_sync_origin = 'provider'
     and new.provider_payload_updated_at is distinct from old.provider_payload_updated_at then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.shipping_status is not distinct from old.shipping_status
     and new.delivery_status is not distinct from old.delivery_status then return new; end if;
  select id into integration_id_value from public.integrations
   where workspace_id = new.workspace_id and provider = 'youcan' and status = 'active';
  if integration_id_value is null then return new; end if;
  insert into public.youcan_sync_jobs(workspace_id,integration_id,job_type,idempotency_key,payload)
  values (new.workspace_id,integration_id_value,'status_outbound',
    new."Order ID"::text || ':' || coalesce(new.status,'') || ':' || coalesce(new.shipping_status,new.delivery_status,''),
    jsonb_build_object('order_id',new."Order ID",'external_order_id',new.youcan_order_id,
      'status',new.status,'shipping_status',coalesce(new.shipping_status,new.delivery_status)))
  on conflict (workspace_id,integration_id,job_type,idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function private.enqueue_youcan_status_sync() from public, anon, authenticated;
grant execute on function private.enqueue_youcan_status_sync() to service_role;

drop trigger if exists enqueue_youcan_status_sync_trg on public.orders;
create trigger enqueue_youcan_status_sync_trg
after update of status, shipping_status, delivery_status on public.orders
for each row execute function private.enqueue_youcan_status_sync();

create or replace function public.claim_youcan_sync_jobs(p_worker text, p_limit integer default 10)
returns setof public.youcan_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id from public.youcan_sync_jobs
    where status in ('pending','retry') and available_at <= now()
    order by available_at, created_at
    for update skip locked limit greatest(1, least(p_limit, 50))
  )
  update public.youcan_sync_jobs job set
    status='processing', attempts=job.attempts+1, locked_at=now(), locked_by=p_worker, updated_at=now()
  from claimed where job.id=claimed.id returning job.*;
end;
$$;
revoke all on function public.claim_youcan_sync_jobs(text,integer) from public, anon, authenticated;
grant execute on function public.claim_youcan_sync_jobs(text,integer) to service_role;

create or replace function public.install_youcan_cron_jobs_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare function_url_exists boolean;
declare cron_secret_exists boolean;
declare existing_job bigint;
begin
  select exists(select 1 from vault.decrypted_secrets where name='youcan_reconcile_function_url') into function_url_exists;
  select exists(select 1 from vault.decrypted_secrets where name='youcan_cron_secret') into cron_secret_exists;
  if not function_url_exists or not cron_secret_exists then
    return jsonb_build_object('installed',false,'missing',array_remove(array[
      case when not function_url_exists then 'youcan_reconcile_function_url' end,
      case when not cron_secret_exists then 'youcan_cron_secret' end
    ],null));
  end if;
  select jobid into existing_job from cron.job where jobname='youcan-v2-reconcile';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('youcan-v2-reconcile','*/2 * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='youcan_reconcile_function_url' limit 1),
      headers := jsonb_build_object('Content-Type','application/json','x-youcan-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='youcan_cron_secret' limit 1)),
      body := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    );$job$);
  return jsonb_build_object('installed',true,'job_name','youcan-v2-reconcile');
end;
$$;
revoke all on function public.install_youcan_cron_jobs_v2() from public, anon, authenticated;
grant execute on function public.install_youcan_cron_jobs_v2() to service_role;

create or replace function public.configure_youcan_cron_v2(p_function_url text, p_cron_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare secret_id uuid;
begin
  if p_function_url !~ '^https://wxfialbmyfkafobtkrde[.]supabase[.]co/functions/v1/youcan-reconcile$'
     or length(p_cron_secret) < 32 then raise exception 'INVALID_CRON_CONFIGURATION'; end if;
  select id into secret_id from vault.secrets where name='youcan_reconcile_function_url';
  if secret_id is null then perform vault.create_secret(p_function_url,'youcan_reconcile_function_url','YouCan V2 internal worker URL');
  else perform vault.update_secret(secret_id,p_function_url,'youcan_reconcile_function_url','YouCan V2 internal worker URL'); end if;
  select id into secret_id from vault.secrets where name='youcan_cron_secret';
  if secret_id is null then perform vault.create_secret(p_cron_secret,'youcan_cron_secret','YouCan V2 internal scheduler credential');
  else perform vault.update_secret(secret_id,p_cron_secret,'youcan_cron_secret','YouCan V2 internal scheduler credential'); end if;
end;
$$;
revoke all on function public.configure_youcan_cron_v2(text,text) from public, anon, authenticated;
grant execute on function public.configure_youcan_cron_v2(text,text) to service_role;

comment on table public.youcan_sync_jobs is 'Server-only retry-safe YouCan synchronization work queue.';
comment on table public.youcan_webhook_deliveries is 'Deduplicates YouCan webhook deliveries using X-YOUCAN-DELIVERY-ID.';
comment on column public.integrations.access_token_encrypted is 'Server-only AES-GCM envelope; never expose through seller queries.';

-- Existing sellers stay connected for their already-authorized capabilities.
-- They are prompted to reconnect once to grant the new product/status scopes.
update public.integrations
set needs_reconnect = true,
    webhook_health = case when status='active' then 'pending' else webhook_health end
where provider='youcan' and status='active' and cardinality(granted_scopes)=0;

insert into public.youcan_sync_jobs(workspace_id,integration_id,job_type,idempotency_key,payload,status)
select workspace_id,id,'orders','v2-backfill:orders','{}'::jsonb,'pending'
from public.integrations where provider='youcan' and status='active'
on conflict (workspace_id,integration_id,job_type,idempotency_key) do nothing;
insert into public.youcan_sync_jobs(workspace_id,integration_id,job_type,idempotency_key,payload,status)
select workspace_id,id,'webhook_repair','v2-backfill:webhooks','{}'::jsonb,'pending'
from public.integrations where provider='youcan' and status='active'
on conflict (workspace_id,integration_id,job_type,idempotency_key) do nothing;

commit;
