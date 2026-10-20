import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile dock uses floating glass, safe-area spacing and accessible fallbacks", () => {
  const css = read("src/index.css");
  const dock = css.match(/\.mobile-bottom-nav \{([^}]+)\}/)?.[1] ?? "";
  assert.match(dock, /bottom: var\(--mobile-nav-offset\)/);
  assert.match(css, /--mobile-nav-offset: max\(\.25rem, var\(--safe-bottom\)\)/);
  assert.match(dock, /height: var\(--mobile-nav-height\)/);
  assert.match(css, /-webkit-backdrop-filter: blur\(28px\) saturate\(1\.8\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(css, /\.dark \.mobile-nav-item\.is-active/);
  assert.match(read("src/components/MobileAppChrome.tsx"), /layoutId="mobile-nav-active-glass"/);
});

test("compact navigation anchors to the phone shell without document overflow", () => {
  const css = read("src/index.css");
  assert.match(css, /--mobile-nav-height: clamp\(3\.5rem, 15vw, 4rem\)/);
  assert.match(css, /\.app-shell \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?height: 100dvh/);
  assert.match(css, /#root:has\(\.app-shell\) \{[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden/);
  assert.match(css, /width: clamp\(1\.25rem, 5\.5vw, 1\.5rem\)/);
  assert.match(read("src/components/Layout.tsx"), /className="app-shell flex/);
});

test("the floating dock does not reserve an opaque footer outside the page scroller", () => {
  const css = read("src/index.css");
  const mainRules = [...css.matchAll(/\.app-main \{([^}]+)\}/g)];
  assert.ok(mainRules.length > 0);
  for (const [, rule] of mainRules) assert.match(rule, /padding-bottom: 0/);
  assert.match(css, /\.app-main > \.overflow-y-auto > \.min-h-full \{\s*padding-bottom: var\(--mobile-nav-total\)/);
  assert.match(css, /\.app-main > \.overflow-hidden \{ padding-bottom: var\(--mobile-nav-total\)/);
});

test("glass navigation follows workspace accent and platform surface tokens", () => {
  const css = read("src/index.css");
  const dock = css.slice(css.indexOf(".mobile-bottom-nav {"), css.indexOf(".mobile-sheet-backdrop"));
  assert.match(dock, /\.mobile-nav-item\.is-active \{\s*color: rgb\(var\(--color-accent\)\)/);
  assert.match(dock, /\.dark \.mobile-nav-item\.is-active \{ color: rgb\(var\(--color-accent\)\)/);
  assert.match(dock, /linear-gradient\(145deg, rgb\(var\(--color-accent\) \/ \.2\)/);
  assert.match(dock, /var\(--bg-panel\)/);
  assert.match(dock, /var\(--bg-raised\)/);
  assert.match(dock, /var\(--text-main\)/);
  assert.doesNotMatch(dock, /#087cf0|#db638b|rgba\(224, 232, 246/);
});

test("phone shell puts the four requested actions in the mobile bar and all pages in the drawer", () => {
  const shell = read("src/components/MobileAppChrome.tsx");

  assert.match(shell, /\["\/dashboard", "\/confirmation", deliveryPath\]/);
  assert.match(shell, /aria-label="Scan returns"/);
  assert.match(shell, /onScan\(\)/);
  assert.match(shell, /to: "\/anti-fake-orders"/);
  assert.match(shell, /accessiblePages/);
  assert.match(shell, /Install Ecom OS/);
  assert.match(shell, /getPendingInstallPrompt/);
  assert.match(read("src/lib/pwaInstallPrompt.ts"), /beforeinstallprompt/);
});

test("phone navigation exposes a thumb-reachable menu and permission-filtered shortcuts", () => {
  const shell = read("src/components/MobileAppChrome.tsx");
  assert.match(shell, /aria-label="All pages" aria-expanded=\{sidebarOpen\}/);
  assert.match(shell, /accessiblePages\.find\(\(page\) => page\.to === path\)/);
  assert.match(shell, /togglePinned\(to\)/);
  assert.match(shell, /aria-pressed=\{pinnedPaths\.includes\(to\)\}/);
  const shortcuts = read("src/hooks/useMobileShortcuts.ts");
  assert.match(shortcuts, /ecomos:mobile-shortcuts:\$\{userId\}:\$\{workspaceId\}/);
  assert.match(shortcuts, /state\.key === key/);
  assert.match(shortcuts, /JSON\.stringify\(next\)/);
});

test("shared phone surfaces support touch, keyboard navigation and readable forms", () => {
  const css = read("src/index.css");
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.confirmation-contact-actions \{ display: grid/);
  assert.match(css, /\.shipping-card-actions \{ display: grid/);
  assert.match(css, /\.confirmation-workspace--focus \{[\s\S]*?height: auto;[\s\S]*?overflow: visible/);
  assert.match(read("src/components/PageHeader.tsx"), /app-page-actions/);
  assert.doesNotMatch(read("src/components/PageHeader.tsx"), /max-md:hidden/);
  assert.match(read("src/components/Modal.tsx"), /useDialogFocus\(true, panelRef\)/);
  assert.match(read("src/components/MobileBottomSheet.tsx"), /useDialogFocus\(active, sheetRef\)/);
  const focus = read("src/hooks/useDialogFocus.ts");
  assert.match(focus, /event\.key !== "Tab"/);
  assert.match(focus, /opener\?\.isConnected/);
  assert.match(focus, /openDialogs\[openDialogs\.length - 1\]/);
});

test("phone dashboard uses real dashboard data without fabricated trends", () => {
  const dashboard = read("src/pages/MobileDashboard.tsx");
  const route = read("src/pages/ResponsiveDashboard.tsx");

  assert.match(dashboard, /useDashboardData/);
  assert.doesNotMatch(dashboard, /\+12\.5%|\+8\.2%|\+15\.3%/);
  assert.match(dashboard, /Only orders available to your account/);
  assert.match(route, /MobileDashboard/);
  assert.match(route, /usePhoneLayout/);
  assert.match(read("src/hooks/usePhoneLayout.ts"), /max-width: 767px/);
  assert.match(read("src/hooks/usePhoneLayout.ts"), /orientation: landscape/);
});

test("PWA manifest and worker preserve safe standalone behavior", () => {
  const manifest = read("public/manifest.webmanifest");
  const worker = read("src/sw.ts");

  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\/dashboard"/);
  assert.match(manifest, /"purpose": "any maskable"/);
  assert.match(read("vite.config.ts"), /manifest: appManifest/);
  assert.match(read("vite.config.ts"), /readFileSync\(new URL\("\.\/public\/manifest.webmanifest"/);
  assert.match(worker, /Do not route Supabase through the service worker/);
  assert.doesNotMatch(worker, /registerRoute\(\(\{ url \}\) => \/\\\.supabase/);
  assert.match(worker, /new NetworkOnly\(\)/);
  assert.match(worker, /safeInternalUrl/);
});

test("install icons use the approved original with cache-versioned URLs", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const primary = manifest.icons.find((icon: { sizes: string }) => icon.sizes === "512x512");
  assert.equal(primary.src, "/icon-512.png?v=6511e4d1");
  assert.equal(primary.purpose, "any maskable");
  assert.ok(manifest.icons.every((icon: { src: string }) => !icon.src.includes("maskable-icon")));
  assert.match(read("index.html"), /apple-touch-icon\.png\?v=6511e4d1/);
  const generator = read("scripts/generate-pwa-icons.mjs");
  assert.match(generator, /readFile\(path\.join\(root, "public\/icon-512\.png"\)\)/);
  assert.doesNotMatch(generator, /src\/assets\/logo\.png/);
  assert.doesNotMatch(generator, /const sizes = \[[^\]]*512/);
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
