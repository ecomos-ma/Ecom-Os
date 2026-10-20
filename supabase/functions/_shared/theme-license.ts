/** Shared by the administrator API and the public storefront verifier. */
export function normalizeThemeDomain(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 512) throw new Error("Invalid domain");
  const value = input.trim();
  if (/[*\\\s@?#]/.test(value) || (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value))) {
    throw new Error("Invalid domain");
  }
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error("Invalid domain"); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid domain");
  let domain = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (domain.length > 253 || !domain.includes(".") || /^(?:\d+\.){3}\d+$/.test(domain)) throw new Error("Invalid domain");
  const labels = domain.split(".");
  if (labels.some((part) => part.length < 1 || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) throw new Error("Invalid domain");
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/.test(labels.at(-1)!)) throw new Error("Invalid domain");
  return domain;
}

export function generateThemeLicenseCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const characters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `ECO-LIC-${characters.slice(0, 4).join("")}-${characters.slice(4, 8).join("")}-${characters.slice(8, 12).join("")}`;
}

export async function hashThemeLicenseCode(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validThemeLicenseCode(code: unknown): code is string {
  return typeof code === "string" && (
    /^ECO-LIC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code.trim().toUpperCase()) ||
    /^ecomos_[a-f0-9]{64}$/.test(code.trim())
  );
}

export function normalizeThemeLicenseCode(code: unknown): string {
  if (!validThemeLicenseCode(code)) throw new Error("Invalid license key");
  const value = (code as string).trim();
  return value.toLowerCase().startsWith("ecomos_") ? value.toLowerCase() : value.toUpperCase();
}
