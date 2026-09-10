import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shared = read("supabase/functions/_shared/youcan.ts");
const oauthStart = read("supabase/functions/youcan-generate-state/index.ts");
const callback = read("supabase/functions/youcan-oauth-callback/index.ts");
const webhook = read("supabase/functions/youcan-webhook/index.ts");
const background = read("supabase/functions/_shared/youcan-background.ts");
const manualSync = read("supabase/functions/youcan-sync-orders/index.ts");
const reconcile = read("supabase/functions/youcan-reconcile/index.ts");
const disconnect = read("supabase/functions/youcan-disconnect/index.ts");
const migration = read("supabase/migrations/20260908233640_youcan_integration_v2.sql");
const productBackfill = read("supabase/migrations/20260909002752_youcan_order_product_backfill.sql");
const oauthStateMigration = read("supabase/migrations/20260909044411_youcan_oauth_state_nonce.sql");
const credentialCleanup = read("supabase/migrations/20260909050114_youcan_legacy_credential_cleanup.sql");
const card = read("src/pages/settings/components/YouCanIntegrationCard.tsx");
const app = read("src/App.tsx");
const vercel = read("vercel.json");
const inventory = read("src/pages/ProductsAndInventory.tsx");
const orders = read("src/pages/Orders.tsx");
const sheetsWebhook = read("supabase/functions/google-sheets-webhook/index.ts");

test("OAuth requests only the documented V2 capabilities", () => {
  for (const scope of ["read-orders", "edit-orders", "view-store-info", "read-products", "read-rest-hooks", "edit-rest-hooks", "delete-rest-hooks"]) {
    assert.match(shared, new RegExp(`"${scope}"`));
  }
  assert.doesNotMatch(shared, /"read-checkout-fields"|"view-checkout-fields"|"read-customers"/);
  assert.match(oauthStart, /YOUCAN_REQUIRED_SCOPES/);
});

test("production callback is server-routed and identical in authorization and token exchange", () => {
  assert.match(shared, /YOUCAN_PRODUCTION_CLIENT_ID = "2921"/);
  assert.match(shared, /YOUCAN_PRODUCTION_REDIRECT_URI = "https:\/\/www\.ecomos\.ma\/api\/youcan\/callback"/);
  assert.match(shared, /YOUCAN_AUTHORIZATION_ENDPOINT = "https:\/\/seller-area\.youcan\.shop\/admin\/oauth\/authorize"/);
  assert.match(shared, /YOUCAN_TOKEN_ENDPOINT = `\$\{YOUCAN_API_BASE\}\/oauth\/token`/);
  assert.match(oauthStart, /new URL\(YOUCAN_AUTHORIZATION_ENDPOINT\)/);
  assert.match(callback, /redirect_uri: oauth\.redirectUri/);
  assert.match(vercel, /"source": "\/api\/youcan\/callback"/);
  assert.match(vercel, /functions\/v1\/youcan-oauth-callback/);
  assert.doesNotMatch(app, /path="\/api\/youcan\/callback"/);
});

test("OAuth state is opaque, user/workspace-bound, expiring, hashed, and single-use", () => {
  assert.match(oauthStart, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(oauthStart, /10 \* 60 \* 1000/);
  assert.match(oauthStart, /state_hash: await sha256\(state\)/);
  assert.match(oauthStateMigration, /user_id uuid not null/);
  assert.match(oauthStateMigration, /workspace_id uuid not null/);
  assert.match(callback, /is\("consumed_at", null\)/);
  assert.match(callback, /expired_state/);
  assert.match(callback, /replayed_state/);
  assert.match(callback, /select\("workspace_id,user_id,expires_at,consumed_at"\)/);
});

test("credentials are AES-GCM encrypted and plaintext copies are cleared", () => {
  assert.match(shared, /AES-GCM/);
  assert.match(shared, /YOUCAN_TOKEN_ENCRYPTION_KEY/);
  assert.match(shared, /access_token: null/);
  assert.match(callback, /youcan_access_token: null/);
  assert.match(credentialCleanup, /youcan_access_token = null/);
  assert.match(credentialCleanup, /integration\.access_token_encrypted is not null/);
  assert.doesNotMatch(credentialCleanup, /integration\.access_token is not null/);
  assert.doesNotMatch(card, /access_token|refresh_token|webhook_secret/);
});

test("webhooks require signatures, deduplicate deliveries, and use canonical events", () => {
  assert.match(webhook, /x-youcan-signature/);
  assert.match(webhook, /x-youcan-delivery-id/);
  assert.match(shared, /order\.created/);
  assert.match(shared, /order\.updated/);
  assert.match(shared, /order\.paid/);
  assert.match(shared, /app\.uninstalled/);
  assert.doesNotMatch(shared, /"order\.create"/);
  assert.match(migration, /unique \(integration_id, delivery_id\)/);
  assert.match(webhook, /eq\("status", "active"\)/);
  assert.match(webhook, /order\("updated_at", \{ ascending: false \}\)\.limit\(1\)/);
});

test("webhook and manual sync process immediately with cron retained as fallback", () => {
  assert.match(background, /EdgeRuntime\.waitUntil/);
  assert.match(background, /functions\/v1\/youcan-reconcile/);
  assert.match(webhook, /processYouCanJobInBackground/);
  assert.match(manualSync, /processYouCanJobInBackground/);
  assert.match(reconcile, /body\.job_id/);
});

test("webhook target has no integration id or secret query string", () => {
  assert.match(shared, /functions\/v1\/youcan-webhook`/);
  assert.doesNotMatch(shared, /youcan-webhook\?integration_id/);
  assert.doesNotMatch(webhook, /searchParams|get\("token"\)/);
});

test("disconnect uses the documented POST unsubscribe endpoint", () => {
  assert.match(disconnect, /resthooks\/unsubscribe/);
  assert.match(disconnect, /method: "POST"/);
  assert.doesNotMatch(disconnect, /method: "DELETE"/);
});

test("queues are tenant-scoped, idempotent, retry-safe, cancellable, and recover stale work", () => {
  assert.match(migration, /workspace_id uuid not null/);
  assert.match(migration, /idempotency_key text not null/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /'cancelled'/);
  assert.match(reconcile, /stale_worker_recovered/);
  assert.match(reconcile, /2 \*\* Math\.max/);
});

test("provider-origin status updates do not loop and seller updates queue outbound sync", () => {
  assert.match(migration, /enqueue_youcan_status_sync_trg/);
  assert.match(migration, /provider_payload_updated_at is distinct from old\.provider_payload_updated_at/);
  assert.match(reconcile, /status_outbound/);
  assert.match(shared, /canceled-by-seller/);
  assert.match(shared, /youCanGeneralStatus/);
  assert.match(shared, /youCanShippingStatus/);
  assert.match(reconcile, /Unsupported by YouCan/);
});

test("product identifiers are workspace scoped and images flow into inventory", () => {
  assert.match(migration, /drop constraint if exists products_youcan_product_id_key/);
  assert.match(migration, /products_workspace_integration_external_uidx/);
  assert.match(reconcile, /image_url: image/);
  assert.match(reconcile, /provider_inventory/);
  assert.match(reconcile, /upsertProductsFromOrderItems/);
  assert.match(reconcile, /inventory_source/);
  assert.match(productBackfill, /on conflict \(workspace_id, youcan_product_id\)/);
  assert.match(productBackfill, /external_variant_id/);
  assert.match(inventory, /Source:/);
  assert.match(inventory, /provider_updated_at/);
});

test("smart checkout maps EN, FR, and AR labels plus attribution", () => {
  assert.match(shared, /nom complet/);
  assert.match(shared, /الاسم الكامل/);
  assert.match(shared, /téléphone/);
  for (const field of ["customer_ip", "utm_source", "fbclid", "gclid", "ttclid"]) assert.match(shared, new RegExp(field));
});

test("Google Sheets preserves the canonical customer_ip path without storing its webhook token", () => {
  assert.match(sheetsWebhook, /customer_ip: mapped\.customer_ip/);
  assert.match(sheetsWebhook, /'customer ip'/);
  assert.doesNotMatch(sheetsWebhook, /payload: body/);
  assert.doesNotMatch(migration, /add column if not exists (google_sheets_)?customer_ip/);
});

test("seller UI keeps webhook always on and offers explicit verification/manual sync", () => {
  assert.match(card, /Live sync/);
  assert.match(card, /Connect with YouCan/);
  assert.match(card, /Configure/);
  assert.match(card, /Always on/);
  assert.match(card, /Verify webhook/);
  assert.match(card, /Sync orders now/);
  assert.doesNotMatch(card, /Open store/);
  assert.match(card, /Reconnect required/);
  assert.match(orders, /Status sync/);
});

test("cron installer uses Vault and is idempotent", () => {
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /cron\.unschedule/);
  assert.match(migration, /youcan-v2-reconcile/);
  assert.match(reconcile, /x-youcan-cron-secret/);
  assert.doesNotMatch(reconcile, /\/settings\/checkout\/fields/);
  assert.doesNotMatch(reconcile, /\["checkout_fields", day\]/);
});

test("callback reports safe stage-specific failures without exposing credentials", () => {
  for (const reason of ["access_denied", "invalid_scope", "invalid_client", "missing_code", "missing_state", "invalid_state", "expired_state", "replayed_state", "token_exchange_failed", "store_info_failed", "database_save_failed", "initial_sync_failed"]) {
    assert.match(callback, new RegExp(`"${reason}"`));
  }
  assert.match(callback, /hasAccessToken: true/);
  assert.doesNotMatch(callback, /console\.(?:log|info|error)\([^\n]*(?:token\.access_token|oauth\.clientSecret|\bcode\b)/);
  assert.doesNotMatch(card, /client_credentials_rejected|authorization_code_rejected/);
});

test("refresh uses an optimistic single-winner lease and persists rotated refresh tokens", () => {
  assert.match(shared, /\.eq\("updated_at", row\.updated_at\)/);
  assert.match(shared, /body\.refresh_token \? String\(body\.refresh_token\) : refreshToken/);
  assert.match(shared, /status: "auth_expired", needs_reconnect: true/);
});
