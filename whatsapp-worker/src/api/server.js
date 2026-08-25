import express from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { supabase } from "../supabase/client.js";
import { disconnectClient, getClient, getClientState, getOrCreateClient, waitForConnectionState } from "../whatsapp/client-manager.js";
import { normalizeMoroccanPhone } from "../utils/phone.js";

function authorized(value) {
  if (!config.apiSecret) return false;
  const expected = Buffer.from(`Bearer ${config.apiSecret}`);
  const actual = Buffer.from(value || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function originAllowed(origin) {
  if (!origin) return true;
  return config.allowedOrigins.includes(origin.replace(/\/$/, ""));
}

async function authenticateControlRequest(req) {
  const authorization = String(req.headers.authorization || "");
  if (authorized(authorization)) return { service: true, userId: null };

  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw httpError("Sign in to control WhatsApp", 401);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw httpError("Your session expired. Sign in again.", 401);
  return { service: false, userId: data.user.id };
}

async function authorizeWorkspaceAccess(req, id) {
  if (req.controlActor?.service) return;
  const userId = req.controlActor?.userId;
  if (!userId) throw httpError("Unauthorized", 401);

  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from("profile_workspaces").select("workspace_id").eq("profile_id", userId).eq("workspace_id", id).maybeSingle(),
    supabase.from("profiles").select("workspace_id, role").eq("id", userId).maybeSingle(),
  ]);
  if (membershipError) throw membershipError;
  if (profileError) throw profileError;
  if (!membership && profile?.workspace_id !== id) throw httpError("Workspace access denied", 403);

  const role = String(profile?.role || "").toLowerCase();
  if (!["owner", "supervisor", "admin", "founder", "super_admin"].includes(role)) {
    throw httpError("Workspace manager access required", 403);
  }
}

function workspaceId(value) {
  const result = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error("Invalid workspace_id");
  return result;
}

export function createApiServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "");
    if (!originAllowed(origin)) return res.status(403).json({ error: "This web origin is not allowed by the WhatsApp worker" });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true, version: config.version }));
  app.use(async (req, res, next) => {
    try {
      req.controlActor = await authenticateControlRequest(req);
      next();
    } catch (error) {
      res.status(error.status || 401).json({ error: error.message || "Unauthorized" });
    }
  });

  app.post("/connect", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      await authorizeWorkspaceAccess(req, id);
      const { data: settings } = await supabase.from("whatsapp_settings").select("enabled").eq("workspace_id", id).maybeSingle();
      if (!settings?.enabled) return res.status(409).json({ error: "Enable WhatsApp automation before connecting" });
      await getOrCreateClient(id);
      res.status(202).json(await waitForConnectionState(id));
    } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
  });

  app.post("/disconnect", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      await authorizeWorkspaceAccess(req, id);
      await disconnectClient(id, req.body.revoke_session !== false);
      res.json({ status: "disconnected" });
    } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
  });

  app.get("/status/:workspaceId", async (req, res) => {
    try {
      const id = workspaceId(req.params.workspaceId);
      await authorizeWorkspaceAccess(req, id);
      res.json(getClientState(id));
    } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
  });

  app.post("/test", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      await authorizeWorkspaceAccess(req, id);
      const phone = normalizeMoroccanPhone(req.body.phone);
      if (!phone) return res.status(400).json({ error: "Invalid Moroccan mobile number" });
      const client = getClient(id);
      if (!client || getClientState(id).status !== "ready") return res.status(409).json({ error: "WhatsApp is not ready" });
      const numberId = await client.getNumberId(phone);
      if (!numberId?._serialized) return res.status(422).json({ error: "Number is not registered on WhatsApp" });
      const body = String(req.body.message || "Ecom OS WhatsApp test ✅").slice(0, 4000);
      const sent = await client.sendMessage(numberId._serialized, body);
      const providerId = sent?.id?._serialized || null;
      await supabase.from("whatsapp_messages").insert({ workspace_id: id, phone, normalized_phone: phone, remote_jid: numberId._serialized, direction: "outbound", message_type: "test", body, wa_message_id: providerId, provider_event_id: providerId, status: "sent" });
      res.json({ ok: true, message_id: providerId });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });

  return app;
}
