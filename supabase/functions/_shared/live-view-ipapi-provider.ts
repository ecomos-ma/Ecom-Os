import { normalizeIpApiResponse, type GeoResult } from "./live-view-geo.ts";

export interface IpGeolocationProvider {
  readonly name: string;
  resolve(ip: string): Promise<GeoResult | null>;
}

export class IpApiIsProvider implements IpGeolocationProvider {
  readonly name = "ipapi.is";
  constructor(private readonly apiKey?: string) {}

  async resolve(ip: string): Promise<GeoResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      // POST keeps the address and optional key out of query strings and URL logs.
      const response = await fetch("https://api.ipapi.is/", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ q: ip, ...(this.apiKey ? { key: this.apiKey } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return normalizeIpApiResponse(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
