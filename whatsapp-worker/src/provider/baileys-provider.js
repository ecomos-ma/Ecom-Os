import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  jidNormalizedUser,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { WhatsAppProvider } from "./provider.js";
import { ErrorCode, WorkerError, errorMessage } from "../utils/errors.js";
import { normalizeMoroccanPhone, phoneFromJid, toProviderJid } from "../utils/phone.js";

function unwrapMessage(content) {
  let current = content || {};
  for (let index = 0; index < 4; index += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current;
}

function messageText(content) {
  const value = unwrapMessage(content);
  return String(
    value.conversation ||
    value.extendedTextMessage?.text ||
    value.buttonsResponseMessage?.selectedDisplayText ||
    value.buttonsResponseMessage?.selectedButtonId ||
    value.listResponseMessage?.title ||
    value.listResponseMessage?.singleSelectReply?.selectedRowId ||
    value.templateButtonReplyMessage?.selectedDisplayText ||
    value.templateButtonReplyMessage?.selectedId ||
    "",
  );
}

function contextInfo(content) {
  const value = unwrapMessage(content);
  const type = getContentType(value);
  return type && value[type]?.contextInfo ? value[type].contextInfo : null;
}

function providerMessageId(message) {
  return message?.key?.id || null;
}

function receiptStatus(status) {
  if (status === proto.WebMessageInfo.Status.ERROR) return "failed";
  if (status >= proto.WebMessageInfo.Status.READ) return "read";
  if (status >= proto.WebMessageInfo.Status.DELIVERY_ACK) return "delivered";
  if (status >= proto.WebMessageInfo.Status.SERVER_ACK) return "sent";
  return null;
}

function disconnectStatus(error) {
  if (!error) return null;
  if (error instanceof Boom) return error.output?.statusCode || null;
  return error?.output?.statusCode || error?.statusCode || null;
}

export class BaileysWhatsAppProvider extends WhatsAppProvider {
  constructor({ workspaceId, authStore, logger, reconnectBaseMs = 1000, reconnectMaxMs = 30000 }) {
    super({ workspaceId, logger });
    this.authStore = authStore;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;
    this.socket = null;
    this.auth = null;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.closedByUser = false;
    this.authenticatedEmitted = false;
    this.connectedPhone = null;
    this.displayName = null;
    this.connectionAttemptId = null;
  }

  snapshot() {
    return { state: this.state, connectedPhone: this.connectedPhone, displayName: this.displayName };
  }

  async connect({ forceFreshAuth = false } = {}) {
    if (this.connectPromise) return this.connectPromise;
    if (this.state === "ready" && this.socket && !forceFreshAuth) return this.snapshot();
    this.closedByUser = false;
    this.connectionAttemptId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId, forceFreshAuth }, "[WA CONNECT] starting");
    const task = this.#openSocket(forceFreshAuth);
    this.connectPromise = task;
    try {
      await task;
      return this.snapshot();
    } finally {
      if (this.connectPromise === task) this.connectPromise = null;
    }
  }

  async #openSocket(forceFreshAuth = false) {
    this.state = this.reconnectAttempts ? "reconnecting" : "starting";
    this.emit(this.state, { workspaceId: this.workspaceId });
    
    if (forceFreshAuth) {
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId }, "[WA AUTH] resetting to fresh auth");
      const resetResult = await this.authStore.resetAuth(this.workspaceId, { backup: true, reason: "terminal-invalid-auth" });
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId, backupPath: resetResult.backupPath }, "[WA AUTH] auth reset complete");
    }
    
    this.auth = await this.authStore.load(this.workspaceId);
    const registered = this.auth.state?.creds?.registered;
    this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId, registered }, "[WA AUTH] auth loaded");
    
    const baileysLogger = this.logger.child({ provider: "baileys", workspaceId: this.workspaceId });
    baileysLogger.level = process.env.BAILEYS_LOG_LEVEL || "warn";

    const socket = makeWASocket({
      auth: this.auth.state,
      logger: baileysLogger,
      browser: Browsers.ubuntu("Ecom OS"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      emitOwnEvents: true,
    });
    this.socket = socket;

    socket.ev.on("creds.update", this.auth.saveCreds);
    socket.ev.on("connection.update", (update) => this.#handleConnectionUpdate(socket, update));
    socket.ev.on("messages.upsert", (event) => this.#handleMessages(socket, event).catch((error) => this.#emitError(error)));
    socket.ev.on("messages.update", (updates) => this.#handleMessageUpdates(updates));
    socket.ev.on("message-receipt.update", (updates) => this.#handleReceiptUpdates(updates));
  }

  #handleConnectionUpdate(socket, update) {
    if (socket !== this.socket) return;
    
    if (update.qr) {
      this.state = "qr_ready";
      this.emit("qr", { qr: update.qr, generatedAt: new Date().toISOString() });
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId }, "[WA QR] received");
      return;
    }
    
    if (update.connection === "connecting" && !update.qr) {
      this.state = "connecting";
      this.emit("connecting", {});
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId }, "[WA CONNECT] socket connecting");
    }

    if (update.isNewLogin && !this.authenticatedEmitted) {
      this.authenticatedEmitted = true;
      this.state = "authenticated";
      this.emit("authenticated", {});
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId }, "[WA AUTH] authenticated");
    }
    
    if (update.connection === "open") {
      if (!this.authenticatedEmitted && this.auth?.state?.creds?.registered) this.emit("authenticated", {});
      this.authenticatedEmitted = true;
      this.reconnectAttempts = 0;
      this.state = "ready";
      const me = socket.user || this.auth?.state?.creds?.me || {};
      this.connectedPhone = phoneFromJid(me.id) || phoneFromJid(me.lid);
      this.displayName = me.name || null;
      this.emit("ready", { connectedPhone: this.connectedPhone, displayName: this.displayName });
      this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId, connectedPhone: this.connectedPhone }, "[WA READY] connection open");
      return;
    }
    
    if (update.connection !== "close" || this.closedByUser) return;

    const status = disconnectStatus(update.lastDisconnect?.error);
    this.logger.info({ workspaceId: this.workspaceId, connectionAttemptId: this.connectionAttemptId, statusCode: status }, "[WA DISCONNECT] connection closed");
    
    if (status === DisconnectReason.loggedOut || status === DisconnectReason.badSession) {
      this.state = "error";
      const error = new WorkerError(ErrorCode.AUTH_SESSION_INVALID, "WhatsApp session is no longer valid; reconnect with a new QR code", {
        cause: update.lastDisconnect?.error,
      });
      this.emit("error", error);
      this.emit("disconnected", { reason: error.message, revokeRequired: true });
      return;
    }
    
    this.state = "reconnecting";
    this.emit("reconnecting", { reason: errorMessage(update.lastDisconnect?.error) });
    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    if (this.reconnectTimer || this.closedByUser) return;
    const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * (2 ** Math.min(this.reconnectAttempts, 5)));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.#emitError(new WorkerError(ErrorCode.PROVIDER_INIT_FAILED, errorMessage(error), { cause: error, retryable: true }));
        this.#scheduleReconnect();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async #phoneJidForMessage(socket, message) {
    const candidates = [message?.key?.remoteJidAlt, message?.key?.participantAlt, message?.key?.remoteJid, message?.key?.participant];
    for (const candidate of candidates) if (phoneFromJid(candidate)) return jidNormalizedUser(candidate);
    const lid = candidates.find((candidate) => String(candidate || "").endsWith("@lid"));
    if (lid) return socket.signalRepository?.lidMapping?.getPNForLID(lid);
    return null;
  }

  async #handleMessages(socket, { messages, type }) {
    if (type !== "notify") return;
    for (const message of messages || []) {
      const remoteJid = message?.key?.remoteJid;
      if (!remoteJid || message?.key?.fromMe || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;
      const phoneJid = await this.#phoneJidForMessage(socket, message);
      const phone = phoneFromJid(phoneJid);
      const eventId = providerMessageId(message);
      if (!phone || !eventId) continue;
      const content = unwrapMessage(message.message);
      const context = contextInfo(content);
      this.emit("message", {
        workspaceId: this.workspaceId,
        providerEventId: eventId,
        remoteJid,
        phone,
        text: messageText(content),
        quotedMessageId: context?.stanzaId || null,
        receivedAt: new Date(Number(message.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
        rawPayload: {
          message_type: getContentType(content) || "unknown",
          push_name: message.pushName || null,
          upsert_type: type,
          phone_jid: phoneJid,
        },
      });
    }
  }

  #handleMessageUpdates(updates) {
    for (const item of updates || []) {
      const status = receiptStatus(item?.update?.status);
      const id = item?.key?.id;
      if (status && id) this.emit("receipt", { providerMessageId: id, status, rawPayload: { source: "messages.update" } });
    }
  }

  #handleReceiptUpdates(updates) {
    for (const item of updates || []) {
      const id = item?.key?.id;
      if (!id) continue;
      const status = item.receipt?.readTimestamp ? "read" : item.receipt?.receiptTimestamp ? "delivered" : null;
      if (status) this.emit("receipt", { providerMessageId: id, status, rawPayload: { source: "message-receipt.update" } });
    }
  }

  #emitError(error) {
    this.emit("error", error instanceof WorkerError ? error : new WorkerError(ErrorCode.PROVIDER_INIT_FAILED, errorMessage(error), { cause: error }));
  }

  #requireReady() {
    if (!this.socket || this.state !== "ready") {
      throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp provider is not ready", { retryable: true });
    }
    return this.socket;
  }

  async isRegistered(phone) {
    const normalized = normalizeMoroccanPhone(phone);
    if (!normalized) return { registered: false, jid: null };
    const result = await this.#requireReady().onWhatsApp(normalized);
    const match = result?.find((entry) => entry.exists) || null;
    return { registered: Boolean(match), jid: match?.jid || toProviderJid(normalized) };
  }

  async sendText(jid, text) {
    const message = await this.#requireReady().sendMessage(jid, { text: String(text) });
    return { id: providerMessageId(message), raw: message };
  }

  async sendVoice(jid, { buffer, mimeType, seconds }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || mimeType !== "audio/ogg; codecs=opus") {
      throw new WorkerError(ErrorCode.INVALID_REQUEST, "WhatsApp voice notes must be non-empty Ogg Opus audio", { retryable: false });
    }
    const message = await this.#requireReady().sendMessage(jid, {
      audio: buffer,
      mimetype: mimeType,
      ptt: true,
      ...(seconds ? { seconds: Math.ceil(seconds) } : {}),
    });
    return { id: providerMessageId(message), raw: message };
  }

  getConnectedPhone() {
    return this.connectedPhone;
  }

  async disconnect({ revoke = false } = {}) {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        if (revoke) await socket.logout();
        else socket.end(new Error("Worker session closed"));
      } catch (error) {
        this.logger.warn({ err: error, workspaceId: this.workspaceId }, "provider close failed");
      }
    }
    if (revoke) await this.authStore.clear(this.workspaceId);
    this.state = "disconnected";
    this.connectedPhone = null;
    this.displayName = null;
    this.emit("disconnected", { reason: revoke ? "Session revoked" : "Session closed", revokeRequired: false });
  }
}
