// Retired legacy endpoint. Meta Ads V2 exposes workspace-scoped assets through
// meta-assets after server-side authorization.
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "https://www.ecomos.ma",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  return Response.json(
    { error: "This legacy Meta endpoint has been retired. Use Meta Ads V2." },
    { status: 410 },
  );
});
