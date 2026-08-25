// Run with: node apply_meta_migration.js
// Requires your SERVICE ROLE key (from .env comment)

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "your-project-ref";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "your-service-role-key";

const SQL = `
create table if not exists public.meta_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  meta_campaign_id   text not null unique,
  campaign_name      text not null,
  status             text not null default 'UNKNOWN',
  budget             numeric(12,2),
  spend              numeric(12,2) not null default 0,
  reach              bigint not null default 0,
  impressions        bigint not null default 0,
  clicks             bigint not null default 0,
  ctr                numeric(8,4) not null default 0,
  cpc                numeric(12,4) not null default 0,
  cpm                numeric(12,4) not null default 0,
  frequency          numeric(8,4) not null default 0,
  results            integer not null default 0,
  cost_per_result    numeric(12,4) not null default 0,
  updated_at         timestamptz not null default now()
);

create index if not exists meta_campaigns_status_idx     on public.meta_campaigns(status);
create index if not exists meta_campaigns_updated_at_idx on public.meta_campaigns(updated_at desc);

do $pgsql$ begin
  alter table public.meta_campaigns enable row level security;
exception when others then null; end $pgsql$;

do $pgsql$ begin
  create policy "Authenticated users can read meta_campaigns"
    on public.meta_campaigns for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $pgsql$;

do $pgsql$ begin
  create policy "Service role can upsert meta_campaigns"
    on public.meta_campaigns for all using (auth.role() = 'service_role');
exception when duplicate_object then null; end $pgsql$;
`;

async function run() {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: SQL }),
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}

run().catch(console.error);
