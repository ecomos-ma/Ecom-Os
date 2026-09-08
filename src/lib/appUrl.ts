const CANONICAL_PRODUCTION_URL = "https://www.ecomos.ma";
const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getAppUrl(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin);
  }

  if (configuredAppUrl) {
    try {
      const configured = new URL(configuredAppUrl);
      const isAllowedProductionHost = configured.protocol === "https:"
        && (configured.hostname === "www.ecomos.ma" || configured.hostname === "ecomos.ma")
        && !configured.username
        && !configured.password
        && !configured.port
        && configured.pathname === "/";
      if (isAllowedProductionHost) return CANONICAL_PRODUCTION_URL;
    } catch {
      // Fall through to the fixed production origin.
    }
  }

  return CANONICAL_PRODUCTION_URL;
}

export function getAppUrlForPath(path: string): string {
  return new URL(path, `${getAppUrl()}/`).toString();
}

export function getSafeReturnPath(value: string | null | undefined, fallback = "/"): string {
  const candidate = value?.trim() || "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
