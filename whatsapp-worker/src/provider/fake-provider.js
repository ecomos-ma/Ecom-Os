import { WhatsAppProvider } from "./provider.js";
import { normalizeMoroccanPhone, toProviderJid } from "../utils/phone.js";
import { ErrorCode, WorkerError } from "../utils/errors.js";

export class FakeWhatsAppProvider extends WhatsAppProvider {
  constructor({ workspaceId, logger = { warn() {}, child() { return this; } }, autoReady = false, registered = true } = {}) {
    super({ workspaceId, logger });
    this.autoReady = autoReady;
    this.registered = registered;
    this.sent = [];
    this.counter = 0;
    this.connectedPhone = null;
  }

  async connect() {
    this.state = "starting";
    this.emit("starting", {});
    queueMicrotask(() => {
      if (this.autoReady) this.emitReady();
      else this.emitQr(`fake-qr-${this.workspaceId}`);
    });
    return this.snapshot();
  }

  emitQr(qr = "fake-qr") {
    this.state = "qr_ready";
    this.emit("qr", { qr, generatedAt: new Date().toISOString() });
  }

  emitAuthenticated() {
    this.state = "authenticated";
    this.emit("authenticated", {});
  }

  emitReady(phone = "212600000000", displayName = "Fake WhatsApp") {
    this.emitAuthenticated();
    this.state = "ready";
    this.connectedPhone = phone;
    this.emit("ready", { connectedPhone: phone, displayName });
  }

  emitMessage(message) { this.emit("message", message); }
  emitReceipt(receipt) { this.emit("receipt", receipt); }

  async isRegistered(phone) {
    const normalized = normalizeMoroccanPhone(phone);
    return { registered: Boolean(normalized && this.registered), jid: normalized ? toProviderJid(normalized) : null };
  }

  #send(kind, jid, value) {
    if (this.state !== "ready") throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "Fake provider is not ready");
    const id = `fake-message-${++this.counter}`;
    this.sent.push({ id, kind, jid, ...value });
    return { id, raw: { key: { id, remoteJid: jid, fromMe: true } } };
  }

  async sendText(jid, text) { return this.#send("text", jid, { text }); }
  async sendVoice(jid, audio) { return this.#send("voice", jid, audio); }
  getConnectedPhone() { return this.connectedPhone; }

  async disconnect({ revoke = false } = {}) {
    this.state = "disconnected";
    this.connectedPhone = null;
    this.emit("disconnected", { reason: revoke ? "Session revoked" : "Session closed" });
  }
}
