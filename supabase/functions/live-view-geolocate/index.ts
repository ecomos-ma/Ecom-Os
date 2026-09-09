import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HttpError, authenticate, corsHeaders, errorResponse, json, requireUuid, serviceClient } from "../_shared/security.ts";

// Production-safe boundary. The provider adapter and IP validation are tested
// locally, but customer IP egress stays disabled until that exact destination
// is explicitly approved by the operator.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new HttpError("Method not allowed", 405);
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const { data: membership, error } = await client.from("profile_workspaces")
      .select("id").eq("profile_id", user.id).eq("workspace_id", workspaceId)
      .eq("status", "active").maybeSingle();
    if (error || !membership) throw new HttpError("Workspace access denied", 403);
    return json(req, { processed: 0, resolved: 0, provider_status: "disabled_pending_explicit_approval" });
  } catch (error) {
    return errorResponse(req, error);
  }
});
