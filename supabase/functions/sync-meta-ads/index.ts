// Retired legacy endpoint. Meta Ads V2 uses meta-sync, which derives the
// workspace from the authenticated user rather than accepting workspace_id.
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
