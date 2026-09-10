import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HttpError, authenticate, corsHeaders, errorResponse, json, requireUuid, serviceClient } from "../_shared/security.ts";
import { hashIp, isPublicIp, type GeoResult } from "../_shared/live-view-geo.ts";
import { IpApiIsProvider } from "../_shared/live-view-ipapi-provider.ts";

function equalSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new HttpError("Method not allowed", 405);
    const client = serviceClient();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const internal = req.headers.get("x-youcan-cron-secret")?.trim() ?? "";
    const expectedInternal = Deno.env.get("YOUCAN_CRON_SECRET")?.trim() ?? "";
    if (!internal || !expectedInternal || !equalSecret(internal, expectedInternal)) {
      const user = await authenticate(req, client);
      const { data: membership, error } = await client.from("profile_workspaces")
        .select("id").eq("profile_id", user.id).eq("workspace_id", workspaceId)
        .eq("status", "active").maybeSingle();
      if (error || !membership) throw new HttpError("Workspace access denied", 403);
    }

    const requestedLimit = Number(body.limit ?? 8);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 8, 20));
    if (Deno.env.get("LIVE_VIEW_IP_GEOLOCATION_ENABLED")?.trim().toLowerCase() !== "true") {
      return json(req, { processed: 0, resolved: 0, provider_status: "disabled_pending_explicit_approval" });
    }
    const salt = Deno.env.get("LIVE_VIEW_IP_HASH_SALT")?.trim();
    if (!salt) throw new HttpError("Missing environment variable: LIVE_VIEW_IP_HASH_SALT", 503);

    const events = await client.from("live_view_events").select("order_id")
      .eq("workspace_id", workspaceId).neq("geo_source", "ip")
      .order("occurred_at", { ascending: false }).limit(limit * 4);
    if (events.error) throw new HttpError("Live locations could not be loaded", 503);
    const orderIds = (events.data ?? []).map((event) => event.order_id);
    if (!orderIds.length) return json(req, { processed: 0, resolved: 0, provider_status: "ready" });

    const orders = await client.from("orders").select('"Order ID",customer_ip')
      .eq("workspace_id", workspaceId).in("Order ID", orderIds).not("customer_ip", "is", null).limit(limit);
    if (orders.error) throw new HttpError("Order locations could not be loaded", 503);

    const provider = new IpApiIsProvider(Deno.env.get("LIVE_VIEW_IPAPI_KEY")?.trim() || undefined);
    let processed = 0, resolved = 0;
    for (const order of orders.data ?? []) {
      const ip = String(order.customer_ip ?? "").trim();
      if (!isPublicIp(ip)) continue;
      processed += 1;
      const ipHash = await hashIp(ip, salt);
      const cached = await client.from("live_view_geo_cache").select("city,region,country,country_code,latitude,longitude,confidence")
        .eq("ip_hash", ipHash).gt("expires_at", new Date().toISOString()).maybeSingle();
      let location: GeoResult | null = cached.data ? {
        city: cached.data.city, region: cached.data.region, country: cached.data.country,
        countryCode: cached.data.country_code, latitude: cached.data.latitude,
        longitude: cached.data.longitude, confidence: cached.data.confidence,
      } : null;
      if (!location) {
        location = await provider.resolve(ip);
        if (location) {
          await client.from("live_view_geo_cache").upsert({
            ip_hash: ipHash, city: location.city, region: location.region, country: location.country,
            country_code: location.countryCode, latitude: location.latitude, longitude: location.longitude,
            provider: provider.name, confidence: location.confidence,
            resolved_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
      if (!location) continue;
      const updated = await client.from("live_view_events").update({
        city: location.city, region: location.region, country: location.country,
        country_code: location.countryCode, latitude: location.latitude, longitude: location.longitude,
        geo_source: "ip", geo_confidence: location.confidence, updated_at: new Date().toISOString(),
      }).eq("order_id", order["Order ID"]).eq("workspace_id", workspaceId);
      if (!updated.error) resolved += 1;
    }
    return json(req, { processed, resolved, provider_status: "ready" });
  } catch (error) {
    return errorResponse(req, error);
  }
});
