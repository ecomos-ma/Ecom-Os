import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HttpError, authenticate, corsHeaders, errorResponse, json, requireUuid, serviceClient } from "../_shared/security.ts";
import { configuredShippingGeocoder, type ShippingGeoResult } from "../_shared/live-view-geocoding-provider.ts";

type OrderLocation = {
  "Order ID": string;
  address: string | null;
  city: string | null;
  city_name: string | null;
  raw_city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  shipping_latitude: number | null;
  shipping_longitude: number | null;
  shipping_geo_accuracy: "coordinates" | "address" | "city" | null;
  shipping_geocode_query_hash: string | null;
};

function equalSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function text(value: unknown, maximum = 300): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function coordinates(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? { latitude: lat, longitude: lng }
    : null;
}

function normalizedCountryCode(country: unknown): string | null {
  const value = text(country, 80).toLocaleLowerCase("en");
  if (/^[a-z]{2}$/.test(value)) return value.toUpperCase();
  const aliases: Record<string, string> = {
    morocco: "MA", maroc: "MA", المغرب: "MA",
    france: "FR", spain: "ES", espagne: "ES", إسبانيا: "ES",
    "united kingdom": "GB", uk: "GB", "united states": "US", usa: "US",
    "united arab emirates": "AE", uae: "AE", "saudi arabia": "SA",
  };
  return aliases[value] || null;
}

function locationQuery(order: OrderLocation): { query: string; hasAddress: boolean; countryCode: string | null } | null {
  const address = text(order.address, 320);
  const city = text(order.city_name || order.city || order.raw_city, 120);
  const region = text(order.region, 120);
  const postalCode = text(order.postal_code, 32);
  const country = text(order.country, 80);
  if (!address && !city) return null;
  const unique = [...new Set([address, postalCode, city, region, country].filter(Boolean).map((part) => part.toLocaleLowerCase("en")))];
  return { query: unique.join(", "), hasAddress: Boolean(address), countryCode: normalizedCountryCode(country) };
}

async function hashQuery(query: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query.normalize("NFKC").toLocaleLowerCase("en")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countryMatches(expected: string | null, result: ShippingGeoResult): boolean {
  return !expected || !result.countryCode || expected === result.countryCode;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new HttpError("Method not allowed", 405);
    const client = serviceClient();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const orderId = body.order_id ? requireUuid(body.order_id, "order_id") : null;
    const internal = req.headers.get("x-youcan-cron-secret")?.trim() ?? "";
    const expectedInternal = Deno.env.get("YOUCAN_CRON_SECRET")?.trim() ?? "";
    if (!internal || !expectedInternal || !equalSecret(internal, expectedInternal)) {
      const user = await authenticate(req, client);
      const { data: membership, error } = await client.from("profile_workspaces")
        .select("id").eq("profile_id", user.id).eq("workspace_id", workspaceId)
        .eq("status", "active").maybeSingle();
      if (error || !membership) throw new HttpError("Workspace access denied", 403);
    }

    const requestedLimit = Number(body.limit ?? 6);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 6, 8));
    let eventQuery = client.from("live_view_events")
      .select("order_id,latitude,longitude,geo_source")
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false });
    eventQuery = orderId ? eventQuery.eq("order_id", orderId).limit(1) : eventQuery.limit(limit * 4);
    const events = await eventQuery;
    if (events.error) throw new HttpError("Live locations could not be loaded", 503);
    const eventByOrder = new Map((events.data ?? []).map((event) => [String(event.order_id), event]));
    const orderIds = [...eventByOrder.keys()];
    if (!orderIds.length) return json(req, { processed: 0, resolved: 0, provider_status: "ready" });

    const orders = await client.from("orders").select(
      '"Order ID",address,city,city_name,raw_city,region,country,postal_code,shipping_latitude,shipping_longitude,shipping_geo_accuracy,shipping_geocode_query_hash',
    ).eq("workspace_id", workspaceId).in("Order ID", orderIds).limit(limit);
    if (orders.error) throw new HttpError("Order locations could not be loaded", 503);

    const provider = configuredShippingGeocoder();
    const hashSalt = Deno.env.get("LIVE_VIEW_GEO_HASH_SALT")?.trim();
    if (!hashSalt) throw new HttpError("Live View geocoding cache is not configured", 503);
    let processed = 0, resolved = 0, externalRequests = 0;

    for (const row of (orders.data ?? []) as OrderLocation[]) {
      const orderCoordinates = coordinates(row.shipping_latitude, row.shipping_longitude);
      if (orderCoordinates) {
        const update = await client.from("live_view_events").update({
          latitude: orderCoordinates.latitude,
          longitude: orderCoordinates.longitude,
          geo_source: row.shipping_geo_accuracy === "address" ? "address" : row.shipping_geo_accuracy === "city" ? "city" : "coordinates",
          geo_confidence: row.shipping_geo_accuracy === "city" ? "medium" : "high",
          updated_at: new Date().toISOString(),
        }).eq("order_id", row["Order ID"]).eq("workspace_id", workspaceId);
        if (!update.error) resolved += 1;
        continue;
      }

      const candidate = locationQuery(row);
      const projected = eventByOrder.get(row["Order ID"]);
      if (!candidate || (!candidate.hasAddress && coordinates(projected?.latitude, projected?.longitude))) continue;
      if (!provider) continue;
      processed += 1;
      const queryHash = await hashQuery(candidate.query, hashSalt);
      const cached = await client.from("live_view_geocode_cache")
        .select("city,region,country,country_code,latitude,longitude,accuracy")
        .eq("query_hash", queryHash).gt("expires_at", new Date().toISOString()).maybeSingle();
      let location: ShippingGeoResult | null = cached.data ? {
        city: cached.data.city,
        region: cached.data.region,
        country: cached.data.country,
        countryCode: cached.data.country_code,
        latitude: cached.data.latitude,
        longitude: cached.data.longitude,
        accuracy: cached.data.accuracy,
      } : null;

      if (!location) {
        if (externalRequests > 0 && provider.minimumDelayMs) await wait(provider.minimumDelayMs);
        externalRequests += 1;
        location = await provider.resolve(candidate.query, candidate.countryCode);
        if (location && !countryMatches(candidate.countryCode, location)) location = null;
        if (location) {
          if (!candidate.hasAddress) location.accuracy = "city";
          await client.from("live_view_geocode_cache").upsert({
            query_hash: queryHash,
            city: location.city,
            region: location.region,
            country: location.country,
            country_code: location.countryCode,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            provider: provider.name,
            resolved_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
      if (!location) continue;

      const checkedAt = new Date().toISOString();
      const city = location.city || text(row.city_name || row.city || row.raw_city, 120) || null;
      const [orderUpdate, eventUpdate] = await Promise.all([
        client.from("orders").update({
          shipping_latitude: location.latitude,
          shipping_longitude: location.longitude,
          shipping_geo_accuracy: location.accuracy,
          shipping_geocoded_at: checkedAt,
          shipping_geocode_query_hash: queryHash,
        }).eq("Order ID", row["Order ID"]).eq("workspace_id", workspaceId),
        client.from("live_view_events").update({
          city,
          region: location.region || row.region,
          country: location.country || row.country,
          country_code: location.countryCode,
          latitude: location.latitude,
          longitude: location.longitude,
          geo_source: location.accuracy,
          geo_confidence: location.accuracy === "address" ? "high" : "medium",
          updated_at: checkedAt,
        }).eq("order_id", row["Order ID"]).eq("workspace_id", workspaceId),
      ]);
      if (!orderUpdate.error && !eventUpdate.error) resolved += 1;
    }

    return json(req, {
      processed,
      resolved,
      provider_status: provider ? "ready" : "configuration_required",
      provider: provider?.name ?? null,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
