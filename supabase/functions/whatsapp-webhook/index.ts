import { corsHeaders, json, serviceClient, verifyHmac } from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const verified = await verifyHmac(
    rawBody,
    req.headers.get("x-ecom-timestamp"),
    req.headers.get("x-ecom-signature"),
  ).catch(() => false);
  if (!verified) return json(req, { error: "Invalid or expired signature" }, 401);

  try {
    const body = JSON.parse(rawBody) as {
      workspace_id?: string;
      provider_event_id?: string;
      remote_jid?: string;
      phone?: string;
      text?: string;
      quoted_message_id?: string;
      received_at?: string;
      raw_payload?: Record<string, unknown>;
    };
    if (!body.workspace_id || !body.provider_event_id || !body.phone) {
      return json(req, { error: "workspace_id, provider_event_id and phone are required" }, 400);
    }

    const client = serviceClient();
    const { data, error } = await client.rpc("process_whatsapp_inbound", {
      p_workspace_id: body.workspace_id,
      p_provider_event_id: body.provider_event_id,
      p_remote_jid: body.remote_jid || null,
      p_phone: body.phone,
      p_body: body.text || "",
      p_quoted_message_id: body.quoted_message_id || null,
      p_received_at: body.received_at || new Date().toISOString(),
      p_raw_payload: body.raw_payload || {},
    });
    if (error) throw error;
    return json(req, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(req, { error: message }, 500);
  }
});
