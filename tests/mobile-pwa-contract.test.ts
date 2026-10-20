import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("phone shell puts the four requested actions in the mobile bar and all pages in the drawer", () => {
  const shell = read("src/components/MobileAppChrome.tsx");

  assert.match(shell, /\["\/dashboard", "\/confirmation", deliveryPath\]/);
  assert.match(shell, /Scan Returns/);
  assert.match(shell, /onScan\(\)/);
  assert.match(shell, /to: "\/anti-fake-orders"/);
  assert.match(shell, /accessiblePages/);
  assert.match(shell, /Install Ecom OS/);
  assert.match(shell, /getPendingInstallPrompt/);
  assert.match(read("src/lib/pwaInstallPrompt.ts"), /beforeinstallprompt/);
});

test("phone dashboard uses real dashboard data without fabricated trends", () => {
  const dashboard = read("src/pages/MobileDashboard.tsx");
  const route = read("src/pages/ResponsiveDashboard.tsx");

  assert.match(dashboard, /useDashboardData/);
  assert.doesNotMatch(dashboard, /\+12\.5%|\+8\.2%|\+15\.3%/);
  assert.match(dashboard, /Only orders available to your account/);
  assert.match(route, /MobileDashboard/);
  assert.match(route, /max-width: 767px/);
});

test("PWA manifest and worker preserve safe standalone behavior", () => {
  const manifest = read("public/manifest.webmanifest");
  const worker = read("src/sw.ts");

  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\/dashboard"/);
  assert.match(manifest, /"purpose": "any maskable"/);
  assert.match(read("vite.config.ts"), /start_url: "\/dashboard"/);
  assert.match(worker, /Do not route Supabase through the service worker/);
  assert.doesNotMatch(worker, /registerRoute\(\(\{ url \}\) => \/\\\.supabase/);
  assert.match(worker, /new NetworkOnly\(\)/);
  assert.match(worker, /safeInternalUrl/);
});

test("apex serves the worker needed to recover old service-worker clients", () => {
  const worker = read("src/sw.ts");

  assert.doesNotMatch(read("vercel.json"), /"type": "host",\s*"value": "ecomos\.ma"/);
  assert.match(worker, /self\.location\.hostname === "ecomos\.ma"/);
  assert.match(worker, /self\.registration\.unregister\(\)/);
  assert.match(worker, /target\.hostname = "www\.ecomos\.ma"/);
});

test("offline page retries the canonical site and recovers automatically", () => {
  const offlinePage = read("public/offline.html");

  assert.match(offlinePage, /href="https:\/\/www\.ecomos\.ma\/"/);
  assert.match(offlinePage, /window\.addEventListener\("online", checkConnection\)/);
  assert.match(offlinePage, /window\.setInterval\(checkConnection, 10000\)/);
  assert.match(offlinePage, /window\.location\.replace\("https:\/\/www\.ecomos\.ma\/"\)/);
});
