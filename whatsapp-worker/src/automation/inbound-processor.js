import { normalizeMoroccanPhone } from "../utils/phone.js";
import { renderTemplate, templateVariables } from "./templates.js";

export class InboundProcessor {
  constructor({ repository, logger }) {
    this.repository = repository;
    this.logger = logger;
  }

  async handle(workspaceId, provider, message) {
    if (!this.repository.configured) return;
    const safeId = message?.providerEventId || null;
    try {
      // --------------------------------------------------------------------------
      // 1. Persist inbound message + match reply action (via DB RPC)
      // --------------------------------------------------------------------------
      const result = await this.repository.processInbound({
        workspaceId,
        providerEventId: safeId,
        remoteJid: message.remoteJid,
        phone: message.phone,
        text: message.text || "",
        quotedMessageId: message.quotedMessageId || null,
        receivedAt: message.receivedAt,
        rawPayload: message.rawPayload || {},
      });

      // --------------------------------------------------------------------------
      // 2. Log inbound_received in worker (lightweight, non-blocking)
      // --------------------------------------------------------------------------
      await this.repository.logEvent({
        workspace_id: workspaceId,
        order_id: null,
        event_type: "inbound_received",
        severity: "info",
        message: "Customer WhatsApp message processed",
        metadata: {
          provider_event_id: safeId,
          phone: normalizeMoroccanPhone(message.phone),
          action: result?.action || "unmatched",
          duplicate: result?.duplicate || false,
          manual_review: result?.manual_review || false,
        },
      }).catch(() => { });

      // --------------------------------------------------------------------------
      // 3. If duplicate, stop here
      // --------------------------------------------------------------------------
      if (!result || result.duplicate) return;

      // --------------------------------------------------------------------------
      // 4. Send automatic reply if the matched action has a response_template
      // --------------------------------------------------------------------------
      if (!result.reply_text) return;

      let body = result.reply_text;
      // Resolve template variables against the associated order
      if (result.order_id) {
        const ctx = await this.repository.loadInboundTemplateContext(workspaceId, result.order_id);
        if (ctx.order) body = renderTemplate(body, templateVariables(ctx.order, ctx.workspace || {}));
      }

      // Guard: never send unresolved {{variables}}
      if (/\{\{[a-z_]+\}\}/i.test(body)) {
        body = body.replace(/\{\{[a-z_]+\}\}/gi, "").replace(/\s{2,}/g, " ").trim();
      }
      if (!body) return;

      // --------------------------------------------------------------------------
      // 5. Transmit auto-reply
      // --------------------------------------------------------------------------
      const sent = await provider.sendText(message.remoteJid, body);
      await this.repository.logMessage({
        workspace_id: workspaceId,
        order_id: result.order_id || null,
        phone: message.phone,
        normalized_phone: normalizeMoroccanPhone(message.phone),
        remote_jid: message.remoteJid,
        direction: "outbound",
        message_type: "reply",
        body,
        wa_message_id: sent.id,
        provider_event_id: sent.id,
        status: "sent",
      });
      await this.repository.logEvent({
        workspace_id: workspaceId,
        order_id: result.order_id || null,
        event_type: "reply_sent",
        severity: "info",
        message: "Automatic reply sent to customer",
        metadata: {
          provider_event_id: safeId,
          wa_message_id: sent.id,
          action: result.action,
        },
      }).catch(() => { });
    } catch (error) {
      this.logger.error(
        { err: error, workspaceId, providerEventId: safeId },
        "inbound WhatsApp processing failed",
      );
      await this.repository.logEvent({
        workspace_id: workspaceId,
        order_id: null,
        event_type: "inbound_error",
        severity: "error",
        message: error?.message || "Inbound processing failed",
        metadata: { provider_event_id: safeId },
      }).catch(() => { });
    }
  }
}
