import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildBulkLaunchPlan,
  replaceNamingVariables,
} from "../supabase/functions/_shared/meta-bulk-plan.ts";
import {
  cappedBudgetIncrease,
  evaluateRuleConditions,
  isStale,
} from "../supabase/functions/_shared/meta-rules-core.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260908010528_meta_ads_manager.sql",
);
const reconciliation = read(
  "supabase/migrations/20260908130000_meta_production_reconciliation.sql",
);
const legacyReconnect = read(
  "supabase/migrations/20260908131500_meta_legacy_reconnect_and_oauth_preservation.sql",
);
const meta = read("supabase/functions/_shared/meta.ts");
const authStart = read("supabase/functions/meta-auth-start/index.ts");
const authCallback = read("supabase/functions/meta-auth-callback/index.ts");
const authCompat = read("supabase/functions/meta-oauth-callback/index.ts");
const signedRequest = read("supabase/functions/_shared/meta-signed-request.ts");
const deauthorize = read("supabase/functions/meta-deauthorize/index.ts");
const dataDeletion = read("supabase/functions/meta-data-deletion/index.ts");
const metaSync = read("supabase/functions/meta-sync/index.ts");
const legacySync = read("supabase/functions/sync-meta-ads/index.ts");
const legacyAccounts = read("supabase/functions/list-meta-adaccounts/index.ts");
const legacySetAccount = read("supabase/functions/set-meta-account/index.ts");
const securityReconciliation = read(
  "supabase/migrations/20260908140000_targeted_security_reconciliation.sql",
);
const metaService = read("src/services/metaAdsService.ts");
const metaCard = read("src/pages/settings/components/MetaIntegrationCard.tsx");
const manage = read("supabase/functions/meta-manage/index.ts");
const bulk = read("supabase/functions/meta-bulk/index.ts");
const rules = read("supabase/functions/meta-rules/index.ts");

test("OAuth state is random, hashed, expiring, single-use, and callback-bound", () => {
  assert.match(authStart, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(authStart, /state_hash:\s*await sha256\(state\)/);
  assert.match(authStart, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(authStart, /META_REDIRECT_URI/);
  assert.match(authStart, /META_LOGIN_CONFIG_ID/);
  assert.match(
    authStart,
    /searchParams\.set\(\s*"config_id",\s*requiredEnv\("META_LOGIN_CONFIG_ID"\)/,
  );
  assert.match(authCallback, /\.is\("consumed_at", null\)/);
  assert.match(
    authCallback,
    /new Date\(stateRow\.expires_at\)\.getTime\(\) <= Date\.now\(\)/,
  );
  assert.match(authCallback, /fb_exchange_token/);
  assert.match(authCompat, /meta-auth-callback\/index\.ts/);
  assert.match(authCallback, /denied \|\| !code/);
  assert.match(authCallback, /Meta authorization was cancelled/);
  assert.match(authCallback, /assets\.accounts\.length \? "connected" : "select_assets"/);
  assert.match(authCallback, /Missing permissions/);
  assert.match(authCallback, /returnUrl/);
});

test("OAuth start reuses stale connecting connections without the v3 query-builder regression", () => {
  assert.match(authStart, /\.from\("meta_connections"\)\s*\.select\("id,status"\)\s*\.eq\("workspace_id", workspaceId\)/);
  assert.match(authStart, /\.from\("meta_oauth_states"\)[\s\S]{0,220}\.is\("consumed_at", null\)[\s\S]{0,80}\.lte\("expires_at", now\)/);
  assert.match(authStart, /activeConnection\.status === "connecting"/);
  assert.doesNotMatch(authStart, /\.from\("meta_connections"\)\s*\.eq\(/);
  assert.match(authStart, /request_id: requestId/);
  assert.match(authStart, /stage,/);
  assert.match(authStart, /error_code:/);
  assert.doesNotMatch(authStart, /console\.error\([\s\S]{0,220}(?:token|secret|jwt|authorization_code|state)/i);
});

test("legacy Meta endpoints are authenticated retirement stubs and V2 remains canonical", () => {
  for (const source of [legacySync, legacyAccounts, legacySetAccount]) {
    assert.match(source, /status: 410/);
    const executableSource = source.replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(executableSource, /meta_access_token|access_token|workspace_id/);
  }
  assert.match(metaSync, /syncWorkspace/);
  assert.match(metaSync, /isCronRequest/);
});

test("Connect uses the canonical start function, redirects immediately, and shows a safe failure", () => {
  assert.match(metaService, /invoke<[^>]+>\("meta-auth-start"/);
  assert.match(metaService, /authorization_url/);
  assert.match(metaService, /window\.location\.assign\(authorizationUrl\)/);
  assert.match(
    metaCard,
    /https:\/\/www\.ecomos\.ma\/settings\?tab=integrations/,
  );
  assert.match(metaCard, /Connecting…/);
  assert.match(metaCard, /Unable to start Meta connection\./);
  assert.match(authCallback, /settings\?tab=integrations/);
  assert.doesNotMatch(authCallback, /settings\/integrations\/meta/);
});

test("Meta configuration errors name the missing variable without disclosing values", () => {
  assert.match(meta, /Missing environment variable: \$\{name\}/);
  assert.match(authStart, /META_APP_ID/);
  assert.match(authStart, /META_LOGIN_CONFIG_ID/);
  assert.match(authStart, /META_REDIRECT_URI/);
  assert.match(authCallback, /META_APP_SECRET/);
  assert.match(authCallback, /META_REDIRECT_URI/);
});

test("Meta operations resolve the active workspace from the authenticated user", () => {
  assert.match(meta, /resolveActiveWorkspace/);
  assert.match(meta, /!membership\s*\|\|\s*String\(membership\.status/);
  assert.doesNotMatch(authStart, /workspace_id\?:/);
  for (const file of [
    "meta-assets",
    "meta-manage",
    "meta-sync",
    "meta-bulk",
    "meta-rules",
    "meta-disconnect",
  ]) {
    assert.match(
      read(`supabase/functions/${file}/index.ts`),
      /resolveActiveWorkspace\([\s\S]{0,80}client,[\s\S]{0,80}user\.id/,
    );
  }
  assert.match(migration, /join public\.profile_workspaces pw/);
  assert.match(migration, /meta_can_access_workspace\(workspace_id\)/);
});

test("tokens are encrypted and never granted to browser roles", () => {
  assert.match(meta, /AES-GCM/);
  assert.match(meta, /META_TOKEN_ENCRYPTION_KEY/);
  assert.match(meta, /appsecret_proof/);
  assert.match(
    migration,
    /revoke all on public\.meta_oauth_states from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on public\.meta_connections from anon, authenticated/,
  );
  assert.doesNotMatch(
    metaCard,
    /Access Token|meta_access_token|System User/,
  );
});

test("OAuth callbacks, deauthorization, and deletion trust only signed Meta input", () => {
  assert.match(signedRequest, /META_APP_SECRET/);
  assert.match(signedRequest, /HMAC/);
  assert.match(signedRequest, /timingSafeEqual/);
  assert.match(deauthorize, /verifyMetaSignedRequest/);
  assert.match(deauthorize, /\.eq\("meta_user_id", payload\.user_id\)/);
  assert.match(dataDeletion, /verifyMetaSignedRequest/);
  assert.match(dataDeletion, /Verified Meta data-deletion callback/);
  assert.match(dataDeletion, /confirmation_code/);
});

test("the reconciliation migration installs only additive Meta V2 schema and isolation controls", () => {
  assert.match(reconciliation, /create table if not exists public\.meta_connections/);
  assert.match(
    reconciliation,
    /execute format\('alter table public\.%I enable row level security'/,
  );
  assert.match(reconciliation, /meta_oauth_states_expiry_idx/);
  assert.match(reconciliation, /meta_bulk_jobs_queue_idx/);
  assert.match(reconciliation, /create or replace function public\.get_meta_integration_status/);
  assert.match(reconciliation, /revoke all on public\.meta_connections from anon, authenticated/);
  assert.doesNotMatch(reconciliation, /drop table/i);
});

test("legacy sync cannot use browser-supplied workspace IDs", () => {
  assert.match(metaSync, /resolveActiveWorkspace\(client, user\.id, false\)/);
  assert.doesNotMatch(metaSync, /body\.workspace_id/);
  assert.doesNotMatch(metaSync, /workspace_id\?:/);
  assert.match(metaSync, /body\.scheduled && isCronRequest\(req\)/);
});

test("reconnect does not erase an existing encrypted connection before OAuth succeeds", () => {
  assert.match(authStart, /const \{ data: activeConnection/);
  assert.match(authStart, /\.update\(\{[\s\S]{0,180}connected_by: user\.id/);
  assert.doesNotMatch(authStart, /access_token_encrypted: null/);
  assert.match(authCallback, /\.eq\("status", "connecting"\)/);
  assert.match(legacyReconnect, /'reauth_required'/);
  assert.match(legacyReconnect, /w\.meta_access_token/);
  assert.doesNotMatch(legacyReconnect, /select\s+w\.meta_access_token/i);
});

test("targeted security reconciliation removes browser access and fixes retained definers", () => {
  assert.match(securityReconciliation, /drop function if exists public\.admin_get_all_workspaces/);
  assert.doesNotMatch(securityReconciliation, /meta_access_token text/);
  for (const functionName of [
    "admin_get_all_profiles",
    "admin_get_all_workspaces",
    "reset_workspace",
    "decrypt_secret",
    "upsert_shipping_credentials",
    "create_inventory_movement",
    "increment_returned_stock",
    "get_whatsapp_conversation",
    "get_daily_ad_spend",
    "can_reset_workspace",
    "reset_workspace_data_v2",
  ]) {
    assert.match(securityReconciliation, new RegExp(`revoke all on function public\\.${functionName}`));
  }
  assert.match(securityReconciliation, /alter view public\.agent_leaderboard set \(security_invoker = true\)/);
  assert.match(securityReconciliation, /alter function public\.decrypt_secret\(text\) set search_path = public/);
});

test("writes are mirrored only after Meta confirms them", () => {
  const providerCall = manage.indexOf("await metaRequest<T>");
  const confirmation = manage.indexOf("Meta did not confirm the change");
  const mirror = manage.indexOf("await input.mirror(response)");
  assert.ok(
    providerCall >= 0 && confirmation > providerCall && mirror > confirmation,
  );
  assert.match(
    manage,
    /assertEntity\([\s\S]{0,100}client,[\s\S]{0,100}workspaceId/,
  );
  assert.match(
    manage,
    /assertAccount\([\s\S]{0,100}client,[\s\S]{0,100}workspaceId/,
  );
});

test("daily insights and durable jobs have scoped idempotency keys", () => {
  assert.match(
    migration,
    /unique \(workspace_id, ad_account_id, reporting_level, entity_id, report_date\)/,
  );
  assert.match(migration, /unique \(workspace_id, idempotency_key\)/);
  assert.match(migration, /unique \(job_id, item_index\)/);
  assert.match(bulk, /deduplicated: true/);
  assert.match(bulk, /findByName/);
  assert.match(bulk, /attempts >= maxAttempts/);
});

test("Meta API retries rate limits and temporary failures with backoff", () => {
  assert.match(meta, /"v26\.0"/);
  assert.match(
    meta,
    /code === 4\s*\|\|\s*code === 17\s*\|\|\s*code === 32\s*\|\|\s*code === 613/,
  );
  assert.match(meta, /classified\.retryable && attempt < retries/);
  assert.match(meta, /retry-after/);
  assert.match(meta, /500 \* 2 \*\* attempt/);
});

test("bulk preview supports safe paused distribution and naming", () => {
  const preview = buildBulkLaunchPlan({
    product_name: "Serum",
    adset_count: 2,
    adsets: [{ daily_budget: 12 }, { daily_budget: 18 }],
    creatives: [{ name: "A" }, { name: "B" }, { name: "C" }],
    distribution_mode: "round_robin",
  });
  assert.equal(preview.ad_count, 3);
  assert.equal(preview.adset_count, 2);
  assert.equal(preview.max_daily_budget, 30);
  assert.equal(preview.create_status, "PAUSED");
  assert.equal(
    replaceNamingVariables("{PRODUCT_NAME} {DATE} {INDEX} {CREATIVE_NAME}", {
      productName: "Serum",
      date: "2026-09-08",
      index: 1,
      creativeName: "UGC",
    }),
    "Serum 2026-09-08 002 UGC",
  );
  assert.throws(
    () => buildBulkLaunchPlan({ creatives: [] }),
    /between 1 and 1000/,
  );
  assert.throws(
    () =>
      buildBulkLaunchPlan({
        creatives: Array.from({ length: 11 }, (_, index) => ({
          name: String(index),
        })),
        primary_texts: Array.from({ length: 10 }, () => "Text"),
        headlines: Array.from({ length: 10 }, () => "Headline"),
        distribution_mode: "combinations",
      }),
    /1,000-ad job safety limit/,
  );
});

test("rules require all conditions and enforce stale and daily safety caps", () => {
  assert.equal(
    evaluateRuleConditions({ spend: 120, orders: 0 }, [
      { field: "spend", operator: "gt", value: 100 },
      { field: "orders", operator: "eq", value: 0 },
    ]),
    true,
  );
  assert.equal(
    evaluateRuleConditions({ spend: 120, orders: 1 }, [
      { field: "spend", operator: "gt", value: 100 },
      { field: "orders", operator: "eq", value: 0 },
    ]),
    false,
  );
  assert.equal(cappedBudgetIncrease(100, 40, 10, 30), 120);
  assert.equal(
    isStale(new Date(Date.now() - 181 * 60_000).toISOString(), 180),
    true,
  );
  assert.match(rules, /global_automation_kill_switch/);
  assert.match(rules, /max_duplicates_day/);
  assert.match(rules, /stale_data_guard_triggered/);
  assert.match(rules, /Number\(orders\.net_profit\) - spend/);
});

test("workspace defaults are unique and server-validated", () => {
  for (const index of [
    "meta_ad_accounts_one_default_idx",
    "meta_pages_one_default_idx",
    "meta_instagram_accounts_one_default_idx",
    "meta_pixels_one_default_idx",
  ])
    assert.match(migration, new RegExp(index));
  const assets = read("supabase/functions/meta-assets/index.ts");
  assert.match(assets, /Selected asset is not available in this workspace/);
  assert.match(assets, /\.eq\("connection_id", connection\.id\)/);
  assert.match(assets, /\.eq\(config\.id, body\.asset_id\)/);
});
