import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shared = read("supabase/functions/_shared/youcan.ts");
const oauthStart = read("supabase/functions/youcan-generate-state/index.ts");
const callback = read("supabase/functions/youcan-oauth-callback/index.ts");
const webhook = read("supabase/functions/youcan-webhook/index.ts");
const reconcile = read("supabase/functions/youcan-reconcile/index.ts");
const disconnect = read("supabase/functions/youcan-disconnect/index.ts");
const migration = read("supabase/migrations/20260908233640_youcan_integration_v2.sql");
const productBackfill = read("supabase/migrations/20260909002752_youcan_order_product_backfill.sql");
const oauthStateMigration = read("supabase/migrations/20260909044411_youcan_oauth_state_nonce.sql");
const credentialCleanup = read("supabase/migrations/20260909050114_youcan_legacy_credential_cleanup.sql");
const card = read("src/pages/settings/components/YouCanIntegrationCard.tsx");
const inventory = read("src/pages/ProductsAndInventory.tsx");
const orders = read("src/pages/Orders.tsx");
const sheetsWebhook = read("supabase/functions/google-sheets-webhook/index.ts");

test("OAuth requests only the documented V2 capabilities", () => {
  for (const scope of ["read-orders", "edit-orders", "view-store-info", "read-products", "read-customers", "read-checkout-fields", "read-rest-hooks", "edit-rest-hooks", "delete-rest-hooks"]) {
    assert.match(shared, new RegExp(`"${scope}"`));
  }
  assert.match(oauthStart, /YOUCAN_REQUIRED_SCOPES/);
});

test("OAuth state is opaque, user/workspace-bound, expiring, hashed, and single-use", () => {
  assert.match(oauthStart, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(oauthStart, /10 \* 60 \* 1000/);
  assert.match(oauthStart, /state_hash: await sha256\(state\)/);
  assert.match(oauthStateMigration, /user_id uuid not null/);
  assert.match(oauthStateMigration, /workspace_id uuid not null/);
  assert.match(callback, /is\("consumed_at", null\)/);
  assert.match(callback, /gt\("expires_at"/);
  assert.match(callback, /select\("workspace_id,user_id"\)/);
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

test("seller UI has no webhook activation controls", () => {
  assert.match(card, /Live sync/);
  assert.match(card, /Connect with YouCan/);
  assert.doesNotMatch(card, /Activate Webhook|youcan-register-webhook-btn/);
  assert.match(card, /Reconnect required/);
  assert.match(orders, /Status sync/);
});

test("cron installer uses Vault and is idempotent", () => {
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /cron\.unschedule/);
  assert.match(migration, /youcan-v2-reconcile/);
  assert.match(reconcile, /x-youcan-cron-secret/);
  assert.match(reconcile, /\["checkout_fields", day\]/);
});
