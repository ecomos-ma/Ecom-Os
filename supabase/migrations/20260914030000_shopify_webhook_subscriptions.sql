begin;

create table if not exists public.shopify_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_domain text not null,
  topic text not null check (topic in ('orders/create', 'orders/updated', 'app/uninstalled')),
  provider_webhook_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, topic)
);

create index if not exists shopify_webhook_subs_workspace_idx on public.shopify_webhook_subscriptions(workspace_id);
create index if not exists shopify_webhook_subs_domain_idx on public.shopify_webhook_subscriptions(shop_domain);

alter table public.shopify_webhook_subscriptions enable row level security;
revoke all on public.shopify_webhook_subscriptions from public, anon, authenticated;
grant all on public.shopify_webhook_subscriptions to service_role;

commit;
