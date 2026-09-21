import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { assertOnlyKeys, authenticate, authorizeOperationalWorkspace, corsHeaders, errorResponse, json, requireUuid, serviceClient } from "../_shared/security.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const supabase = serviceClient();
    const user = await authenticate(req, supabase);
    const body = await req.json();
    
    assertOnlyKeys(body, ["workspace_id"]);
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    
    // Verifies admin access AND active subscription (same as connect)
    await authorizeOperationalWorkspace(supabase, user.id, workspaceId);

    // Currently deletes the credential. (Once webhook subscriptions are added
    // in the next phase, we will fetch the decrypted token first and send
    // an unregister call to Shopify before dropping the row).
    const { error } = await supabase
      .from("shopify_credentials")
      .delete()
      .eq("workspace_id", workspaceId);

    if (error) throw new Error("Database deletion failed");

    return json(req, { success: true });
  } catch (err) {
    console.error("[Shopify Disconnect] request rejected:", err);
    return errorResponse(req, err);
  }
});
