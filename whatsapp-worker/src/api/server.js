import express from "express";
import { corsMiddleware, controlAuthMiddleware, errorMiddleware } from "./middleware.js";
import { createRoutes } from "./routes.js";

export function createApiServer({ config, sessionManager, repository, logger }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use(corsMiddleware(config));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      online: true,
      version: config.version,
      provider: config.provider,
      uptime: Number(process.uptime().toFixed(3)),
      activeSessions: sessionManager.activeCount(),
      automationEnabled: repository.configured,
    });
  });

  app.use(controlAuthMiddleware(config));
  app.use(createRoutes({ sessionManager, repository, logger }));
  app.use((_req, res) => res.status(404).json({ ok: false, error: "Route not found", code: "NOT_FOUND" }));
  app.use(errorMiddleware(logger));
  return app;
}
