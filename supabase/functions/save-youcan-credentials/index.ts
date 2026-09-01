// Retired: YouCan now uses the signed OAuth flow and the canonical
// public.integrations lifecycle. Keeping this endpoint as an authenticated 410
// prevents old clients from recreating legacy credential rows.
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "https://ecomscale.vercel.app",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  return new Response(JSON.stringify({ error: "This connection method has been retired. Use YouCan OAuth." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
