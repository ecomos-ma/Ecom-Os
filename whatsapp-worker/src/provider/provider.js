import { EventEmitter } from "node:events";

export class WhatsAppProvider extends EventEmitter {
  constructor({ workspaceId, logger }) {
    super();
    this.workspaceId = workspaceId;
    this.logger = logger;
    this.state = "disconnected";
    this.on("error", () => {});
  }

  snapshot() {
    return { state: this.state, connectedPhone: null, displayName: null };
  }

  async connect() { throw new Error("connect() is not implemented"); }
  async disconnect() { throw new Error("disconnect() is not implemented"); }
  async sendText() { throw new Error("sendText() is not implemented"); }
  async sendVoice() { throw new Error("sendVoice() is not implemented"); }
  async isRegistered() { throw new Error("isRegistered() is not implemented"); }
  getConnectedPhone() { return null; }
}
