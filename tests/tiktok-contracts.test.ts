import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("OAuth state is opaque, hashed, expiring and single-use", () => {
  const start = read("supabase/functions/tiktok-auth-start/index.ts");
  const callback = read("supabase/functions/tiktok-auth-callback/index.ts");
  assert.match(start, /crypto\.getRandomValues/);
  assert.match(start, /state_hash:\s*await sha256/);
  assert.match(start, /10 \* 60 \* 1000/);
  assert.match(callback, /\.is\("consumed_at", null\)/);
  assert.match(callback, /stateRow\.consumed_at/);
});

test("report pagination, idempotent insight upsert and retries are present", () => {
  const shared = read("supabase/functions/_shared/tiktok.ts");
  const sync = read("supabase/functions/_shared/tiktok-sync.ts");
  assert.match(shared, /fetchTikTokPages/);
  assert.match(shared, /page <= 100/);
  assert.match(shared, /retry-after/);
  assert.match(sync, /workspace_id,advertiser_id,reporting_level,entity_id,report_date/);
});

test("RLS, stable event uniqueness and after-order queueing are enforced", () => {
  const migration = read("supabase/migrations/20260825015721_tiktok_ads_integration.sql");
  assert.match(migration, /alter table public\.tiktok_ad_insights enable row level security/i);
  assert.match(migration, /unique \(workspace_id, order_id, event_name\)/i);
  assert.match(migration, /foreign key \(order_id\) references public\.orders on delete cascade/i);
  assert.match(migration, /to_jsonb\(new\)->>'Order ID'/);
  assert.doesNotMatch(migration, /references public\.orders\(id\)/i);
  assert.doesNotMatch(migration, /\bnew\.id\b/i);
  assert.match(migration, /after insert or update of status, delivery_status, shipping_status, cod_payment_collected/i);
  assert.match(migration, /grant execute on function private\.install_tiktok_cron_jobs\(\) to service_role/i);
});

test("TikTok migration is safe to rerun after a partially applied SQL-editor execution", () => {
  const migration = read("supabase/migrations/20260825015721_tiktok_ads_integration.sql");
  assert.doesNotMatch(migration, /create table public\.tiktok_/i);
  assert.doesNotMatch(migration, /create index tiktok_/i);
  assert.match(migration, /SQL Editor copies\.\s*;\s*create table if not exists public\.tiktok_oauth_states/is);
  assert.match(migration, /drop constraint if exists tiktok_oauth_states_connection_id_fkey/i);
  assert.match(migration, /drop policy if exists tiktok_event_logs_select/i);
});

test("disconnect wipes credentials but preserves reporting", () => {
  const disconnect = read("supabase/functions/tiktok-disconnect/index.ts");
  assert.match(disconnect, /access_token_encrypted:\s*null/);
  assert.doesNotMatch(disconnect, /from\("tiktok_ad_insights"\)\.delete/);
});

test("shared profit formulas and TikTok page use the single profit engine", () => {
  const metrics = read("src/lib/metrics.ts");
  const page = read("src/pages/TikTokAds.tsx");
  assert.match(metrics, /const netProfit = revenue - totalCosts/);
  assert.match(metrics, /const roas = adSpend > 0 \? revenue \/ adSpend : 0/);
  assert.match(page, /calculateWorkspaceProfit/);
  assert.match(page, /hasCurrencyMismatch/);
});

test("attribution priority and supported token refresh behavior are explicit", () => {
  const migration = read("supabase/migrations/20260825015721_tiktok_ads_integration.sql");
  const refresh = read("supabase/functions/tiktok-refresh-token/index.ts");
  assert.ok(migration.indexOf("if new.ttclid is not null") < migration.indexOf("if new.tiktok_ad_id is not null"));
  assert.ok(migration.indexOf("if new.tiktok_ad_id is not null") < migration.indexOf("if nullif(trim(coalesce(new.utm_campaign"));
  assert.match(refresh, /marketing_api_long_term/);
  assert.match(refresh, /tt_user\/oauth2\/refresh_token/);
});
