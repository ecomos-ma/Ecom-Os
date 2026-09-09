import { corsHeaders, errorResponse, jsonResponse, serviceClient } from "../_shared/meta.ts";
import { readMetaSignedRequest, verifyMetaSignedRequest } from "../_shared/meta-signed-request.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const signedRequest = await readMetaSignedRequest(req);
    const payload = await verifyMetaSignedRequest(signedRequest);
    const client = serviceClient();
    const now = new Date().toISOString();
    const { error } = await client.from("meta_connections").update({
      access_token_encrypted: null,
      status: "disconnected",
      automation_enabled: false,
      auto_sync_enabled: false,
      disconnected_at: now,
      last_sync_error: "Deauthorized by Meta",
    }).eq("meta_user_id", payload.user_id).neq("status", "disconnected");
    if (error) throw error;
    return jsonResponse(req, { success: true });
  } catch (error) {
    return errorResponse(req, error);
  }
});
