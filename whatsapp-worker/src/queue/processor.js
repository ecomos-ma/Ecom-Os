import { randomUUID } from "node:crypto";
import whatsappWeb from "whatsapp-web.js";
import { config } from "../config.js";
import { supabase } from "../supabase/client.js";
import { getClient, getClientState } from "../whatsapp/client-manager.js";
import { normalizeMoroccanPhone } from "../utils/phone.js";
import { renderTemplate, templateVariables } from "../utils/template.js";

const { MessageMedia } = whatsappWeb;

let timer = null;
let running = false;

function providerMessageId(message) {
  return message?.id?._serialized || message?.id?.id || null;
}

function classifyError(error) {
  const message = String(error?.message || error || "Unknown provider error");
  const lower = message.toLowerCase();
  if (lower.includes("not a registered user") || lower.includes("invalid") || lower.includes("wid error")) {
    return { permanent: true, code: "invalid_recipient", kind: "validation", message };
  }
  if (lower.includes("session closed") || lower.includes("not connected") || lower.includes("target closed")) {
    return { permanent: false, code: "provider_disconnected", kind: "provider", message };
  }
  return { permanent: false, code: "provider_error", kind: "provider", message };
}

async function markRetry(job, settings, failure) {
  const exhausted = failure.permanent || job.attempts >= job.max_attempts;
  const base = Math.max(10, settings.retry_base_seconds || 60);
  const cap = Math.max(base, settings.retry_max_seconds || 3600);
  const backoff = Math.min(cap, base * (2 ** Math.max(0, job.attempts - 1)));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(backoff * 0.2)));
  const nextRetry = new Date(Date.now() + (backoff + jitter) * 1000).toISOString();
  await supabase.from("whatsapp_queue").update({
    status: exhausted ? "failed" : "pending",
    failed_at: exhausted ? new Date().toISOString() : null,
    processing_at: null,
    send_started_at: null,
    send_token: null,
    next_retry_at: exhausted ? null : nextRetry,
    scheduled_for: exhausted ? job.scheduled_for : nextRetry,
    last_error: failure.message,
    error_code: failure.code,
    error_class: failure.kind,
    locked_by: null,
  }).eq("id", job.id).eq("workspace_id", job.workspace_id);
}

async function downloadAudio(recording) {
  const { data, error } = await supabase.storage.from("whatsapp-audio").download(recording.storage_path);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  return new MessageMedia(recording.mime_type, buffer.toString("base64"), recording.name, recording.file_size);
}

async function logPart(job, order, remoteJid, body, type, sent) {
  const id = providerMessageId(sent);
  const { error } = await supabase.from("whatsapp_messages").insert({
    workspace_id: job.workspace_id,
    order_id: job.order_id,
    customer_id: order.customer_id || null,
    phone: job.phone,
    normalized_phone: job.normalized_phone,
    remote_jid: remoteJid,
    direction: "outbound",
    message_type: type,
    body,
    wa_message_id: id,
    provider_event_id: id,
    status: "sent",
  });
  if (error && error.code !== "23505") throw error;
  return id;
}

async function processJob(job) {
  const workspaceId = job.workspace_id;
  const client = getClient(workspaceId);
  const state = getClientState(workspaceId).status;
  if (!client || state !== "ready") {
    await markRetry(job, { retry_base_seconds: 60, retry_max_seconds: 600 }, {
      permanent: false, code: "provider_disconnected", kind: "provider", message: "WhatsApp client is not ready",
    });
    return;
  }

  const [{ data: settings, error: settingsError }, { data: order, error: orderError }, { data: workspace }] = await Promise.all([
    supabase.from("whatsapp_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("orders").select("*").eq("workspace_id", workspaceId).eq("Order ID", job.order_id).maybeSingle(),
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
  ]);
  if (settingsError || orderError || !settings || !order) {
    await markRetry(job, settings || {}, { permanent: true, code: "missing_context", kind: "data", message: settingsError?.message || orderError?.message || "Order/settings not found" });
    return;
  }
  if (!settings.enabled || settings.connection_status !== "ready") {
    await markRetry(job, settings, { permanent: false, code: "automation_disabled", kind: "configuration", message: "Automation disabled or WhatsApp disconnected" });
    return;
  }

  const phone = normalizeMoroccanPhone(job.normalized_phone || job.phone);
  if (!phone) {
    await markRetry(job, settings, { permanent: true, code: "invalid_recipient", kind: "validation", message: "Invalid Moroccan mobile number" });
    return;
  }
  const { data: optedOut } = await supabase.from("whatsapp_opt_outs").select("id").eq("workspace_id", workspaceId).eq("normalized_phone", phone).maybeSingle();
  if (optedOut) {
    await supabase.from("whatsapp_queue").update({ status: "cancelled", last_error: "Customer opted out", error_code: "opt_out", processing_at: null }).eq("id", job.id);
    return;
  }

  const numberId = await client.getNumberId(phone);
  if (!numberId?._serialized) {
    await markRetry(job, settings, { permanent: true, code: "not_on_whatsapp", kind: "validation", message: "Number is not registered on WhatsApp" });
    return;
  }
  const remoteJid = numberId._serialized;

  const { data: rule } = job.rule_id
    ? await supabase.from("whatsapp_automation_rules").select("*").eq("workspace_id", workspaceId).eq("id", job.rule_id).maybeSingle()
    : { data: null };
  const variables = templateVariables(order, workspace || {});
  const sequence = job.channel_sequence?.length ? job.channel_sequence : rule?.channel_sequence || ["text"];
  let recording = null;
  if (job.audio_recording_id || rule?.audio_recording_id) {
    const { data } = await supabase.from("whatsapp_audio_recordings").select("*").eq("workspace_id", workspaceId).eq("id", job.audio_recording_id || rule.audio_recording_id).maybeSingle();
    recording = data;
  }

  const textTemplate = rule?.text_template || settings.confirmation_message || "";
  const fallbackTemplate = rule?.fallback_text || textTemplate;
  const sendToken = randomUUID();
  await supabase.from("whatsapp_queue").update({ send_started_at: new Date().toISOString(), send_token: sendToken, locked_by: config.workerId }).eq("id", job.id).eq("status", "processing");

  let primaryProviderId = null;
  let partsSent = 0;
  try {
    for (const part of sequence) {
      let sent;
      let body = null;
      if (part === "text" && rule?.text_enabled !== false) {
        body = renderTemplate(textTemplate, variables);
        if (!body) continue;
        sent = await client.sendMessage(remoteJid, body);
      } else if (part === "audio" && rule?.audio_enabled) {
        try {
          if (!recording) throw new Error("Configured voice recording is unavailable");
          const media = await downloadAudio(recording);
          sent = await client.sendMessage(remoteJid, media, { sendAudioAsVoice: true });
          body = `[Voice recording: ${recording.name}]`;
        } catch (audioError) {
          if (partsSent > 0 && rule?.fallback_text_enabled !== false) {
            await supabase.from("whatsapp_events").insert({
              workspace_id: workspaceId,
              order_id: job.order_id,
              event_type: "audio_fallback",
              severity: "warning",
              message: "Voice recording was unavailable; previously sent text was retained",
              metadata: { job_id: job.id, error: String(audioError?.message || audioError) },
            });
            continue;
          }
          if (rule?.fallback_text_enabled !== false) {
            body = renderTemplate(fallbackTemplate, variables);
            if (!body) throw audioError;
            sent = await client.sendMessage(remoteJid, body);
          } else {
            throw audioError;
          }
        }
      } else if (part === "fallback_text" && rule?.fallback_text_enabled !== false) {
        body = renderTemplate(fallbackTemplate, variables);
        if (!body) continue;
        sent = await client.sendMessage(remoteJid, body);
      } else {
        continue;
      }

      partsSent += 1;
      const partId = await logPart(job, order, remoteJid, body, job.message_type, sent);
      primaryProviderId ||= partId;
      await supabase.from("whatsapp_queue").update({ wa_message_id: primaryProviderId, remote_jid: remoteJid }).eq("id", job.id).eq("send_token", sendToken);
    }

    if (!partsSent) throw new Error("Automation rule has no sendable text or audio parts");
    const sentAt = new Date().toISOString();
    await Promise.all([
      supabase.from("whatsapp_queue").update({ status: "sent", sent_at: sentAt, processing_at: null, next_retry_at: null, wa_message_id: primaryProviderId, remote_jid: remoteJid, last_error: null, error_code: null, error_class: null, locked_by: null }).eq("id", job.id).eq("send_token", sendToken),
      supabase.from("whatsapp_settings").update({ last_message_sent_at: sentAt }).eq("workspace_id", workspaceId),
    ]);
  } catch (error) {
    const failure = classifyError(error);
    if (partsSent > 0) {
      await supabase.from("whatsapp_queue").update({ status: "failed", failed_at: new Date().toISOString(), processing_at: null, last_error: `Partial send (${partsSent} part(s)): ${failure.message}`, error_code: "partial_send", error_class: failure.kind, locked_by: null }).eq("id", job.id).eq("send_token", sendToken);
    } else {
      await markRetry({ ...job, send_token: sendToken }, settings, failure);
    }
  }
}

async function heartbeat(workspaceId) {
  const [{ count }, state] = await Promise.all([
    supabase.from("whatsapp_queue").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "pending"),
    Promise.resolve(getClientState(workspaceId)),
  ]);
  await supabase.rpc("record_whatsapp_worker_heartbeat", {
    p_workspace_id: workspaceId,
    p_worker_id: config.workerId,
    p_worker_version: config.version,
    p_status: state.status,
    p_queue_depth: count || 0,
    p_last_error: null,
    p_metadata: {},
  });
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await supabase.rpc("recover_stale_whatsapp_jobs", { p_timeout_minutes: 10 });
    const { data: settings, error } = await supabase.from("whatsapp_settings").select("workspace_id").eq("enabled", true).eq("connection_status", "ready");
    if (error) throw error;
    for (const row of settings || []) {
      await heartbeat(row.workspace_id);
      const { data: jobs, error: claimError } = await supabase.rpc("claim_whatsapp_jobs", { p_workspace_id: row.workspace_id, p_limit: config.claimLimit });
      if (claimError) throw claimError;
      for (const job of jobs || []) await processJob(job);
    }
  } catch (error) {
    console.error("[queue]", error);
  } finally {
    running = false;
  }
}

export function startQueueProcessor() {
  if (timer) return;
  tick();
  timer = setInterval(tick, config.pollMs);
}

export function stopQueueProcessor() {
  if (timer) clearInterval(timer);
  timer = null;
}
