if (typeof window !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      console.log("Service Worker registered:", registration.scope);

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
