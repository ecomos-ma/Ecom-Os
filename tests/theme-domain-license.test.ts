import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeThemeDomain, normalizeThemeDomains } from "../src/lib/themeDomain.ts";
import { generateThemeLicenseCode, hashThemeLicenseCode, normalizeThemeLicenseCode, validThemeLicenseCode } from "../supabase/functions/_shared/theme-license.ts";

test("theme domain normalization strips protocol, www, port, path and trailing dot", () => {
  assert.equal(normalizeThemeDomain(" HTTPS://WWW.Store.Example.com:443/theme. "), "store.example.com");
});

test("theme domain normalization rejects wildcard, credentials, IP and invalid domains", () => {
  for (const value of ["*.example.com", "https://u:p@example.com", "127.0.0.1", "localhost", "bad domain.com"]) {
    assert.throws(() => normalizeThemeDomain(value));
  }
});

test("multiple theme domains accept comma or newline separated URLs and reject duplicates", () => {
  assert.deepEqual(normalizeThemeDomains("https://www.One.example.com\n two.example.com, https://three.example.com/path"), [
    "one.example.com",
    "two.example.com",
    "three.example.com",
  ]);
  assert.throws(() => normalizeThemeDomains("one.example.com, https://www.one.example.com"), /duplicate/i);
});

test("license codes are opaque high-entropy values and are stored as hashes", async () => {
  const first = generateThemeLicenseCode();
  const second = generateThemeLicenseCode();
  assert.match(first, /^ECO-LIC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.match(second, /^ECO-LIC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.notEqual(first, second);
  assert.notEqual(await hashThemeLicenseCode(first), first);
  assert.match(await hashThemeLicenseCode(first), /^[a-f0-9]{64}$/);
  assert.equal(normalizeThemeLicenseCode(first.toLowerCase()), first);
  assert.equal(validThemeLicenseCode(`ecomos_${"a".repeat(64)}`), true, "legacy customer themes stay compatible");
});

test("client licensing uses recoverable encryption, child domains, audit events and stable-key mutations", () => {
  const source = fs.readFileSync("supabase/functions/theme-domain-licensing/index.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261007201509_client_license_management.sql", "utf8");
  assert.match(migration, /create table if not exists public\.client_licenses/i);
  assert.match(migration, /create table if not exists public\.license_domains/i);
  assert.match(migration, /create table if not exists public\.license_events/i);
  assert.match(migration, /license_key_encrypted text/i);
  assert.match(migration, /license_domains_unique_license_hostname_idx/);
  assert.doesNotMatch(migration, /on public\.license_domains \(hostname\) where status <> 'removed'/i);
  assert.match(migration, /client_license_status_action_v1/i);
  assert.match(migration, /LICENSE_RESTORED/);
  assert.doesNotMatch(source, /\.delete\(\)/);
  assert.match(source, /AES-GCM/);
  assert.match(source, /LICENSE_ENCRYPTION_KEY/);
  assert.match(source, /import_existing_license_v1/);
  assert.match(source, /authorization_token/);
});

test("the deployed function requires platform settings permission and fails verification closed", () => {
  const source = fs.readFileSync("supabase/functions/theme-domain-licensing/index.ts", "utf8");
  assert.ok(source.includes("platform_get_my_authorization_v1"));
  assert.ok(source.includes("settings.manage"));
  assert.ok(source.includes("return json(req, { allowed: false }"));
  assert.ok(!source.includes("console.log(" + "code"));
  assert.doesNotMatch(fs.readFileSync("src/lib/supabase.ts", "utf8"), /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});

test("client license UI has dashboard, recovery, detail, domain and destructive confirmation flows", () => {
  const dashboard = fs.readFileSync("src/pages/admin/ClientLicenses.tsx", "utf8");
  const detail = fs.readFileSync("src/pages/admin/ClientLicenseDetail.tsx", "utf8");
  const modals = fs.readFileSync("src/pages/admin/client-licenses/ClientLicenseModals.tsx", "utf8");
  const router = fs.readFileSync("src/pages/admin/AdminPro.tsx", "utf8");
  assert.match(dashboard, /Total clients/);
  assert.match(dashboard, /Import License/);
  assert.match(dashboard, /confirmText !== \"REVOKE\"/);
  assert.match(detail, /Adding, disabling, or removing a domain never changes the license key/);
  assert.match(detail, /Rotating this license will invalidate the old key/);
  assert.match(modals, /Recover the original license/);
  assert.match(modals, /This license is already active/);
  assert.match(router, /\/admin\/client-licenses\//);
});

test("unauthorized theme messages are sanitized, editable, and public validation only returns safe display copy", () => {
  const source = fs.readFileSync("supabase/functions/theme-domain-licensing/index.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261008000200_client_license_unauthorized_messages.sql", "utf8");
  const detail = fs.readFileSync("src/pages/admin/ClientLicenseDetail.tsx", "utf8");
  const editor = fs.readFileSync("src/pages/admin/client-licenses/UnauthorizedMessageModal.tsx", "utf8");
  assert.match(migration, /license_unauthorized_message_defaults/);
  assert.match(migration, /has_custom_unauthorized_message/);
  assert.match(source, /safeHttpsUrl/);
  assert.match(source, /plainMessageText/);
  assert.match(source, /unauthorized_message: message/);
  assert.match(source, /get_unauthorized_message_default/);
  assert.match(detail, /Unauthorized theme message/);
  assert.match(editor, /rel="noopener noreferrer"/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
});

test("public validation proxy returns only authorization data from the Edge Function", () => {
  const proxy = fs.readFileSync("api/theme-license/validate.ts", "utf8");
  assert.match(proxy, /action: \"validate\"/);
  assert.match(proxy, /Cache-Control/);
  assert.doesNotMatch(proxy, /phone|price|notes/);
});
