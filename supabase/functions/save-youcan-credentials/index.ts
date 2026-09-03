// Retired: YouCan now uses the signed OAuth flow and the canonical
// public.integrations lifecycle. Keeping this endpoint as an authenticated 410
// prevents old clients from recreating legacy credential rows.
import { frontendOrigins } from "../_shared/app-url.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") ?? "";
    return new Response("ok", {
      headers: {
        ...(frontendOrigins().has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  return new Response(JSON.stringify({ error: "This connection method has been retired. Use YouCan OAuth." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
