import { timingSafeEqual } from "node:crypto";
import { publicError, WorkerError, ErrorCode } from "../utils/errors.js";

function bearerMatches(header, secret) {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(String(header || ""));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isLoopback(address) {
  const normalized = String(address || "").replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

export function corsMiddleware(config) {
  return (req, res, next) => {
    const origin = String(req.headers.origin || "").replace(/\/$/, "");
    if (origin && !config.allowedOrigins.includes(origin)) {
      return res.status(403).json({ ok: false, error: "This web origin is not allowed by the WhatsApp worker", code: "ORIGIN_FORBIDDEN" });
    }
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

export function controlAuthMiddleware(config) {
  return (req, _res, next) => {
    if (config.mode === "test") return next();
    if (config.localDevelopment) {
      if (!isLoopback(req.socket.remoteAddress)) return next(new WorkerError(ErrorCode.INVALID_REQUEST, "Development control is loopback-only", { httpStatus: 403 }));
      return next();
    }
    if (!bearerMatches(req.headers.authorization, config.apiSecret)) {
      return next(new WorkerError(ErrorCode.INVALID_REQUEST, "Unauthorized worker control request", { httpStatus: 401 }));
    }
    next();
  };
}

export function errorMiddleware(logger) {
  return (error, req, res, _next) => {
    logger.error({ err: error, method: req.method, path: req.path }, "worker request failed");
    res.status(error?.httpStatus || 500).json(publicError(error));
  };
}
