import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeMapboxGeocodeResponse, normalizeNominatimGeocodeResponse } from "../supabase/functions/_shared/live-view-geocoding-provider.ts";

const originalMigration = readFileSync("supabase/migrations/20260908153104_live_view_realtime_projection.sql", "utf8");
const geocodingMigration = readFileSync("supabase/migrations/20261018164520_live_view_real_order_geocoding.sql", "utf8");
const service = readFileSync("src/services/liveViewService.ts", "utf8");
const hook = readFileSync("src/hooks/useLiveView.ts", "utf8");
const globe = readFileSync("src/components/live-view/LiveGlobe.tsx", "utf8");
const liveCss = readFileSync("src/pages/live-view/LiveView.css", "utf8");
const page = readFileSync("src/pages/LiveView.tsx", "utf8");
const provider = readFileSync("supabase/functions/_shared/live-view-geocoding-provider.ts", "utf8");
const geolocate = readFileSync("supabase/functions/live-view-geolocate/index.ts", "utf8");

test("Mapbox v6 response normalization preserves real delivery coordinates", () => {
  const result = normalizeMapboxGeocodeResponse({ features: [{
    geometry: { coordinates: [-7.5898, 33.5731] },
    properties: {
      feature_type: "address", name: "12 Rue Exemple",
      context: { place: { name: "Casablanca" }, region: { name: "Casablanca-Settat" }, country: { name: "Morocco", country_code: "MA" } },
    },
  }] });
  assert.deepEqual(result, { city: "Casablanca", region: "Casablanca-Settat", country: "Morocco", countryCode: "MA", latitude: 33.5731, longitude: -7.5898, accuracy: "address" });
  assert.equal(normalizeMapboxGeocodeResponse({ features: [{ geometry: { coordinates: [500, 200] } }] }), null);
});

test("Nominatim response normalization supports multilingual city data", () => {
  const result = normalizeNominatimGeocodeResponse([{ lat: "31.6295", lon: "-7.9811", type: "city", category: "place", address: { city: "Marrakech", state: "Marrakesh-Safi", country: "المغرب", country_code: "ma" } }]);
  assert.deepEqual(result, { city: "Marrakech", region: "Marrakesh-Safi", country: "المغرب", countryCode: "MA", latitude: 31.6295, longitude: -7.9811, accuracy: "city" });
});

test("server geocoding uses a permanent Mapbox v6 request and a compliant optional Nominatim provider", () => {
  assert.match(provider, /search\/geocode\/v6\/forward/);
  assert.match(provider, /set\("permanent", "true"\)/);
  assert.match(provider, /set\("autocomplete", "false"\)/);
  assert.match(provider, /minimumDelayMs = 1100/);
  assert.match(provider, /NOMINATIM_BASE_URL/);
  assert.doesNotMatch(provider, /nominatim\.openstreetmap\.org/);
  assert.doesNotMatch(provider, /console\.(log|error|warn)/);
});

test("delivery geocoding is authenticated, address-hashed, cached, and returns no customer address", () => {
  assert.match(geolocate, /LIVE_VIEW_GEO_HASH_SALT/);
  assert.match(geolocate, /hashQuery\(candidate\.query, hashSalt\)/);
  assert.match(geolocate, /live_view_geocode_cache/);
  assert.match(geolocate, /profile_workspaces/);
  assert.match(geolocate, /x-youcan-cron-secret/);
  assert.match(geolocate, /shipping_latitude/);
  assert.match(geolocate, /shipping_geo_accuracy/);
  assert.match(geolocate, /provider_status/);
  assert.doesNotMatch(geolocate, /console\.(log|error|warn)/);
  assert.doesNotMatch(geolocate, /return json\([^;]*address/s);
});

test("database stores verified coordinates without exposing the geocode cache", () => {
  assert.match(geocodingMigration, /add column if not exists shipping_latitude double precision/);
  assert.match(geocodingMigration, /orders_shipping_coordinates_check/);
  assert.match(geocodingMigration, /query_hash text primary key/);
  assert.match(geocodingMigration, /revoke all on table public\.live_view_geocode_cache from public, anon, authenticated/);
  assert.match(geocodingMigration, /clear_stale_order_shipping_coordinates_v1/);
  assert.match(geocodingMigration, /shipping_geocode_query_hash/);
  assert.doesNotMatch(geocodingMigration.split("create table if not exists public.live_view_geocode_cache")[1].split(");")[0], /address text/i);
});

test("projection uses stored coordinates, then verified city, otherwise an unplotted unknown state", () => {
  assert.match(geocodingMigration, /new\.shipping_latitude is not null and new\.shipping_longitude is not null/);
  assert.match(geocodingMigration, /resolve_live_view_verified_city_v2/);
  assert.match(geocodingMigration, /coalesce\(resolved\.geo_source, 'unknown'\)/);
  assert.match(geocodingMigration, /coalesce\(locations\.shipping_latitude, locations\.latitude\)/);
  const resolver = geocodingMigration.split("create or replace function public.resolve_live_view_verified_city_v2")[1].split("revoke all on function")[0];
  assert.doesNotMatch(resolver, /live_view_region_catalog|live_view_country_catalog/);
});

test("realtime resolves new orders, accepts coordinate updates, reconciles, and bounds activity", () => {
  assert.match(service, /filter: `workspace_id=eq\.\$\{workspaceId\}`/);
  assert.match(service, /payload\.eventType !== "DELETE"/);
  assert.match(service, /requestOrderGeolocation/);
  assert.match(hook, /eventType === "INSERT"/);
  assert.match(hook, /requestOrderGeolocation\(workspaceId, event\.order_id\)/);
  assert.match(hook, /filter\(\(item\) => item\.order_id !== event\.order_id\)/);
  assert.match(hook, /slice\(0, 30\)/);
  assert.match(hook, /60_000/);
});

test("Earth uses accurate polygons with one uniform blush treatment and no satellite imagery", () => {
  assert.match(globe, /ne_110m_admin_0_countries\.geojson\?raw/);
  assert.match(globe, /MeshPhongMaterial/);
  assert.match(globe, /color: "#fdf8fa"/);
  assert.match(globe, /polygonCapColor=\{\(\) => "#f8dce8"\}/);
  assert.match(globe, /polygonStrokeColor=\{\(\) => "#d48ba7"\}/);
  assert.match(globe, /polygonStrokeColor/);
  assert.doesNotMatch(globe, /isMorocco|WesternSahara|#d9658d|polygonCapColor=\{\(feature/);
  assert.doesNotMatch(globe, /earth-blue-marble|earth-topology|night-sky|globeImageUrl|backgroundImageUrl/);
  assert.doesNotMatch(globe, /arcsData|startLat|startLng/);
});

test("verified markers cluster by zoom, stay globe-anchored, pulse, and open real order data", () => {
  assert.match(globe, /events\.slice\(0, 600\)/);
  assert.match(globe, /toFixed\(clusterPrecision\)/);
  assert.match(globe, /onZoom=/);
  assert.match(globe, /pointLat="lat"/);
  assert.match(globe, /pointLng="lng"/);
  assert.match(globe, /ringsData=\{rings\}/);
  assert.match(globe, /newest\.latitude/);
  assert.match(globe, /onSelect\(item\.events\)/);
  assert.match(globe, /visibilitychange/);
});

test("Live View is a full-viewport map with floating controls and no redundant bands", () => {
  assert.match(liveCss, /height:100%;min-height:0;overflow:hidden/);
  assert.match(page, /live-metrics/);
  assert.match(page, /live-top-right/);
  assert.match(page, /live-order-popover/);
  assert.match(page, /Focus Morocco/);
  assert.match(page, /Reset Earth view/);
  assert.match(page, /requestFullscreen/);
  assert.doesNotMatch(page, /live-view-top|live-sidebar|live-location-note|Orders around the world/);
});

test("projection remains PII-minimal, RLS protected, and uses real multilingual city aliases", () => {
  assert.match(originalMigration, /enable row level security/);
  assert.match(originalMigration, /is_active_workspace_member\(workspace_id\)/);
  assert.match(originalMigration, /has_platform_permission\('orders\.read_all'\)/);
  const eventDefinition = originalMigration.split("create table if not exists public.live_view_events")[1].split(");")[0];
  assert.doesNotMatch(eventDefinition, /customer_ip|email|phone|customer_name|address/i);
  assert.match(originalMigration, /'Casablanca','MA','الدار البيضاء'/);
  assert.match(originalMigration, /'Marrakech','MA','مراكش'/);
  assert.doesNotMatch(`${page}\n${service}\n${geocodingMigration}`, /random\(|Math\.random/);
});
