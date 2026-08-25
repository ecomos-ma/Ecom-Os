-- ============================================================
-- EcomOS · Meta Campaigns table (live Meta API data)
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists public.meta_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  meta_campaign_id   text not null unique,     -- Facebook campaign ID
  campaign_name      text not null,
  status             text not null default 'UNKNOWN',
  budget             numeric(12,2),            -- daily or lifetime budget in local currency
  spend              numeric(12,2) not null default 0,
  reach              bigint not null default 0,
  impressions        bigint not null default 0,
  clicks             bigint not null default 0,
  ctr                numeric(8,4) not null default 0,   -- %
  cpc                numeric(12,4) not null default 0,
  cpm                numeric(12,4) not null default 0,
  frequency          numeric(8,4) not null default 0,
  results            integer not null default 0,        -- leads / purchases
  cost_per_result    numeric(12,4) not null default 0,
  updated_at         timestamptz not null default now()
);

create index if not exists meta_campaigns_status_idx     on public.meta_campaigns(status);
create index if not exists meta_campaigns_updated_at_idx on public.meta_campaigns(updated_at desc);

alter table public.meta_campaigns enable row level security;

create policy "Authenticated users can read meta_campaigns"
  on public.meta_campaigns for select using (auth.role() = 'authenticated');

drop policy if exists "Service role can upsert meta_campaigns" on public.meta_campaigns;
create policy "Service role can upsert meta_campaigns"
  on public.meta_campaigns for all using (auth.role() = 'service_role');

-- Enable realtime so the UI refreshes automatically after sync (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE n.nspname = 'public' AND c.relname = 'meta_campaigns' AND p.pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_campaigns;
  END IF;
END$$;
