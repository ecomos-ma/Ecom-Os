import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sharedModal = read("src/components/Modal.tsx");
const sidebar = read("src/components/Sidebar.tsx");
const layout = read("src/components/Layout.tsx");
const globalStyles = read("src/index.css");
const integrationDialogs = [
  "AmeexShippingIntegrationCard.tsx",
  "ColiatyShippingIntegrationCard.tsx",
  "GoogleSheetsIntegrationCard.tsx",
  "GoogleSheetsMappingModal.tsx",
  "MetaIntegrationCard.tsx",
  "OzonShippingIntegrationCard.tsx",
  "SenditShippingIntegrationCard.tsx",
  "ShopifyIntegrationCard.tsx",
  "TikTokIntegrationCard.tsx",
].map((file) => read(`src/pages/settings/components/${file}`));

test("shared dialogs stay inside the visible viewport and scroll only their body", () => {
  assert.match(sharedModal, /createPortal/);
  assert.match(sharedModal, /document\.body/);
  assert.match(sharedModal, /fixed inset-0 flex h-dvh/);
  assert.match(sharedModal, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(sharedModal, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
});

test("route animation and pull-to-refresh do not trap fixed overlays", () => {
  assert.doesNotMatch(layout, /style=\{\{ transform: "translate3d\(0, 0, 0\)" \}\}/);
  assert.match(layout, /progress > 0 \? `translate3d/);
  assert.doesNotMatch(globalStyles, /app-route-enter[^}]*animation:[^;]*\sboth;/s);
});

test("native dialog controls follow light and dark color schemes", () => {
  assert.match(globalStyles, /:root\s*\{\s*color-scheme: light;/);
  assert.match(globalStyles, /\.dark\s*\{\s*color-scheme: dark;/);
});

test("settings integration dialogs use the centered dynamic-viewport shell", () => {
  for (const dialog of integrationDialogs) {
    assert.match(dialog, /app-modal-backdrop fixed inset-0/);
    assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(dialog, /overflow-y-auto overscroll-contain/);
  }
});

test("desktop, tablet, and mobile sidebars use dynamic viewport containment", () => {
  assert.ok((sidebar.match(/h-dvh min-h-0/g) || []).length >= 2);
  assert.ok((sidebar.match(/overflow-y-auto overscroll-contain/g) || []).length >= 2);
});
