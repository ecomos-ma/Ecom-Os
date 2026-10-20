const DEV_WORKER_RESET_KEY = "ecomos:dev-worker-reset";

async function removeDevelopmentServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const localRegistrations = registrations.filter((registration) => {
    try {
      return new URL(registration.scope).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  await Promise.all(localRegistrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("workbox-") || ["ecomos-pages", "image-cache", "static-resources"].includes(name))
      .map((name) => caches.delete(name)));
  }

  // A removed worker keeps controlling its current document until one reload.
  // Reload exactly once so local API requests immediately bypass stale PWA code.
  if (wasControlled && localRegistrations.length > 0 && sessionStorage.getItem(DEV_WORKER_RESET_KEY) !== "done") {
    sessionStorage.setItem(DEV_WORKER_RESET_KEY, "done");
    window.location.reload();
    return;
  }
  if (!navigator.serviceWorker.controller) sessionStorage.removeItem(DEV_WORKER_RESET_KEY);
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    void removeDevelopmentServiceWorkers().catch((error) => {
      console.warn("Could not remove the stale local service worker:", error);
    });
  } else if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      console.log("Service Worker registered:", registration.scope);

      if (registration.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new Event("swUpdated"));
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("New service worker installed.");
            window.dispatchEvent(new Event("swUpdated"));
          }
        });
      });
    }).catch((error) => {
      console.error("Service Worker registration failed:", error);
    });
    });
  }
}
