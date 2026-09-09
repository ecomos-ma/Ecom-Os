import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const layout = read("src/components/Layout.tsx");
const mobileChrome = read("src/components/MobileAppChrome.tsx");
const styles = read("src/index.css");
const whatsapp = read("src/pages/WhatsApp.tsx");
const html = read("index.html");

test("WhatsApp is mounted once and cannot become a permanent route-error spinner", () => {
  assert.equal((layout.match(/<Outlet\s*\/>/g) ?? []).length, 1);
  assert.match(app, /import WhatsApp from "\.\/pages\/WhatsApp"/);
  assert.doesNotMatch(app, /lazy\(\(\) => import\("\.\/pages\/WhatsApp"\)\)/);
  assert.match(app, /Unable to open this page/);
  assert.match(app, /window\.location\.reload\(\)/);
});

test("WhatsApp inbox tolerates incomplete contacts and invalid provider timestamps", () => {
  assert.match(whatsapp, /const safeDate =/);
  assert.match(whatsapp, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(whatsapp, /const contactName =/);
  assert.match(whatsapp, /This conversation has no valid WhatsApp number/);
});

test("mobile navigation is a stable five-column dock with a contained center action", () => {
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(mobileChrome, /className="mobile-nav-item"[\s\S]*aria-label="Quick actions"/);
  assert.match(mobileChrome, /className="mobile-center-fab"[\s\S]*<span>Quick<\/span>/);
});

test("only EcomOS PNG favicon references remain", () => {
  assert.doesNotMatch(html, /favicon\.ico|lovable/i);
  assert.match(html, /favicon\.png\?v=ecomos/);
  assert.equal(existsSync(new URL("../public/favicon.ico", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/icon-72-test.png", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/icon-96-test.png", import.meta.url)), false);
  const favicon = readFileSync(new URL("../public/favicon.png", import.meta.url));
  assert.deepEqual([...favicon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
