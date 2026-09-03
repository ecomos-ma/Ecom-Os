const CANONICAL_PRODUCTION_URL = "https://www.ecomos.ma";
const LOCAL_FRONTEND_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function frontendAppUrl(): string {
  const configured = Deno.env.get("FRONTEND_URL")?.trim() || Deno.env.get("APP_URL")?.trim();
  return (configured || CANONICAL_PRODUCTION_URL).replace(/\/+$/, "");
}

export function frontendOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_FRONTEND_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([CANONICAL_PRODUCTION_URL, "https://ecomos.ma", ...LOCAL_FRONTEND_ORIGINS, ...configured]);
}

export function isTrustedFrontendUrl(value: string): boolean {
  try {
    return frontendOrigins().has(new URL(value, `${frontendAppUrl()}/`).origin);
  } catch {
    return false;
  }
}
