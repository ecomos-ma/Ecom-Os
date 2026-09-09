export type GeoResult = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  confidence: "high" | "medium" | "low";
};

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => (/^(0|[1-9]\d{0,2})$/.test(part) ? Number(part) : -1));
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
}

function parseIpv6(value: string): number[] | null {
  let normalized = value.toLowerCase().split("%")[0];
  if (!normalized.includes(":")) return null;
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const bytes = parseIpv4(ipv4Tail);
    if (!bytes) return null;
    normalized = normalized.slice(0, -ipv4Tail.length) +
      `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const [leftRaw, rightRaw = ""] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (![...left, ...right].every((part) => /^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((normalized.includes("::") && missing < 1) || (!normalized.includes("::") && missing !== 0)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right].map((part) => parseInt(part, 16));
  return groups.length === 8 ? groups : null;
}

export function isPublicIp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const ip = value.trim();
  const v4 = parseIpv4(ip);
  if (v4) {
    const [a, b] = v4;
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) || a >= 224
    );
  }
  const v6 = parseIpv6(ip);
  if (!v6) return false;
  const first = v6[0];
  return !(
    v6.every((group) => group === 0) ||
    v6.slice(0, 7).every((group) => group === 0) && v6[7] === 1 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && v6[1] === 0x0db8)
  );
}

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function normalizeIpApiResponse(payload: unknown): GeoResult | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.is_bogon === true || row.bogon === true || row.error) return null;
  const location = row.location && typeof row.location === "object"
    ? row.location as Record<string, unknown>
    : row;
  const latitude = finiteCoordinate(location.latitude ?? location.lat, -90, 90);
  const longitude = finiteCoordinate(location.longitude ?? location.lon ?? location.lng, -180, 180);
  if (latitude === null || longitude === null) return null;
  const countryValue = location.country;
  const country = typeof countryValue === "string"
    ? countryValue
    : countryValue && typeof countryValue === "object"
      ? String((countryValue as Record<string, unknown>).name ?? "") || null
      : null;
  const countryCode = String(
    location.country_code ?? location.countryCode ??
    (countryValue && typeof countryValue === "object" ? (countryValue as Record<string, unknown>).code : "") ?? "",
  ).trim().toUpperCase();
  return {
    city: typeof location.city === "string" && location.city.trim() ? location.city.trim() : null,
    region: typeof location.region === "string" && location.region.trim() ? location.region.trim() : null,
    country,
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
    latitude,
    longitude,
    confidence: location.city ? "high" : country ? "medium" : "low",
  };
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip.trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
