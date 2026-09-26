import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("phone shell keeps the prescribed role-aware five-tab workflow", () => {
  const shell = read("src/components/MobileAppChrome.tsx");

  assert.match(shell, /\["\/dashboard", "\/orders", "\/confirmation", "\/finance"\]/);
  assert.match(shell, /\["\/dashboard", "\/orders", "\/confirmation", "\/agent-invoices"\]/);
  assert.match(shell, /My Orders/);
  assert.match(shell, /Install Ecom OS/);
  assert.match(shell, /beforeinstallprompt/);
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
  assert.match(manifest, /"purpose": "any maskable"/);
  assert.match(worker, /supabase/);
  assert.match(worker, /new NetworkOnly\(\)/);
  assert.match(worker, /safeInternalUrl/);
});
