import pino from "pino";

export function createLogger(level = process.env.WORKER_LOG_LEVEL || "info") {
  return pino({
    level,
    base: { service: "ecomos-whatsapp-worker" },
    redact: {
      paths: [
        "req.headers.authorization",
        "authorization",
        "token",
        "cookies",
        "auth",
        "*.auth",
        "*.creds",
        "SUPABASE_SERVICE_ROLE_KEY",
        "WORKER_API_SECRET",
      ],
      censor: "[REDACTED]",
    },
  });
}
