import { randomUUID } from "node:crypto";
import { ErrorCode, WorkerError, errorMessage } from "../utils/errors.js";
import { normalizeMoroccanPhone } from "../utils/phone.js";
import { loadVoiceRecording } from "./audio.js";
import { renderTemplate, templateVariables } from "./templates.js";

function completedParts(payload) {
  return new Set(Array.isArray(payload?.completed_parts) ? payload.completed_parts : []);
}

function messageSteps(rule) {
  if (!Array.isArray(rule?.message_steps)) return [];
  return rule.message_steps.filter((step) => step && (step.type === "text" || step.type === "audio"));
}

function retryDelay(settings, attempts) {
  const base = Math.max(10, Number(settings?.retry_base_seconds || 60));
  const cap = Math.max(base, Number(settings?.retry_max_seconds || 3600));
  const backoff = Math.min(cap, base * (2 ** Math.max(0, Number(attempts || 1) - 1)));
  return backoff + Math.floor(Math.random() * Math.max(1, Math.floor(backoff * 0.2)));
}

export class QueueProcessor {
  constructor({ repository, sessionManager, config, logger }) {
    this.repository = repository;
    this.sessionManager = sessionManager;
    this.config = config;
    this.logger = logger;
    this.timer = null;
    this.running = null;
    this.stopping = false;
  }

  start() {
    if (!this.repository.configured || this.timer || this.running) return false;
    this.stopping = false;
    this.#schedule(0);
    return true;
  }

  #schedule(delay = this.config.pollMs) {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.tick().catch((error) => this.logger.error({ err: error }, "queue tick failed")).finally(() => {
        this.running = null;
        this.#schedule();
      });
    }, delay);
    this.timer.unref?.();
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running?.catch(() => { });
  }

  async tick() {
    if (this.stopping || !this.repository.configured) return;
    await this.repository.recoverStaleJobs(this.config.staleJobMinutes);
    const workspaces = await this.repository.listEnabledWorkspaces();
    for (const workspace of workspaces) {
      if (this.stopping) break;
      const state = this.sessionManager.getState(workspace.workspace_id);
      const depth = await this.repository.queueDepth(workspace.workspace_id);
      await this.repository.heartbeat({
        workspaceId: workspace.workspace_id,
        workerId: this.config.workerId,
        workerVersion: this.config.version,
        status: state.connection_status === "initializing" ? "starting" : state.connection_status,
        queueDepth: depth,
        lastError: state.lastError,
        metadata: {
          provider: this.config.provider,
          connection_status: state.connection_status,
          connection_started_at: state.connectionStartedAt,
          connected_phone: state.connectedPhone,
          qr_present: Boolean(state.qr),
        },
      });
      if (state.connection_status !== "ready") continue;
      const jobs = await this.repository.claimJobs(workspace.workspace_id, this.config.claimLimit);
      for (const job of jobs) await this.processJob(job);
    }
  }

  async #markRetry(job, settings, error, permanent = false) {
    const exhausted = permanent || Number(job.attempts || 0) >= Number(job.max_attempts || 3);
    const seconds = retryDelay(settings, job.attempts);
    const nextRetry = new Date(Date.now() + seconds * 1000).toISOString();
    await this.repository.updateJob(job.id, job.workspace_id, {
      status: exhausted ? "failed" : "pending",
      failed_at: exhausted ? new Date().toISOString() : null,
      processing_at: null,
      send_started_at: null,
      send_token: null,
      next_retry_at: exhausted ? null : nextRetry,
      scheduled_for: exhausted ? job.scheduled_for : nextRetry,
      last_error: errorMessage(error),
      error_code: error?.code || "PROVIDER_ERROR",
      error_class: permanent ? "permanent" : "transient",
      locked_by: null,
    });
  }

  async #markDeliveryUnknown(job, message, sendToken = job.send_token) {
    await this.repository.updateJob(job.id, job.workspace_id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      processing_at: null,
      next_retry_at: null,
      last_error: message,
      error_code: ErrorCode.DELIVERY_UNKNOWN,
      error_class: "delivery_unknown",
      locked_by: null,
    }, sendToken ? { sendToken } : {});
    await this.repository.logEvent({
      workspace_id: job.workspace_id,
      order_id: job.order_id,
      event_type: "delivery_unknown",
      severity: "error",
      message,
      metadata: { job_id: job.id, send_token: sendToken || null },
    }).catch(() => { });
  }

  async processJob(job) {
    const initialPayload = job.payload && typeof job.payload === "object" ? { ...job.payload } : {};
    const completed = completedParts(initialPayload);
    if (initialPayload.current_part && !completed.has(initialPayload.current_part)) {
      await this.#markDeliveryUnknown(job, `The worker stopped while sending ${initialPayload.current_part}; automatic resend is blocked`);
      return;
    }

    const state = this.sessionManager.getState(job.workspace_id);
    if (state.connection_status !== "ready") {
      await this.#markRetry(job, {}, new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp provider is not ready", { retryable: true }));
      return;
    }

    let context;
    try {
      context = await this.repository.getJobContext(job);
    } catch (error) {
      await this.#markRetry(job, {}, error);
      return;
    }
    const { settings, order, workspace, rule } = context;
    if (!settings || !order) {
      await this.#markRetry(job, settings || {}, new WorkerError(ErrorCode.QUEUE_CONTEXT_MISSING, "Order or WhatsApp settings are missing"), true);
      return;
    }
    if (!settings.enabled) {
      await this.#markRetry(job, settings, new WorkerError(ErrorCode.QUEUE_CONTEXT_MISSING, "WhatsApp automation is disabled"), true);
      return;
    }

    const phone = normalizeMoroccanPhone(job.normalized_phone || job.phone);
    if (!phone) {
      await this.#markRetry(job, settings, new WorkerError(ErrorCode.RECIPIENT_INVALID, "Invalid Moroccan mobile number"), true);
      return;
    }
    if (await this.repository.isOptedOut(job.workspace_id, phone)) {
      await this.repository.updateJob(job.id, job.workspace_id, {
        status: "cancelled",
        processing_at: null,
        last_error: "Customer opted out",
        error_code: "OPT_OUT",
        locked_by: null,
      });
      return;
    }

    let registration;
    try {
      registration = await this.sessionManager.isRegistered(job.workspace_id, phone);
    } catch (error) {
      await this.#markRetry(job, settings, error);
      return;
    }
    if (!registration.registered || !registration.jid) {
      await this.#markRetry(job, settings, new WorkerError(ErrorCode.RECIPIENT_INVALID, "Number is not registered on WhatsApp"), true);
      return;
    }

    const variables = templateVariables(order, workspace || {});
    const configuredSteps = messageSteps(rule);
    const sequence = configuredSteps.length
      ? configuredSteps.map((step) => step.type)
      : Array.isArray(job.channel_sequence) && job.channel_sequence.length
        ? job.channel_sequence
        : Array.isArray(rule?.channel_sequence) && rule.channel_sequence.length
          ? rule.channel_sequence
          : ["text"];
    // Some reply-driven workflows use the same durable queue but provide their
    // own seller-authored text.  The queue remains the only sender, so a worker
    // restart cannot duplicate or silently lose a response between steps.
    const textTemplate = typeof initialPayload.text_template === "string"
      ? initialPayload.text_template
      : rule?.text_template || settings.confirmation_message || "";
    const fallbackTemplate = rule?.fallback_text || textTemplate;
    const payload = { ...initialPayload, completed_parts: [...completed], part_message_ids: { ...(initialPayload.part_message_ids || {}) } };
    let sendToken = job.send_token || randomUUID();
    let primaryProviderId = job.wa_message_id || null;
    let sentThisRun = 0;
    let recording;
    let loadedRecordingId = null;

    const persistPayload = async (extra = {}) => {
      payload.completed_parts = [...completed];
      await this.repository.updateJob(job.id, job.workspace_id, { payload, ...extra }, { sendToken });
    };

    const completeWithoutSend = async (partKey) => {
      completed.add(partKey);
      delete payload.current_part;
      delete payload.current_part_started_at;
      await persistPayload();
    };

    const transmit = async ({ partKey, kind, body, send, completeKey = partKey }) => {
      if (completed.has(completeKey)) return null;
      payload.current_part = partKey;
      payload.current_part_started_at = new Date().toISOString();
      await this.repository.updateJob(job.id, job.workspace_id, {
        send_started_at: job.send_started_at || payload.current_part_started_at,
        send_token: sendToken,
        locked_by: this.config.workerId,
        payload,
      }, { status: "processing" });

      let sent;
      try {
        sent = await send();
      } catch (error) {
        await this.#markDeliveryUnknown(job, `${kind} transmission may have reached WhatsApp; automatic resend is blocked: ${errorMessage(error)}`, sendToken);
        throw new WorkerError(ErrorCode.DELIVERY_UNKNOWN, errorMessage(error), { cause: error, deliveryUnknown: true });
      }
      if (!sent?.id) {
        await this.#markDeliveryUnknown(job, `${kind} transmission returned no provider message id`, sendToken);
        throw new WorkerError(ErrorCode.DELIVERY_UNKNOWN, "Provider returned no message id", { deliveryUnknown: true });
      }

      primaryProviderId ||= sent.id;
      completed.add(completeKey);
      payload.part_message_ids[partKey] = sent.id;
      delete payload.current_part;
      delete payload.current_part_started_at;
      await persistPayload({ wa_message_id: primaryProviderId, remote_jid: registration.jid });
      await this.repository.logMessage({
        workspace_id: job.workspace_id,
        order_id: job.order_id,
        customer_id: order.customer_id || null,
        phone: job.phone,
        normalized_phone: phone,
        remote_jid: registration.jid,
        direction: "outbound",
        message_type: job.message_type,
        body,
        wa_message_id: sent.id,
        provider_event_id: sent.id,
        status: "sent",
        raw_payload: { queue_id: job.id, part: kind },
      });
      sentThisRun += 1;
      return sent;
    };

    try {
      for (let index = 0; index < sequence.length; index += 1) {
        const part = sequence[index];
        const step = configuredSteps[index] || null;
        const partKey = `${index}:${part}`;
        if (completed.has(partKey)) continue;

        if (part === "text" && (step || rule?.text_enabled !== false)) {
          const body = renderTemplate(step?.text_template || textTemplate, variables);
          if (!body) { await completeWithoutSend(partKey); continue; }
          await transmit({ partKey, kind: "text", body, send: () => this.sessionManager.sendText(job.workspace_id, registration.jid, body) });
          continue;
        }

        if (part === "audio" && (step || rule?.audio_enabled)) {
          try {
            const recordingId = step?.audio_recording_id || job.audio_recording_id || rule?.audio_recording_id;
            if (!recording || loadedRecordingId !== recordingId) {
              loadedRecordingId = recordingId;
              await this.repository.logEvent({
                workspace_id: job.workspace_id,
                order_id: job.order_id,
                event_type: "audio_download_started",
                severity: "info",
                message: "Voice recording download started",
                metadata: { job_id: job.id, recording_id: recordingId || null },
              }).catch(() => { });
              recording = await this.repository.getRecording(job.workspace_id, recordingId);
              recording = await loadVoiceRecording(this.repository, job.workspace_id, recording);
              await this.repository.logEvent({
                workspace_id: job.workspace_id,
                order_id: job.order_id,
                event_type: "audio_downloaded",
                severity: "info",
                message: "Voice recording downloaded and prepared",
                metadata: {
                  job_id: job.id,
                  recording_id: recordingId || null,
                  mime_type: recording.mimeType,
                  original_mime: recording.originalMime || null,
                  size_bytes: recording.buffer?.length || 0,
                },
              }).catch(() => { });
            }
            await this.repository.logEvent({
              workspace_id: job.workspace_id,
              order_id: job.order_id,
              event_type: "audio_send_started",
              severity: "info",
              message: "Voice note send started",
              metadata: { job_id: job.id, jid: registration.jid, mime_type: recording.mimeType },
            }).catch(() => { });
            const sent = await transmit({
              partKey,
              kind: "audio",
              body: `[Voice recording: ${recording.name}]`,
              send: () => this.sessionManager.sendVoice(job.workspace_id, registration.jid, recording),
            });
            if (sent) {
              await this.repository.logEvent({
                workspace_id: job.workspace_id,
                order_id: job.order_id,
                event_type: "audio_sent",
                severity: "info",
                message: "Voice note sent successfully",
                metadata: { job_id: job.id, wa_message_id: sent.id || null },
              }).catch(() => { });
            }
          } catch (error) {
            if (error?.deliveryUnknown) throw error;
            await this.repository.logEvent({
              workspace_id: job.workspace_id,
              order_id: job.order_id,
              event_type: "audio_failed",
              severity: "error",
              message: "Voice note send failed",
              metadata: { job_id: job.id, error: errorMessage(error) },
            }).catch(() => { });
            const laterText = sequence.slice(index + 1).includes("text");
            const priorText = [...completed].some((key) => key.endsWith(":text"));
            if (rule?.fallback_text_enabled === false) throw error;
            await this.repository.logEvent({
              workspace_id: job.workspace_id,
              order_id: job.order_id,
              event_type: "audio_fallback",
              severity: "warning",
              message: priorText || laterText ? "Voice recording was unavailable; the configured text was retained" : "Voice recording was unavailable; fallback text was sent",
              metadata: { job_id: job.id, error: errorMessage(error) },
            }).catch(() => { });
            if (priorText || laterText) {
              await completeWithoutSend(partKey);
            } else {
              const body = renderTemplate(fallbackTemplate, variables);
              if (!body) throw error;
              await transmit({ partKey: `${partKey}:fallback`, completeKey: partKey, kind: "audio_fallback", body, send: () => this.sessionManager.sendText(job.workspace_id, registration.jid, body) });
            }
          }
          continue;
        }

        if (part === "fallback_text" && rule?.fallback_text_enabled !== false) {
          const body = renderTemplate(fallbackTemplate, variables);
          if (!body) { await completeWithoutSend(partKey); continue; }
          await transmit({ partKey, kind: "fallback_text", body, send: () => this.sessionManager.sendText(job.workspace_id, registration.jid, body) });
          continue;
        }

        await completeWithoutSend(partKey);
      }
    } catch (error) {
      if (error?.deliveryUnknown) return;
      await this.#markRetry({ ...job, send_token: sendToken }, settings, error);
      return;
    }

    if (!completed.size && !sentThisRun) {
      await this.#markRetry(job, settings, new WorkerError(ErrorCode.QUEUE_CONTEXT_MISSING, "Automation rule has no sendable parts"), true);
      return;
    }

    const sentAt = job.sent_at || new Date().toISOString();
    await this.repository.updateJob(job.id, job.workspace_id, {
      sent_at: sentAt,
      processing_at: null,
      next_retry_at: null,
      wa_message_id: primaryProviderId,
      remote_jid: registration.jid,
      last_error: null,
      error_code: null,
      error_class: null,
      locked_by: null,
      payload,
    }, { sendToken });
    await this.repository.updateJob(job.id, job.workspace_id, {
      status: "sent",
    }, { sendToken, status: "processing" });
    await this.repository.updateLastMessageSent(job.workspace_id, sentAt);
  }
}
