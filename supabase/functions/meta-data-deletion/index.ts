import { MetaError, corsHeaders, errorResponse, jsonResponse, serviceClient } from "../_shared/meta.ts";
import { frontendAppUrl } from "../_shared/app-url.ts";
import { readMetaSignedRequest, verifyMetaSignedRequest } from "../_shared/meta-signed-request.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const signedRequest = await readMetaSignedRequest(req);
    const payload = await verifyMetaSignedRequest(signedRequest);
    const client = serviceClient();
    const { data: connections, error: connectionError } = await client
      .from("meta_connections")
      .select("workspace_id, connected_by")
      .eq("meta_user_id", payload.user_id);
    if (connectionError) throw connectionError;
    if (!connections?.length) {
      throw new MetaError("Meta connection not found", 404, "permission");
    }
    const references: string[] = [];
    for (const connection of connections ?? []) {
      const reference = `META-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const { data, error } = await client.from("data_deletion_requests").insert({
        reference_code: reference,
        user_id: connection.connected_by,
        workspace_id: connection.workspace_id,
        request_type: "data_deletion",
        source: "meta",
        reason: "Verified Meta data-deletion callback",
        status: "requested",
        data_to_delete: ["meta_integration_data", "provider_credentials"],
        verified_at: new Date().toISOString(),
      }).select("reference_code").single();
      if (error) throw error;
      references.push(String(data.reference_code));
    }
    const confirmationCode = references[0];
    const confirmationUrl = new URL("/data-deletion", frontendAppUrl());
    confirmationUrl.searchParams.set("confirmation_code", confirmationCode);
    return jsonResponse(req, { url: confirmationUrl.toString(), confirmation_code: confirmationCode });
  } catch (error) {
    return errorResponse(req, error);
  }
});
