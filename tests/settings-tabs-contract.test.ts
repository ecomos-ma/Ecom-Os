import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const app = read("src/App.tsx");
const settings = read("src/pages/Settings.tsx");
const metaCard = read("src/pages/settings/components/MetaIntegrationCard.tsx");
const metaStart = read("supabase/functions/meta-auth-start/index.ts");
const metaCallback = read("supabase/functions/meta-auth-callback/index.ts");
const youcanCallback = read("supabase/functions/youcan-oauth-callback/index.ts");

test("Settings tabs use query parameters as the canonical URL", () => {
  assert.match(settings, /navigate\(`\/settings\?tab=\$\{nextTab\.toLowerCase\(\)\}`\)/);
  assert.doesNotMatch(settings, /navigate\("\/settings\/integrations"/);
});

test("legacy nested Settings URLs redirect without dropping callback parameters", () => {
  assert.match(app, /function LegacySettingsTabRedirect/);
  assert.match(app, /new URLSearchParams\(search\)/);
  assert.match(app, /path="\/settings\/integrations\/\*"/);
  assert.match(app, /path="\/settings\/integration\/\*"/);
  assert.match(app, /params\.set\("tab", tab\)/);
});

test("OAuth integrations return to the existing Integrations tab", () => {
  for (const source of [metaCard, metaStart, metaCallback]) {
    assert.match(source, /\/settings\?tab=integrations/);
    assert.doesNotMatch(source, /\/settings\/integrations(?:\/meta)?/);
  }
  assert.match(youcanCallback, /new URL\("\/settings"/);
  assert.match(youcanCallback, /target\.searchParams\.set\("tab", "integrations"\)/);
  assert.doesNotMatch(youcanCallback, /\/settings\/integrations/);
});

test("integration cards restore a stable cached order and do not jump during status discovery", () => {
  assert.match(settings, /ecomos:integration-order:/);
  assert.match(settings, /setVisibleOrder\(\(current\) => current \?\? order\)/);
  assert.match(settings, /Checking connections/);
  assert.match(settings, /pointer-events-none opacity-0/);
});
