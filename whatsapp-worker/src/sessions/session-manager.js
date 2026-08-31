import { randomUUID } from "node:crypto";
import { ErrorCode, WorkerError, errorMessage } from "../utils/errors.js";
import { requireWorkspaceId } from "../utils/phone.js";

const ACTIVE_STATES = new Set(["initializing", "qr_required", "authenticated", "ready", "reconnecting"]);

export class SessionManager {
  constructor({ providerFactory, repository, authStore, inboundProcessor, receiptProcessor, logger }) {
    this.providerFactory = providerFactory;
    this.repository = repository;
    this.authStore = authStore;
    this.inboundProcessor = inboundProcessor;
    this.receiptProcessor = receiptProcessor;
    this.logger = logger;
    this.sessions = new Map();
    this.stopping = false;
  }

  #session(workspaceId) {
    const id = requireWorkspaceId(workspaceId);
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        workspaceId: id,
        state: "disconnected",
        qr: null,
        connectedPhone: null,
        displayName: null,
        provider: null,
        connectPromise: null,
        connectionAttemptId: null,
        connectionStartedAt: null,
        lastError: null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        freshAuthAttempted: false,
      });
    }
    return this.sessions.get(id);
  }

  snapshot(workspaceId) {
    const session = this.#session(workspaceId);
    return {
      workspaceId: session.workspaceId,
      connection_status: session.state,
      state: session.state,
      status: session.state,
      qr: session.qr,
      connectedPhone: session.connectedPhone,
      phoneNumber: session.connectedPhone,
      displayName: session.displayName,
      connectionAttemptId: session.connectionAttemptId,
      connectionStartedAt: session.connectionStartedAt,
      lastError: session.lastError,
      lastConnectedAt: session.lastConnectedAt,
      lastDisconnectedAt: session.lastDisconnectedAt,
    };
  }

  getState(workspaceId) { return this.snapshot(workspaceId); }
  getProvider(workspaceId) { return this.#session(workspaceId).provider; }
  activeCount() { return [...this.sessions.values()].filter((session) => session.provider && ACTIVE_STATES.has(session.state)).length; }

  async #persist(session) {
    if (!this.repository.configured) return;
    await this.repository.updateConnectionStatus(session.workspaceId, session.state, {
      connectedPhone: session.connectedPhone,
      connectionStartedAt: session.connectionStartedAt,
      lastConnectedAt: session.lastConnectedAt,
      lastDisconnectedAt: session.lastDisconnectedAt,
      lastError: session.lastError,
    });
  }

  #transition(session, state, values = {}) {
    session.state = state;
    Object.assign(session, values);
    if (state !== "qr_required") session.qr = values.qr ?? null;
    this.#persist(session).catch((error) => this.logger.error({ err: error, workspaceId: session.workspaceId }, "connection state persistence failed"));
  }

  #attach(session, provider) {
    provider.on("initializing", () => this.#transition(session, "initializing", { lastError: null }));
    provider.on("qr", ({ qr }) => this.#transition(session, "qr_required", { qr, lastError: null }));
    provider.on("authenticated", () => this.#transition(session, "authenticated", { qr: null, lastError: null }));
    provider.on("ready", ({ connectedPhone, displayName }) => {
      const now = new Date().toISOString();
      this.#transition(session, "ready", {
        qr: null,
        connectedPhone: connectedPhone || null,
        displayName: displayName || null,
        connectionStartedAt: null,
        lastConnectedAt: now,
        lastError: null,
      });
    });
    provider.on("reconnecting", ({ reason }) => this.#transition(session, "reconnecting", { qr: null, lastError: reason || null }));
    provider.on("disconnected", ({ reason, revokeRequired } = {}) => {
      const now = new Date().toISOString();
      this.#transition(session, revokeRequired ? "error" : "disconnected", {
        qr: null,
        connectedPhone: null,
        displayName: null,
        connectionStartedAt: null,
        lastDisconnectedAt: now,
        lastError: reason || null,
      });
    });
    provider.on("error", async (error) => {
      if (error.code === "AUTH_SESSION_INVALID" && !session.freshAuthAttempted) {
        this.logger.info({ workspaceId: session.workspaceId }, "[SESSION] terminal auth invalid, attempting fresh auth reset");
        session.freshAuthAttempted = true;
        try {
          if (session.provider === provider) {
            await provider.disconnect({ revoke: false });
          }
          await provider.connect({ forceFreshAuth: true });
        } catch (retryError) {
          this.logger.error({ err: retryError, workspaceId: session.workspaceId }, "[SESSION] fresh auth retry failed");
          this.#transition(session, "error", { qr: null, lastError: errorMessage(retryError), connectionStartedAt: null });
        }
      } else {
        this.#transition(session, "error", { qr: null, lastError: errorMessage(error), connectionStartedAt: null });
      }
    });
    provider.on("message", (message) => this.inboundProcessor.handle(session.workspaceId, provider, message));
    provider.on("receipt", (receipt) => this.receiptProcessor.handle(session.workspaceId, receipt));
  }

  async connect(workspaceId) {
    if (this.stopping) throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "Worker is shutting down", { httpStatus: 503 });
    const session = this.#session(workspaceId);
    if (session.connectPromise) return this.snapshot(session.workspaceId);
    if (session.provider && ACTIVE_STATES.has(session.state)) {
      await this.#persist(session);
      return this.snapshot(session.workspaceId);
    }

    if (!session.provider) {
      session.provider = this.providerFactory({ workspaceId: session.workspaceId });
      this.#attach(session, session.provider);
    }
    session.connectionAttemptId = randomUUID();
    session.connectionStartedAt = new Date().toISOString();
    session.freshAuthAttempted = false;
    this.#transition(session, "initializing", { qr: null, lastError: null });

    const task = Promise.resolve().then(() => session.provider.connect()).catch((error) => {
      this.#transition(session, "error", { lastError: errorMessage(error), connectionStartedAt: null });
      this.logger.error({ err: error, workspaceId: session.workspaceId }, "provider initialization failed");
    }).finally(() => {
      if (session.connectPromise === task) session.connectPromise = null;
    });
    session.connectPromise = task;
    return this.snapshot(session.workspaceId);
  }

  async reconnect(workspaceId) {
    const session = this.#session(workspaceId);
    if (session.connectPromise) return this.snapshot(session.workspaceId);
    if (session.provider) await session.provider.disconnect({ revoke: false });
    session.provider = null;
    this.#transition(session, "disconnected", { connectedPhone: null, displayName: null, qr: null });
    return this.connect(session.workspaceId);
  }

  async disconnect(workspaceId, { revoke = true } = {}) {
    const session = this.#session(workspaceId);
    await session.connectPromise?.catch(() => {});
    if (session.provider) await session.provider.disconnect({ revoke });
    if (revoke) session.provider = null;
    const now = new Date().toISOString();
    this.#transition(session, "disconnected", {
      qr: null,
      connectedPhone: null,
      displayName: null,
      connectionStartedAt: null,
      lastDisconnectedAt: now,
      lastError: null,
    });
    return this.snapshot(session.workspaceId);
  }

  async restore(workspaceIds) {
    for (const workspaceId of workspaceIds) {
      if (await this.authStore.hasCredentials(workspaceId)) {
        const session = this.#session(workspaceId);
        this.#transition(session, "reconnecting", { lastError: null });
        await this.connect(workspaceId);
      } else if (this.repository.configured) {
        const session = this.#session(workspaceId);
        this.#transition(session, "disconnected", { lastError: null, connectedPhone: null });
      }
    }
  }

  async isRegistered(workspaceId, phone) {
    const provider = this.getProvider(workspaceId);
    if (!provider || this.#session(workspaceId).state !== "ready") throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp is not ready", { retryable: true });
    return provider.isRegistered(phone);
  }

  async sendText(workspaceId, jid, text) {
    const provider = this.getProvider(workspaceId);
    if (!provider || this.#session(workspaceId).state !== "ready") throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp is not ready", { retryable: true });
    return provider.sendText(jid, text);
  }

  async sendVoice(workspaceId, jid, audio) {
    const provider = this.getProvider(workspaceId);
    if (!provider || this.#session(workspaceId).state !== "ready") throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp is not ready", { retryable: true });
    return provider.sendVoice(jid, audio);
  }

  async shutdown() {
    this.stopping = true;
    await Promise.allSettled([...this.sessions.values()].map((session) => session.provider?.disconnect({ revoke: false })));
    this.logger.info("Session manager shutdown complete (auth preserved)");
  }
}
