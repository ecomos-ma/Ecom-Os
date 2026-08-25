import { corsHeaders, json } from "../_shared/security.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  return json(req, {
    error: "This maintenance endpoint is disabled. Realtime publication changes must be applied through reviewed database migrations.",
  }, 410);
});
