import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Legacy Meta uses account insights for cards and stores native campaign metrics", () => {
  const edge = read("supabase/functions/meta-legacy/index.ts");
  const migration = read("supabase/migrations/20260921090605_legacy_meta_metrics_and_preferences.sql");

  assert.match(edge, /action === "overview"/);
  assert.match(edge, /level: "account"/);
  assert.match(edge, /inline_link_clicks/);
  assert.match(edge, /meta_metrics: metrics/);
  assert.match(migration, /add column if not exists meta_metrics jsonb/);
});

test("Legacy Meta lets workspace managers control campaigns and users save only their own layout", () => {
  const edge = read("supabase/functions/meta-legacy/index.ts");
  const migration = read("supabase/migrations/20260921090605_legacy_meta_metrics_and_preferences.sql");
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(edge, /action === "update_campaign_status"/);
  assert.match(edge, /body: \{ status: nextStatus \}/);
  assert.match(migration, /primary key \(user_id, workspace_id\)/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(page, /Choose your Meta metrics/);
  assert.match(page, /updateCampaignStatus/);
});

test("Legacy Meta creative preview presents one item with carousel navigation", () => {
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(page, /Previous creative/);
  assert.match(page, /Next creative/);
  assert.match(page, /creativeIndex \+ 1/);
  assert.match(page, /activeCreative\.video_url/);
  assert.match(page, /aspect-\[9\/16\]/);
  assert.match(page, /blur-2xl/);
});

test("sync places the refreshed campaigns into the visible page state", () => {
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(page, /const \[syncedCampaigns, nextStatus\] = await Promise\.all/);
  assert.match(page, /setCampaigns\(syncedCampaigns\)/);
});

test("connected users keep the configured legacy account fixed", () => {
  const edge = read("supabase/functions/meta-legacy/index.ts");
  const service = read("src/services/metaLegacyService.ts");
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(edge, /"list_ad_accounts"/);
  assert.match(edge, /"switch_ad_account"/);
  assert.match(service, /connect: \(adAccountId: string, accessToken: string\)/);
  assert.doesNotMatch(page, /listAdAccounts/);
  assert.doesNotMatch(page, /switchAdAccount/);
  assert.doesNotMatch(page, /aria-label="Meta ad account"/);
});

test("legacy page renders cached native Meta metrics and tolerates overview refresh errors", () => {
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(page, /\.from\("meta_legacy_campaigns"\)\s*\.select\("\*"\)/);
  assert.match(page, /\.range\(from, from \+ 499\)/);
  assert.match(page, /setCampaigns\(fetched\)/);
  assert.match(page, /cachedOverviewKey/);
  assert.match(page, /dashboard-date-changed/);
  assert.match(page, /const totals = overview/);
  assert.doesNotMatch(page, /campaigns\.reduce<MetaLegacyMetrics>/);
});
