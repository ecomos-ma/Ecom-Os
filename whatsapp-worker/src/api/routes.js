import { Router } from "express";
import { ErrorCode, WorkerError } from "../utils/errors.js";
import { normalizeMoroccanPhone, requireWorkspaceId } from "../utils/phone.js";

export function extractWorkspaceId(req) {
  return requireWorkspaceId(req.params?.workspaceId ?? req.body?.workspace_id ?? req.query?.workspace_id ?? req.query?.workspaceId);
}

function sessionResponse(session) {
  return {
    ok: true,
    workspace_id: session.workspaceId,
    connection_status: session.connection_status,
    state: session.connection_status,
    status: session.connection_status,
    connected: session.connection_status === "ready",
    ready: session.connection_status === "ready",
    worker_available: true,
    qr: session.qr || null,
    connected_phone: session.connectedPhone || null,
    phoneNumber: session.connectedPhone || null,
    displayName: session.displayName || null,
    connection_started_at: session.connectionStartedAt || null,
    last_error: session.lastError || null,
    last_connected_at: session.lastConnectedAt || null,
    last_disconnected_at: session.lastDisconnectedAt || null,
  };
}

export function createRoutes({ sessionManager, repository, logger }) {
  const router = Router();

  const run = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
  };

  async function ensureEnabled(workspaceId) {
    if (!repository.configured) return;
    const settings = await repository.getSettings(workspaceId);
    if (!settings?.enabled) await repository.enableWorkspace(workspaceId);
  }

  const connect = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    await ensureEnabled(workspaceId);
    const session = await sessionManager.connect(workspaceId);
    res.status(202).json(sessionResponse(session));
  });

  const status = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    res.status(200).json(sessionResponse(sessionManager.getState(workspaceId)));
  });

  const disconnect = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    const session = await sessionManager.disconnect(workspaceId, { revoke: req.body?.revoke_session !== false });
    res.status(200).json(sessionResponse(session));
  });

  const reconnect = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    await ensureEnabled(workspaceId);
    const session = await sessionManager.reconnect(workspaceId);
    res.status(202).json(sessionResponse(session));
  });

  const logout = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    const session = await sessionManager.disconnect(workspaceId, { revoke: true });
    res.status(200).json(sessionResponse(session));
  });

  const send = run(async (req, res) => {
    const workspaceId = extractWorkspaceId(req);
    const phone = normalizeMoroccanPhone(req.body?.phone);
    const body = String(req.body?.message || "").trim().slice(0, 4000);
    if (!phone) throw new WorkerError(ErrorCode.RECIPIENT_INVALID, "Invalid Moroccan mobile number", { httpStatus: 400 });
    if (!body) throw new WorkerError(ErrorCode.INVALID_REQUEST, "Message body is required", { httpStatus: 400 });
    if (sessionManager.getState(workspaceId).connection_status !== "ready") {
      throw new WorkerError(ErrorCode.PROVIDER_DISCONNECTED, "WhatsApp is not connected", { httpStatus: 409 });
    }
    const registration = await sessionManager.isRegistered(workspaceId, phone);
    if (!registration.registered || !registration.jid) throw new WorkerError(ErrorCode.RECIPIENT_INVALID, "Number is not registered on WhatsApp", { httpStatus: 422 });
    const sent = await sessionManager.sendText(workspaceId, registration.jid, body);
    if (repository.configured) {
      await repository.logMessage({
        workspace_id: workspaceId,
        order_id: null,
        phone,
        normalized_phone: phone,
        remote_jid: registration.jid,
        direction: "outbound",
        message_type: "test",
        body,
        wa_message_id: sent.id,
        provider_event_id: sent.id,
        status: "sent",
      });
    }
    logger.info({ workspaceId, providerMessageId: sent.id }, "test WhatsApp message sent");
    res.status(200).json({ ok: true, workspace_id: workspaceId, message_id: sent.id, messageId: sent.id });
  });

  router.post("/sessions/:workspaceId/connect", connect);
  router.get("/sessions/:workspaceId/status", status);
  router.post("/sessions/:workspaceId/disconnect", disconnect);
  router.post("/sessions/:workspaceId/reconnect", reconnect);
  router.post("/sessions/:workspaceId/logout", logout);
  router.post("/sessions/:workspaceId/send", send);
  router.post("/sessions/:workspaceId/test", send);

  router.post("/connect", connect);
  router.get("/status/:workspaceId", status);
  router.post("/disconnect", disconnect);
  router.post("/test", send);

  return router;
}
