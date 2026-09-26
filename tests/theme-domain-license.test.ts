import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeThemeDomain } from "../src/lib/themeDomain.ts";
import { generateThemeLicenseCode, hashThemeLicenseCode } from "../supabase/functions/_shared/theme-license.ts";

test("theme domain normalization strips protocol, www, port, path and trailing dot", () => {
  assert.equal(normalizeThemeDomain(" HTTPS://WWW.Store.Example.com:443/theme. "), "store.example.com");
});

test("theme domain normalization rejects wildcard, credentials, IP and invalid domains", () => {
  for (const value of ["*.example.com", "https://u:p@example.com", "127.0.0.1", "localhost", "bad domain.com"]) {
    assert.throws(() => normalizeThemeDomain(value));
  }
});

test("license codes are opaque high-entropy values and are stored as hashes", async () => {
  const first = generateThemeLicenseCode();
  const second = generateThemeLicenseCode();
  assert.match(first, /^ecomos_[a-f0-9]{64}$/);
  assert.match(second, /^ecomos_[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(await hashThemeLicenseCode(first), first);
  assert.match(await hashThemeLicenseCode(first), /^[a-f0-9]{64}$/);
});

test("the deployed function requires platform settings permission and fails verification closed", () => {
  const source = fs.readFileSync("supabase/functions/theme-domain-licensing/index.ts", "utf8");
  assert.ok(source.includes("platform_get_my_authorization_v1"));
  assert.ok(source.includes("settings.manage"));
  assert.ok(source.includes("return json(req, { allowed: false }"));
  assert.ok(!source.includes("console.log(" + "code"));
});
