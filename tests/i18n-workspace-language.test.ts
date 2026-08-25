import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("workspace language migration creates one constrained source of truth", () => {
  const migration = read("../supabase/migrations/20260825171235_workspace_language_i18n.sql");

  assert.match(migration, /rename column status_language to language/i);
  assert.match(migration, /alter column language set default 'en'/i);
  assert.match(migration, /alter column language set not null/i);
  assert.match(migration, /check \(language in \('en', 'fr'\)\)/i);
  assert.match(migration, /has_workspace_role\(id, array\['owner','supervisor','admin','manager'\]\)/i);
  assert.match(migration, /update_workspace_language/i);
  assert.match(migration, /revoke all on function public\.update_workspace_language\(uuid, text\) from public, anon/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.workspaces/i);
});

test("workspace provider synchronizes realtime and tabs without booting from local storage", () => {
  const provider = read("../src/i18n/index.tsx");

  assert.match(provider, /BroadcastChannel/);
  assert.match(provider, /postgres_changes/);
  assert.match(provider, /table: "workspaces"/);
  assert.match(provider, /update_workspace_language/);
  assert.doesNotMatch(provider, /getItem\(LANGUAGE_EVENT_KEY\)/);
  assert.match(provider, /patchWorkspace\(targetWorkspaceId, \{ language: nextLocale \}\)/);
});

test("legacy status-language references are removed from application state", () => {
  const types = read("../src/lib/types.ts");
  const settings = read("../src/pages/Settings.tsx");
  const statusBadge = read("../src/components/StatusBadge.tsx");

  assert.match(types, /language: "en" \| "fr"/);
  assert.doesNotMatch(types, /status_language:/);
  assert.doesNotMatch(settings, /workspace\?\.status_language/);
  assert.match(settings, /Workspace language|settings\.workspace\.languageLabel/);
  assert.match(statusBadge, /normalizeStatusOrNull/);
  assert.match(statusBadge, /getStatusLabel/);
  assert.doesNotMatch(statusBadge, /\{rawStatus\}\s*<\/span>/);
});

test("English and French dictionaries have identical stable keys", () => {
  const english = read("../src/i18n/locales/en.ts");
  const french = read("../src/i18n/locales/fr.ts");
  const keyPattern = /^\s*"([^"]+)":/gm;
  const keys = (source: string) => [...source.matchAll(keyPattern)].map((match) => match[1]).sort();

  assert.deepEqual(keys(french), keys(english));
  assert.ok(keys(english).includes("status.delivered"));
  assert.ok(keys(english).includes("shippingStatus.RETURNED_TO_SENDER"));
  assert.match(french, /"status\.delivered": "Livrée"/);
  assert.match(french, /"settings\.workspace\.languageLabel": "Langue de l’espace de travail"/);
});

test("status normalization covers required legacy and provider aliases", () => {
  const orders = read("../src/lib/statusEngine.ts");
  const shipping = read("../src/lib/shippingStatus.ts");

  for (const alias of ["CONFIRME", "pas de reponse", "reporte", "saisie", "programme", "en voyage", "boite vocal", "rappeler plus tard", "client pas sérieux"]) {
    assert.ok(orders.toLocaleLowerCase().includes(alias.toLocaleLowerCase()), `missing order alias: ${alias}`);
  }
  for (const code of ["NEW_PARCEL", "WAITING_PICKUP", "PICKED_UP", "RECEIVED_AT_WAREHOUSE", "IN_DISTRIBUTION", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "REFUSED", "RETURN_TO_DEPOT", "RETURNED_TO_SENDER", "CANCELLED"]) {
    assert.ok(shipping.includes(code), `missing shipping status: ${code}`);
  }
  assert.match(orders, /STATUS_COLORS/);
  assert.match(shipping, /getShippingStatusColors/);
});

test("finance logic uses canonical status normalization instead of translated labels", () => {
  const finance = read("../src/lib/financeEngine.ts");

  assert.match(finance, /normalizeStatusOrNull/);
  assert.match(finance, /normalizeShippingStatus/);
  assert.doesNotMatch(finance, /DELIVERED_STATUSES/);
  assert.doesNotMatch(finance, /"livré",\s*"Livré"/);
});
