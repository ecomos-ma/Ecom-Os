/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string | null }> };

clientsClaim();
cleanupOutdatedCaches();

// Authenticated pages and user-uploaded images must never survive account changes.
// Keep only versioned build assets and a generic offline page in the precache.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkOnly(),
);
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(({ url }) => /\.supabase\.co$/i.test(url.hostname), new NetworkOnly());
registerRoute(
  ({ url }) => /^fonts\.(?:googleapis|gstatic)\.com$/i.test(url.hostname),
  new CacheFirst({ cacheName: "google-fonts-cache", plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31_536_000 })] }),
);
// Remove private runtime caches left behind by older service-worker versions.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => ["ecomos-pages", "image-cache", "static-resources"].includes(name)).map((name) => caches.delete(name)));
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

setCatchHandler(async ({ event }) => {
  if (event instanceof FetchEvent && event.request.mode === "navigate") {
    return (await matchPrecache("/offline.html")) ?? Response.error();
  }
  return Response.error();
});

type PushPayload = {
  notification_id?: string;
  title?: string;
  body?: string;
  action_url?: string;
  category?: string;
  priority?: string;
};

function safeInternalUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/notifications";
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/notifications";
  } catch {
    return "/notifications";
  }
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try { payload = event.data?.json() as PushPayload ?? {}; } catch { payload = { body: event.data?.text() }; }
  // OS notifications can appear on a lock screen; details stay inside the app.
  const title = "Ecom OS";
  const body = "You have a new notification.";
  const actionUrl = safeInternalUrl(payload.action_url);
  const critical = payload.priority === "critical";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-96.png",
    tag: payload.notification_id ? `ecomos:${payload.notification_id}` : `ecomos:${payload.category ?? "system"}`,
    renotify: critical,
    requireInteraction: critical,
    data: { action_url: actionUrl, notification_id: payload.notification_id ?? null },
  } as NotificationOptions));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const actionUrl = safeInternalUrl((event.notification.data as { action_url?: unknown } | null)?.action_url);
  const target = new URL(actionUrl, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const windowClient = client as WindowClient;
      if (new URL(windowClient.url).origin === self.location.origin) {
        await windowClient.focus();
        await windowClient.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("notificationclose", (event: NotificationEvent) => {
  const notificationId = (event.notification.data as { notification_id?: unknown } | null)?.notification_id;
  if (typeof notificationId !== "string") return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: "ECOMOS_NOTIFICATION_CLOSED", notification_id: notificationId }));
  })());
});
