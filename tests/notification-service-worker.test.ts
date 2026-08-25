import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../src/sw.ts", import.meta.url), "utf8");
const registration = readFileSync(new URL("../src/registerServiceWorker.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.tsx", import.meta.url), "utf8");
const ordersContext = readFileSync(new URL("../src/contexts/OrdersContext.tsx", import.meta.url), "utf8");
const subscriptionFunction = readFileSync(new URL("../supabase/functions/notification-subscriptions/index.ts", import.meta.url), "utf8");
const pushFunction = readFileSync(new URL("../supabase/functions/notification-push/index.ts", import.meta.url), "utf8");

test("one registered service worker handles push and notification navigation", () => {
  assert.match(registration, /register\("\/sw\.js"\)/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /clients\.openWindow/);
});

test("service worker validates internal navigation and preserves offline routing", () => {
  assert.match(worker, /parsed\.origin === self\.location\.origin/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /precacheAndRoute/);
});

test("service worker never attempts custom push audio", () => {
  assert.doesNotMatch(worker, /new Audio|audio_2026|notification\.mp3/);
});

test("persistent operational notifications are separate from local UI toasts", () => {
  assert.doesNotMatch(layout, /Notification\.requestPermission|new-orders-toast|showNotification/);
  assert.doesNotMatch(ordersContext, /new-orders-toast/);
});

test("subscription API is authenticated and never returns raw credentials in device lists", () => {
  assert.match(subscriptionFunction, /authenticate\(req, client\)/);
  assert.match(subscriptionFunction, /notification_list_devices/);
  assert.match(subscriptionFunction, /validPushEndpoint/);
});

test("push worker configures VAPID and cleans permanently invalid subscriptions", () => {
  assert.match(pushFunction, /setVapidDetails/);
  assert.match(pushFunction, /status === 404 \|\| status === 410/);
  assert.match(pushFunction, /is_active: invalid \? false : true/);
});
