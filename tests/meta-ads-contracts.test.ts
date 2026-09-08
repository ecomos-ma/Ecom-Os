import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBulkLaunchPlan, replaceNamingVariables } from "../supabase/functions/_shared/meta-bulk-plan.ts";
import { cappedBudgetIncrease, evaluateRuleConditions, isStale } from "../supabase/functions/_shared/meta-rules-core.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260908010528_meta_ads_manager.sql");
const meta = read("supabase/functions/_shared/meta.ts");
const authStart = read("supabase/functions/meta-auth-start/index.ts");
const authCallback = read("supabase/functions/meta-auth-callback/index.ts");
const manage = read("supabase/functions/meta-manage/index.ts");
const bulk = read("supabase/functions/meta-bulk/index.ts");
const rules = read("supabase/functions/meta-rules/index.ts");

test("OAuth state is random, hashed, expiring, single-use, and callback-bound", () => {
  assert.match(authStart, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(authStart, /state_hash:\s*await sha256\(state\)/);
  assert.match(authStart, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(authStart, /META_REDIRECT_URI/);
  assert.match(authCallback, /\.is\("consumed_at", null\)/);
  assert.match(authCallback, /new Date\(stateRow\.expires_at\)\.getTime\(\) <= Date\.now\(\)/);
  assert.match(authCallback, /fb_exchange_token/);
});

test("Meta operations resolve the active workspace from the authenticated user", () => {
  assert.match(meta, /resolveActiveWorkspace/);
  assert.match(meta, /!membership \|\| String\(membership\.status/);
  assert.doesNotMatch(authStart, /workspace_id\?:/);
  for (const file of ["meta-assets", "meta-manage", "meta-sync", "meta-bulk", "meta-rules", "meta-disconnect"]) {
    assert.match(read(`supabase/functions/${file}/index.ts`), /resolveActiveWorkspace\(client, user\.id/);
  }
  assert.match(migration, /join public\.profile_workspaces pw/);
  assert.match(migration, /meta_can_access_workspace\(workspace_id\)/);
});

test("tokens are encrypted and never granted to browser roles", () => {
  assert.match(meta, /AES-GCM/);
  assert.match(meta, /META_TOKEN_ENCRYPTION_KEY/);
  assert.match(meta, /appsecret_proof/);
  assert.match(migration, /revoke all on public\.meta_oauth_states from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.meta_connections from anon, authenticated/);
  assert.doesNotMatch(read("src/pages/settings/components/MetaIntegrationCard.tsx"), /Access Token|meta_access_token|System User/);
});

test("writes are mirrored only after Meta confirms them", () => {
  const providerCall = manage.indexOf("await metaRequest<T>");
  const confirmation = manage.indexOf("Meta did not confirm the change");
  const mirror = manage.indexOf("await input.mirror(response)");
  assert.ok(providerCall >= 0 && confirmation > providerCall && mirror > confirmation);
  assert.match(manage, /assertEntity\(client, workspaceId/);
  assert.match(manage, /assertAccount\(client, workspaceId/);
});

test("daily insights and durable jobs have scoped idempotency keys", () => {
  assert.match(migration, /unique \(workspace_id, ad_account_id, reporting_level, entity_id, report_date\)/);
  assert.match(migration, /unique \(workspace_id, idempotency_key\)/);
  assert.match(migration, /unique \(job_id, item_index\)/);
  assert.match(bulk, /deduplicated: true/);
  assert.match(bulk, /findByName/);
  assert.match(bulk, /attempts >= Number\(job\.max_attempts/);
});

test("Meta API retries rate limits and temporary failures with backoff", () => {
  assert.match(meta, /code === 4 \|\| code === 17 \|\| code === 32 \|\| code === 613/);
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
  assert.equal(replaceNamingVariables("{PRODUCT_NAME} {DATE} {INDEX} {CREATIVE_NAME}", { productName: "Serum", date: "2026-09-08", index: 1, creativeName: "UGC" }), "Serum 2026-09-08 002 UGC");
  assert.throws(() => buildBulkLaunchPlan({ creatives: [] }), /between 1 and 1000/);
});

test("rules require all conditions and enforce stale and daily safety caps", () => {
  assert.equal(evaluateRuleConditions({ spend: 120, orders: 0 }, [{ field: "spend", operator: "gt", value: 100 }, { field: "orders", operator: "eq", value: 0 }]), true);
  assert.equal(evaluateRuleConditions({ spend: 120, orders: 1 }, [{ field: "spend", operator: "gt", value: 100 }, { field: "orders", operator: "eq", value: 0 }]), false);
  assert.equal(cappedBudgetIncrease(100, 40, 10, 30), 120);
  assert.equal(isStale(new Date(Date.now() - 181 * 60_000).toISOString(), 180), true);
  assert.match(rules, /global_automation_kill_switch/);
  assert.match(rules, /max_duplicates_day/);
  assert.match(rules, /stale_data_guard_triggered/);
});

test("workspace defaults are unique and server-validated", () => {
  for (const index of ["meta_ad_accounts_one_default_idx", "meta_pages_one_default_idx", "meta_instagram_accounts_one_default_idx", "meta_pixels_one_default_idx"]) assert.match(migration, new RegExp(index));
  const assets = read("supabase/functions/meta-assets/index.ts");
  assert.match(assets, /Selected asset is not available in this workspace/);
  assert.match(assets, /\.eq\("workspace_id", workspaceId\)\.eq\(config\.id, body\.asset_id\)/);
});
