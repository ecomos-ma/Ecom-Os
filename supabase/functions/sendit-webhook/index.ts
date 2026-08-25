// Production-ready Sendit webhook endpoint. It intentionally remains dormant
// until a verified webhook secret is configured after the app has a public URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const clean = (value: unknown) => String(value ?? "").trim();
const now = () => new Date().toISOString();

function mapSenditStatus(value: unknown): string | null {
  switch (clean(value).toUpperCase()) {
    case "PENDING": case "TO_PREPARE": return "NEW_PARCEL";
    case "NEW_DESTINATION": case "POSTPONED": return "RESCHEDULE_REQUESTED";
    case "TO_PICKUP": return "WAITING_PICKUP";
    case "PICKEDUP": return "PICKED_UP";
    case "WAREHOUSE": return "RECEIVED_AT_WAREHOUSE";
    case "TRANSIT": return "IN_TRANSIT";
    case "DISTRIBUTED": return "IN_DISTRIBUTION";
    case "UNREACHABLE": return "NO_ANSWER";
    case "DELIVERING": return "OUT_FOR_DELIVERY";
    case "DELIVERED": return "DELIVERED";
    case "CANCELED": return "CANCELED";
    case "REJECTED": return "REFUSED";
    default: return null;
  }
}

function safeMetadata(event: Record<string, unknown>) {
  return {
    event: clean(event.event),
    old_status: clean(event.oldStatus),
    new_status: clean(event.newStatus),
    last_action_at: clean(event.lastActionAt),
    message: clean(event.message).slice(0, 500),
    proof_image: clean(event.proofImage),
    deliver_by: clean(event.deliverBy),
    counter_unreachable: Number.isFinite(Number(event.counterUnreachable)) ? Number(event.counterUnreachable) : null,
  };
}

async function hmacHex(secret: string, raw: ArrayBuffer) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, raw);
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalSignature(left: string, right: string) {
  const a = clean(left).replace(/^sha256=/i, "").toLowerCase();
  const b = clean(right).replace(/^sha256=/i, "").toLowerCase();
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  const signature = req.headers.get("X-Sendit-Signature");
  if (!signature) return json({ success: false, message: "Missing Sendit signature." }, 401);

  // Preserve the exact byte sequence for HMAC verification before parsing JSON.
  const raw = await req.arrayBuffer();
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: integrations, error: integrationsError } = await service.from("workspace_sendit_integrations")
    .select("workspace_id, webhook_secret").eq("enabled", true).not("webhook_secret", "is", null);
  if (integrationsError || !integrations?.length) {
    return json({ success: false, message: "Sendit webhook is not configured." }, 503);
  }
  let verifiedWorkspaceId = "";
  for (const integration of integrations) {
    const secret = clean(integration.webhook_secret);
    if (!secret) continue;
    if (equalSignature(await hmacHex(secret, raw), signature)) {
      verifiedWorkspaceId = integration.workspace_id;
      break;
    }
  }
  if (!verifiedWorkspaceId) return json({ success: false, message: "Invalid Sendit signature." }, 401);

  let event: Record<string, unknown>;
  try { event = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return json({ success: false, message: "Invalid JSON payload." }, 400); }
  const code = clean(event.code);
  if (!code) return json({ success: false, message: "Missing Sendit delivery code." }, 400);

  const { data: order, error: orderError } = await service.from("orders")
    .select("id, \"Order ID\", workspace_id, order_number, shipping_status, shipment_status")
    .eq("workspace_id", verifiedWorkspaceId).eq("shipping_provider", "sendit").eq("tracking_number", code).maybeSingle();
  if (orderError || !order) return json({ success: false, message: "Unknown Sendit delivery." }, 404);

  const rawStatus = clean(event.newStatus).toUpperCase();
  const mapped = mapSenditStatus(rawStatus);
  const metadata = safeMetadata(event);
  const values = {
    shipment_status: rawStatus || order.shipment_status || null,
    shipping_status: mapped || order.shipping_status || null,
    shipping_status_raw: metadata,
    shipping_updated_at: now(),
    last_tracking_sync: now(),
  };
  let update = await service.from("orders").update(values).eq("workspace_id", order.workspace_id).eq("Order ID", order["Order ID"]).select('"Order ID"').maybeSingle();
  if (!update.data && !update.error && order.id) update = await service.from("orders").update(values).eq("workspace_id", order.workspace_id).eq("id", order.id).select("id").maybeSingle();
  if (update.error || !update.data) return json({ success: false, message: "Could not update Sendit shipment." }, 500);

  await service.from("shipping_logs").insert({
    workspace_id: order.workspace_id,
    provider: "sendit",
    order_id: order.id || null,
    order_number: order.order_number || null,
    action: "sendit.webhook",
    request_payload: { tracking_number: code, ...metadata },
    response_payload: { success: true },
    http_status: 200,
  });
  return json({ success: true });
});
