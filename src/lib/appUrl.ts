const CANONICAL_PRODUCTION_URL = "https://www.ecomos.ma";
const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getAppUrl(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin);
  }
  return normalizeBaseUrl(configuredAppUrl || CANONICAL_PRODUCTION_URL);
}

export function getAppUrlForPath(path: string): string {
  return new URL(path, `${getAppUrl()}/`).toString();
}

export function getSafeReturnPath(value: string | null | undefined, fallback = "/"): string {
  const candidate = value?.trim() || "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
