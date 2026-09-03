const AI_FALLBACK_ACTIONS = new Set(["unmatched", "unknown"]);
const DEFAULT_FALLBACK_REPLY = "سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏\nعاود صيفطها ليا أو استعمل واحد من الاختيارات:\n\n{{available_options}}";

function availableOptions(replyActions, order) {
  return (replyActions || [])
    .filter((action) => {
      if (!action.target_status) return true;
      const target = String(action.target_status).trim().toLowerCase();
      return [order?.status, order?.confirmation_status, order?.shipping_status, order?.delivery_status]
        .filter(Boolean)
        .some((value) => String(value).trim().toLowerCase() === target);
    })
    .map((action) => {
      const keyword = (Array.isArray(action.keywords) ? action.keywords : [])
        .map((value) => String(value || "").trim())
        .find((value) => /^[1-9](?:️⃣)?$/u.test(value));
      if (!keyword) return null;
      const number = keyword.replace("️⃣", "");
      const label = String(action.name || action.response_template || "").replace(/\s+/g, " ").trim();
      return label ? `${number} — ${label}` : number;
    })
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => Number(a) - Number(b));
}

function fallbackReply(context) {
  if (context.aiSettings?.fallback_enabled === false) return null;
  const message = String(context.aiSettings?.fallback_reply || DEFAULT_FALLBACK_REPLY).trim() || DEFAULT_FALLBACK_REPLY;
  const options = availableOptions(context.replyActions, context.order);
  const optionText = context.aiSettings?.fallback_show_options === false ? "" : options.join("\n");
  return message.replace(/\{\{available_options\}\}/gi, optionText).trim();
}

function asksForHuman(message) {
  return /(\b(agent|human|person|support|call me|operator)\b|بغيت.*(?:نهضر|نهدر)|نهضر.*(?:شي\s+واحد|واحد)|عيط\s*ليا|موظف|المساعدة)/iu.test(String(message || ""));
}

function appliedReply(result, proposedReply) {
  const changes = Array.isArray(result?.changes) ? result.changes : [];
  if (!changes.length) return result?.reply_text || proposedReply || null;
  const lines = [];
  for (const change of changes) {
    const value = change?.new_value;
    const text = typeof value === "string" ? value : value == null ? "" : String(value);
    if (change?.field === "customer_name") lines.push(`الاسم: ${text}`);
    else if (change?.field === "city") lines.push(`المدينة: ${text}`);
    else if (change?.field === "address") lines.push(`العنوان: ${text}`);
    else if (change?.field === "status") lines.push(text.toLowerCase() === "confirmed" ? "الطلب تأكد" : `الحالة: ${text}`);
    else if (change?.field === "notes" || change?.field === "customer_note") lines.push(`وضفنا الملاحظة ديالك: ${text}`);
    else if (change?.field === "quantity") lines.push(`الكمية: ${text}`);
    else if (change?.field === "variant") lines.push(`الاختيار: ${text}`);
    else if (change?.field === "callback_at") lines.push("حددنا وقت للتواصل معاك");
  }
  return lines.length ? `تم ✅\n${lines.join("\n")}` : result?.reply_text || proposedReply || "تم التحديث بنجاح ✅";
}

export class WhatsAppAiProcessor {
  constructor({ repository, gateway, logger }) {
    this.repository = repository;
    this.gateway = gateway;
    this.logger = logger;
  }

  async fallback(workspaceId, inbound, normalResult) {
    if (!normalResult || !AI_FALLBACK_ACTIONS.has(normalResult.action) || !normalResult.order_id) return null;
    if (normalResult.duplicate) return normalResult;
    const context = await this.repository.loadAiContext(workspaceId, normalResult.order_id, inbound.phone);
    if (!context.aiSettings?.enabled) {
      if (this.repository.logEvent) await this.repository.logEvent({ workspace_id: workspaceId, order_id: normalResult.order_id, event_type: "ai_disabled", severity: "info", message: "WhatsApp AI is disabled for this workspace", metadata: { provider_event_id: inbound.providerEventId } }).catch(() => {});
      return null;
    }
    if (context.order?.whatsapp_handoff_active) return null;

    const performHandoff = async (reason) => {
      if (!this.repository.executeAiHandoff || context.aiSettings?.handoff_enabled === false) return null;
      const handoff = await this.repository.executeAiHandoff({
        workspaceId, orderId: normalResult.order_id, inboundMessageId: normalResult.message_id || null,
        providerEventId: inbound.providerEventId, reason, phone: inbound.phone, inboundBody: inbound.text,
      }).catch(() => null);
      if (!handoff?.applied) return null;
      return { ...normalResult, action: "human_handoff", reply_text: handoff.reply_text, manual_review: true, handoff_reason: reason };
    };

    if (asksForHuman(inbound.text)) {
      const handoff = await performHandoff("customer_requested_human");
      if (handoff) return handoff;
    }

    try {
      const decision = await this.gateway.infer(context, inbound.text);
      const result = await (this.repository.executeAiActions || this.repository.executeAiAction).call(this.repository, {
        workspaceId,
        orderId: normalResult.order_id,
        inboundMessageId: normalResult.message_id || null,
        providerEventId: inbound.providerEventId,
        decision,
      });
      if (result?.applied) result.reply_text = appliedReply(result, decision.customer_reply || decision.reply_text);
      if (result?.action === "clarification" && Number(context.aiSettings?.clarification_attempt_limit || 0) === 0) {
        const handoff = await performHandoff("ai_low_confidence");
        if (handoff) return handoff;
      }
      await this.repository.logEvent({
        workspace_id: workspaceId,
        order_id: normalResult.order_id,
        event_type: "ai_action_processed",
        severity: result?.applied ? "info" : "warning",
        message: result?.applied ? "WhatsApp AI action applied" : "WhatsApp AI requested clarification",
        metadata: {
          intent: decision.intent || (Array.isArray(decision.actions) ? "multi_action" : "unknown"),
          applied: Boolean(result?.applied),
          provider_id: decision.providerId || null,
          provider_event_id: inbound.providerEventId,
        },
      }).catch(() => {});
      return result;
    } catch (error) {
      if (this.repository.logEvent) await this.repository.logEvent({ workspace_id: workspaceId, order_id: normalResult.order_id, event_type: "ai_processor_error", severity: "error", message: "WhatsApp AI processor failed", metadata: { provider_event_id: inbound.providerEventId, reason_code: error?.reasonCode || "provider_error" } }).catch(() => {});
      this.logger.warn({ err: error, workspaceId, providerEventId: inbound.providerEventId }, "WhatsApp AI fallback unavailable; normal automation remains active");
      await this.repository.logEvent({
        workspace_id: workspaceId,
        order_id: normalResult.order_id,
        event_type: "ai_unavailable",
        severity: "warning",
        message: "WhatsApp AI was unavailable; rule automation was not affected",
        metadata: {
          provider_event_id: inbound.providerEventId,
          reason_code: error?.reasonCode || "provider_error",
          error: error?.message || "AI unavailable",
        },
      }).catch(() => {});
      // AI failure must never become a silent terminal path. Returning a
      // normal reply result lets InboundProcessor send it through the same
      // provider/logging path without changing order data or status.
      const reply = fallbackReply(context);
      const handoffReason = error?.reasonCode === "rate_limit" ? "ai_quota_exhausted" : error?.reasonCode === "timeout" ? "ai_timeout" : error?.reasonCode === "invalid_response" ? "invalid_ai_response" : "all_providers_unavailable";
      const handoff = await performHandoff(handoffReason);
      if (handoff) return handoff;
      if (!reply) return null;
      return {
        ...normalResult,
        action: "ai_fallback",
        reply_text: reply,
        manual_review: true,
        ai_unavailable: true,
      };
    }
  }

  async test(workspaceId, message) {
    const context = await this.repository.loadAiContext(workspaceId, null, null);
    if (!context.aiSettings?.enabled) throw new Error("Enable WhatsApp AI before testing it");
    return this.gateway.infer(context, message, { testOnly: true });
  }
}
