import { supabase } from "../supabase/client.js";
import { normalizeMoroccanPhone, phoneFromRemoteJid } from "../utils/phone.js";
import { renderTemplate, templateVariables } from "../utils/template.js";

function messageId(message) {
  return message?.id?._serialized || message?.id?.id || null;
}

function quotedMessageId(message) {
  return message?._data?.quotedStanzaID || message?._data?.quotedMsg?.id?._serialized || null;
}

async function logOutboundReply(workspaceId, orderId, phone, remoteJid, body, sent) {
  const providerId = messageId(sent);
  const { error } = await supabase.from("whatsapp_messages").insert({
    workspace_id: workspaceId,
    order_id: orderId || null,
    phone,
    normalized_phone: normalizeMoroccanPhone(phone),
    remote_jid: remoteJid,
    direction: "outbound",
    message_type: "reply",
    body,
    wa_message_id: providerId,
    provider_event_id: providerId,
    status: "sent",
  });
  if (error && error.code !== "23505") console.error("[inbound] reply log failed", error.message);
}

export async function handleInboundMessage(workspaceId, client, message) {
  if (!message || message.fromMe || String(message.from || "").endsWith("@g.us")) return;

  const remoteJid = message.from;
  const phone = phoneFromRemoteJid(remoteJid);
  if (!phone) return;

  const providerEventId = messageId(message);
  if (!providerEventId) return;

  const { data: result, error } = await supabase.rpc("process_whatsapp_inbound", {
    p_workspace_id: workspaceId,
    p_provider_event_id: providerEventId,
    p_remote_jid: remoteJid,
    p_phone: phone,
    p_body: message.body || "",
    p_quoted_message_id: quotedMessageId(message),
    p_received_at: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString(),
    p_raw_payload: {
      type: message.type,
      has_media: Boolean(message.hasMedia),
      device_type: message.deviceType || null,
    },
  });

  if (error) {
    console.error(`[inbound:${workspaceId}]`, error.message);
    return;
  }
  if (!result || result.duplicate || !result.reply_text) return;

  let body = result.reply_text;
  if (result.order_id) {
    const [{ data: order }, { data: workspace }] = await Promise.all([
      supabase.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", result.order_id).maybeSingle(),
      supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    ]);
    if (order) body = renderTemplate(body, templateVariables(order, workspace || {}));
  }

  if (!body) return;
  const sent = await client.sendMessage(remoteJid, body);
  await logOutboundReply(workspaceId, result.order_id, phone, remoteJid, body, sent);
}

export async function handleMessageAck(workspaceId, message, ack) {
  const providerId = messageId(message);
  if (!providerId) return;

  const status = ack >= 3 ? "read" : ack >= 2 ? "delivered" : ack < 0 ? "failed" : "sent";
  const timestamps = {
    ...(status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
    ...(status === "read" ? { read_at: new Date().toISOString(), delivered_at: new Date().toISOString() } : {}),
  };

  await Promise.all([
    supabase.from("whatsapp_messages").update({ status, ...timestamps }).eq("workspace_id", workspaceId).eq("wa_message_id", providerId),
    supabase.from("whatsapp_queue").update({ status, ...timestamps }).eq("workspace_id", workspaceId).eq("wa_message_id", providerId),
  ]);
}

