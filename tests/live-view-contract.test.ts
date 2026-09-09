import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hashIp, isPublicIp, normalizeIpApiResponse } from "../supabase/functions/_shared/live-view-geo.ts";

const migration = readFileSync("supabase/migrations/20260908153104_live_view_realtime_projection.sql", "utf8");
const service = readFileSync("src/services/liveViewService.ts", "utf8");
const hook = readFileSync("src/hooks/useLiveView.ts", "utf8");
const globe = readFileSync("src/components/live-view/LiveGlobe.tsx", "utf8");
const page = readFileSync("src/pages/LiveView.tsx", "utf8");
const provider = readFileSync("supabase/functions/_shared/live-view-ipapi-provider.ts", "utf8");
const mapping = readFileSync("src/lib/googleSheetsMappingEngine.ts", "utf8");

test("IP validation accepts public IPv4/IPv6 and rejects local, reserved, and malformed values", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  for (const value of ["127.0.0.1", "10.1.2.3", "192.168.1.4", "169.254.1.2", "203.0.113.9", "::1", "fc00::1", "fe80::1", "2001:db8::1", "not-an-ip"]) {
    assert.equal(isPublicIp(value), false, value);
  }
});

test("provider payload normalization requires valid coordinates and never returns the IP", () => {
  const normalized = normalizeIpApiResponse({ ip: "8.8.8.8", city: "Mountain View", region: "California", country: "United States", country_code: "US", lat: 37.4, lon: -122.1 });
  assert.deepEqual(normalized, { city: "Mountain View", region: "California", country: "United States", countryCode: "US", latitude: 37.4, longitude: -122.1, confidence: "high" });
  assert.equal(normalizeIpApiResponse({ city: "Nowhere", lat: 200, lon: 0 }), null);
  assert.equal(normalizeIpApiResponse({ is_bogon: true, lat: 1, lon: 1 }), null);
});

test("provider abstraction uses POST so IPs and keys never enter URL logs", () => {
  assert.match(provider, /interface IpGeolocationProvider/);
  assert.match(provider, /method:\s*"POST"/);
  assert.doesNotMatch(provider, /api\.ipapi\.is\/\?/);
  assert.doesNotMatch(provider, /console\.(log|error|warn)/);
});

test("IP cache identity is salted and deterministic without retaining the raw address", async () => {
  const first = await hashIp("8.8.8.8", "test-salt-one");
  const repeat = await hashIp("8.8.8.8", "test-salt-one");
  const secondSalt = await hashIp("8.8.8.8", "test-salt-two");
  assert.equal(first, repeat);
  assert.notEqual(first, secondSalt);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("8.8.8.8"), false);
});

test("Google Sheets continues to map IP aliases to the one canonical customer_ip field", () => {
  assert.match(mapping, /field:\s*'customer_ip'/);
  assert.match(mapping, /'IP Address':\s*'customer_ip'/);
  assert.match(mapping, /'Customer IP':\s*'customer_ip'/);
  assert.match(mapping, /lowerKey\.includes\('customer ip'\)/);
});

test("Live View projection is stable, PII-minimal, RLS protected, and admin access is permission-scoped", () => {
  assert.match(migration, /order_id uuid primary key/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /is_active_workspace_member\(workspace_id\)/);
  assert.match(migration, /has_platform_permission\('orders\.read_all'\)/);
  assert.match(migration, /revoke all on table public\.live_view_geo_cache from anon, authenticated/);
  const eventDefinition = migration.split("create table if not exists public.live_view_events")[1].split(");")[0];
  assert.doesNotMatch(eventDefinition, /customer_ip|email|phone|customer_name|address/i);
});

test("Realtime deduplicates updates, filters seller subscriptions, reconciles, and bounds bursts", () => {
  assert.match(service, /filter: `workspace_id=eq\.\$\{workspaceId\}`/);
  assert.match(service, /payload\.eventType === "INSERT"/);
  assert.match(hook, /seen\.current\.has\(event\.order_id\)/);
  assert.match(hook, /slice\(0, 30\)/);
  assert.match(hook, /60_000/);
  assert.match(globe, /events\.slice\(0, 500\)/);
  assert.match(globe, /slice\(0, 300\)/);
  assert.match(globe, /slice\(0, 16\)/);
});

test("fallback aliases are multilingual and the UI never invents a visitor metric", () => {
  assert.match(migration, /'Casablanca','MA','الدار البيضاء'/);
  assert.match(migration, /'Marrakech','MA','مراكش'/);
  assert.doesNotMatch(`${page}\n${service}\n${migration}`, /visitor(s| count| metric)?/i);
});

test("production resolver honors provider-city mappings before region/country fallbacks", () => {
  const fallback = readFileSync("supabase/migrations/20260908162524_live_view_location_fallback_reconciliation.sql", "utf8");
  assert.match(fallback, /public\.shipping_city_mapping/);
  assert.match(fallback, /'provider_city'/);
  assert.match(fallback, /public\.live_view_region_catalog/);
  assert.match(fallback, /public\.live_view_country_catalog/);
  assert.match(fallback, /geo_source<>'ip'/);
});
