import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("keeps OAuth Ads Manager and adds a separate legacy route", () => {
  const app = read("src/App.tsx");
  const sidebar = read("src/components/Sidebar.tsx");

  assert.match(app, /path="\/ads-manager"/);
  assert.match(app, /path="\/ads-manager-legacy"/);
  assert.match(app, /<AdsManager \/>/);
  assert.match(app, /<LegacyAdsManager \/>/);
  assert.match(sidebar, /to: "\/ads-manager-legacy"/);
  assert.match(sidebar, /permission: "ads"/);
});

test("manual token is encrypted server-side and never persisted by the browser", () => {
  const edge = read("supabase/functions/meta-legacy/index.ts");
  const page = read("src/pages/LegacyAdsManager.tsx");
  const service = read("src/services/metaLegacyService.ts");

  assert.match(edge, /encryptSecret\(accessToken\)/);
  assert.match(edge, /resolveActiveWorkspace\(client, user\.id, manage\)/);
  assert.match(edge, /appSecretProof: false/);
  assert.doesNotMatch(edge, /meta_access_token/);
  assert.doesNotMatch(page, /localStorage.*accessToken/i);
  assert.doesNotMatch(service, /localStorage/i);
  assert.match(page, /setAccessToken\(""\)/);
});

test("legacy database objects are isolated and credentials are not exposed", () => {
  const migration = read(
    "supabase/migrations/20260910180122_meta_legacy_manual_ads_manager.sql",
  );
  const page = read("src/pages/LegacyAdsManager.tsx");

  assert.match(migration, /create table if not exists public\.meta_legacy_connections/);
  assert.match(migration, /create table if not exists public\.meta_legacy_campaigns/);
  assert.match(migration, /access_token_encrypted text/);
  assert.match(
    migration,
    /revoke all on public\.meta_legacy_connections from public, anon, authenticated/,
  );
  assert.match(migration, /alter table public\.meta_legacy_campaigns enable row level security/);
  assert.match(migration, /public\.meta_can_access_workspace\(workspace_id\)/);
  assert.match(page, /\.eq\("workspace_id", workspace\.id\)/);
});

test("dashboard uses the authenticated Legacy Meta report for its selected dates", () => {
  const dashboard = read("src/pages/Dashboard.tsx");
  const hook = read("src/hooks/useDashboardData.ts");
  const service = read("src/services/metaLegacyService.ts");
  const edge = read("supabase/functions/meta-legacy/index.ts");

  assert.match(hook, /metaLegacyService\.report/);
  assert.match(hook, /since: startDateStr, until: endDateStr/);
  assert.match(hook, /legacyReport\?\.connected === true/);
  assert.match(hook, /useLegacySpend\s*\?\s*metaTotalSpend/);
  assert.match(service, /action: "report"/);
  assert.match(edge, /level: "account"/);
  assert.match(edge, /time_increment:/);
  assert.match(edge, /fields: "spend,actions,date_start,date_stop"/);
  assert.match(dashboard, /weekAgo\.setDate\(weekAgo\.getDate\(\) - 6\)/);
  assert.match(dashboard, /\$\{adCurrency\} \$\{metrics\.adSpend/);
});

test("campaign details expose only safe creative media and product links", () => {
  const edge = read("supabase/functions/meta-legacy/index.ts");
  const page = read("src/pages/LegacyAdsManager.tsx");
  const service = read("src/services/metaLegacyService.ts");

  assert.match(service, /action: "campaign_detail"/);
  assert.match(edge, /campaignAccountId !== connection\.ad_account_id/);
  assert.match(edge, /creative\{id,name,title,body,thumbnail_url,image_url,video_id,object_story_spec,asset_feed_spec\}/);
  assert.match(edge, /url\.searchParams\.delete\("access_token"\)/);
  assert.match(edge, /video_url: safeHttpUrl\(linkedVideo\?\.source\)/);
  assert.match(edge, /destination_urls: destinations/);
  assert.doesNotMatch(edge, /return jsonResponse\(req, \{[^}]*token/s);
  assert.match(page, /Loading creative from Meta/);
  assert.match(page, /<video/);
  assert.match(page, /Open product page/);
});
