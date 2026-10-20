export type ShippingGeoResult = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  accuracy: "address" | "city";
};

export interface ShippingGeocodingProvider {
  readonly name: string;
  readonly minimumDelayMs: number;
  resolve(query: string, countryCode?: string | null): Promise<ShippingGeoResult | null>;
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : null;
}

function isoCountry(value: unknown): string | null {
  const country = clean(value)?.toUpperCase() || "";
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function normalizeMapboxGeocodeResponse(payload: unknown): ShippingGeoResult | null {
  if (!payload || typeof payload !== "object") return null;
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return null;
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const row = feature as Record<string, unknown>;
    const properties = row.properties && typeof row.properties === "object"
      ? row.properties as Record<string, unknown>
      : {};
    const geometry = row.geometry && typeof row.geometry === "object"
      ? row.geometry as Record<string, unknown>
      : {};
    const center = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : Array.isArray(row.center) ? row.center : [];
    const longitude = finiteCoordinate(center[0], -180, 180);
    const latitude = finiteCoordinate(center[1], -90, 90);
    if (latitude === null || longitude === null) continue;
    const featureType = clean(properties.feature_type)?.toLowerCase();
    const placeTypes = featureType
      ? [featureType]
      : Array.isArray(row.place_type) ? row.place_type.map(String) : [];
    const v6Context = properties.context && typeof properties.context === "object"
      ? properties.context as Record<string, unknown>
      : {};
    const v6ContextValue = (level: string, field = "name") => {
      const item = v6Context[level];
      return item && typeof item === "object" ? clean((item as Record<string, unknown>)[field]) : null;
    };
    const context = Array.isArray(row.context) ? row.context.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
    const all = [row, ...context];
    const contextValue = (prefix: string, field = "text") => clean(all.find((item) => String(item.id || "").startsWith(`${prefix}.`))?.[field]);
    const addressLevel = placeTypes.some((value) => ["address", "postcode", "neighborhood"].includes(value));
    const name = clean(properties.name) || clean(row.text);
    return {
      city: v6ContextValue("place") || v6ContextValue("locality") || (placeTypes.includes("place") ? name : null) || contextValue("place") || contextValue("locality"),
      region: v6ContextValue("region") || contextValue("region"),
      country: v6ContextValue("country") || contextValue("country") || (placeTypes.includes("country") ? name : null),
      countryCode: isoCountry(v6ContextValue("country", "country_code") || contextValue("country", "short_code")?.split("-")[0]),
      latitude,
      longitude,
      accuracy: addressLevel ? "address" : "city",
    };
  }
  return null;
}

export function normalizeNominatimGeocodeResponse(payload: unknown): ShippingGeoResult | null {
  if (!Array.isArray(payload)) return null;
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const latitude = finiteCoordinate(row.lat, -90, 90);
    const longitude = finiteCoordinate(row.lon, -180, 180);
    if (latitude === null || longitude === null) continue;
    const address = row.address && typeof row.address === "object" ? row.address as Record<string, unknown> : {};
    const category = clean(row.category ?? row.class)?.toLowerCase();
    const type = clean(row.type)?.toLowerCase();
    const city = clean(address.city ?? address.town ?? address.village ?? address.municipality ?? address.county);
    const addressLevel = category !== "place" && !["city", "town", "village", "administrative"].includes(type || "");
    return {
      city,
      region: clean(address.state ?? address.region),
      country: clean(address.country),
      countryCode: isoCountry(address.country_code),
      latitude,
      longitude,
      accuracy: addressLevel ? "address" : "city",
    };
  }
  return null;
}

export class MapboxShippingGeocoder implements ShippingGeocodingProvider {
  readonly name = "mapbox";
  readonly minimumDelayMs = 0;
  private readonly token: string;
  constructor(token: string) { this.token = token; }

  async resolve(query: string, countryCode?: string | null): Promise<ShippingGeoResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", query);
      url.searchParams.set("access_token", this.token);
      url.searchParams.set("limit", "1");
      url.searchParams.set("language", "fr,ar,en");
      url.searchParams.set("types", "address,place,locality,neighborhood,postcode");
      url.searchParams.set("autocomplete", "false");
      // Cached coordinates must use Mapbox's permanent result mode.
      url.searchParams.set("permanent", "true");
      if (countryCode && /^[A-Z]{2}$/.test(countryCode)) url.searchParams.set("country", countryCode.toLowerCase());
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) return null;
      return normalizeMapboxGeocodeResponse(await response.json());
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }
}

export class NominatimShippingGeocoder implements ShippingGeocodingProvider {
  readonly name = "nominatim";
  readonly minimumDelayMs = 1100;
  private readonly baseUrl: string;
  private readonly contactEmail: string;
  constructor(baseUrl: string, contactEmail: string) {
    this.baseUrl = baseUrl;
    this.contactEmail = contactEmail;
  }

  async resolve(query: string, countryCode?: string | null): Promise<ShippingGeoResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const url = new URL("search", this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "1");
      url.searchParams.set("email", this.contactEmail);
      if (countryCode && /^[A-Z]{2}$/.test(countryCode)) url.searchParams.set("countrycodes", countryCode.toLowerCase());
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": "fr,ar,en",
          "user-agent": `EcomOS-LiveView/1.0 (${this.contactEmail})`,
          referer: "https://ecomos.ma/",
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return normalizeNominatimGeocodeResponse(await response.json());
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }
}

export function configuredShippingGeocoder(): ShippingGeocodingProvider | null {
  const mapboxToken = Deno.env.get("MAPBOX_GEOCODING_TOKEN")?.trim();
  if (mapboxToken) return new MapboxShippingGeocoder(mapboxToken);
  const nominatimUrl = Deno.env.get("NOMINATIM_BASE_URL")?.trim();
  const contactEmail = Deno.env.get("NOMINATIM_CONTACT_EMAIL")?.trim();
  return nominatimUrl && contactEmail ? new NominatimShippingGeocoder(nominatimUrl, contactEmail) : null;
}
