import { createWorkerConfig, loadWorkerEnvironment } from "./config/env.js";
import { createLogger } from "./utils/logger.js";
import { createWorkerRuntime } from "./runtime.js";

loadWorkerEnvironment();
const config = createWorkerConfig();
const logger = createLogger();
const runtime = createWorkerRuntime({ config, logger });

let server = null;
let started = false;

if (started) {
  logger.error("Worker already started, cannot start twice in same process");
  process.exit(1);
}
started = true;

server = runtime.app.listen(config.port, config.host);
try {
  await new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
} catch (error) {
  logger.fatal({ err: error }, "WhatsApp HTTP server failed");
  process.exitCode = 1;
  await runtime.sessionManager.shutdown();
}

if (server.listening) {
  logger.info({ host: config.host, port: config.port, mode: config.mode, provider: config.provider }, "WhatsApp worker listening");
  let persistedWorkspaces = [];
  try {
    persistedWorkspaces = await runtime.authStore.listWorkspaceIds();
    await runtime.sessionManager.restore(persistedWorkspaces);
  } catch (error) {
    logger.error({ err: error }, "WhatsApp persisted session restoration failed");
  }
  if (runtime.repository.configured) {
    let enabledWorkspaces = 0;
    try {
      const workspaces = await runtime.repository.listEnabledWorkspaces();
      enabledWorkspaces = workspaces.length;
      const persisted = new Set(persistedWorkspaces);
      await runtime.sessionManager.restore(workspaces.map((item) => item.workspace_id).filter((id) => !persisted.has(id)));
    } catch (error) {
      logger.error({ err: error }, "WhatsApp worker startup restoration failed");
    }
    runtime.queueProcessor.start();
    logger.info({ enabledWorkspaces }, "WhatsApp queue processor started");
  }
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "WhatsApp worker shutting down");
  
  try {
    await runtime.queueProcessor.stop();
    logger.info("Queue processor stopped");
  } catch (error) {
    logger.error({ err: error }, "Queue processor shutdown failed");
  }
  
  try {
    await runtime.sessionManager.shutdown();
    logger.info("Session manager stopped");
  } catch (error) {
    logger.error({ err: error }, "Session manager shutdown failed");
  }
  
  if (server.listening) {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info("HTTP server closed");
  }
  
  logger.info("WhatsApp worker stopped cleanly");
}

process.on("SIGTERM", () => shutdown("SIGTERM").catch((error) => {
  logger.error({ err: error }, "shutdown failed");
  process.exitCode = 1;
}).finally(() => process.exit(process.exitCode || 0)));

process.on("SIGINT", () => shutdown("SIGINT").catch((error) => {
  logger.error({ err: error }, "shutdown failed");
  process.exitCode = 1;
}).finally(() => process.exit(process.exitCode || 0)));

process.on("beforeExit", () => {
  if (!shuttingDown) {
    logger.warn("Process exiting without graceful shutdown, forcing cleanup");
    shutdown("beforeExit").catch(() => {});
  }
});

// Keep process alive - wait for shutdown signal
await new Promise((resolve) => {
  const onShutdown = () => {
    resolve();
  };
  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);
});
