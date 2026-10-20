export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pendingPrompt: DeferredInstallPrompt | null = null;

export function getPendingInstallPrompt() {
  return pendingPrompt;
}

export function clearPendingInstallPrompt() {
  pendingPrompt = null;
  window.dispatchEvent(new Event("ecomos-install-prompt-changed"));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as DeferredInstallPrompt;
    window.dispatchEvent(new Event("ecomos-install-prompt-changed"));
  });
  window.addEventListener("appinstalled", clearPendingInstallPrompt);
}
