import { config } from "./config.js";
import { createApiServer } from "./api/server.js";
import { supabase } from "./supabase/client.js";
import { getOrCreateClient } from "./whatsapp/client-manager.js";
import { startQueueProcessor, stopQueueProcessor } from "./queue/processor.js";

const app = createApiServer();
const server = app.listen(config.port, config.host, () => console.log(`[worker] listening on http://${config.host}:${config.port}`));

async function restoreEnabledSessions() {
  const { data, error } = await supabase.from("whatsapp_settings").select("workspace_id, connection_status").eq("enabled", true).neq("connection_status", "disconnected");
  if (error) throw error;
  for (const row of data || []) {
    getOrCreateClient(row.workspace_id).catch((restoreError) => console.error(`[worker] restore ${row.workspace_id}`, restoreError));
  }
}

restoreEnabledSessions().catch((error) => console.error("[worker] restore", error));
startQueueProcessor();

async function shutdown(signal) {
  console.log(`[worker] ${signal}, shutting down`);
  stopQueueProcessor();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
