import { createApiServer } from "./api/server.js";
import { QueueProcessor } from "./automation/queue-processor.js";
import { InboundProcessor } from "./automation/inbound-processor.js";
import { ReceiptProcessor } from "./automation/receipts.js";
import { BaileysWhatsAppProvider } from "./provider/baileys-provider.js";
import { WorkspaceAuthStore } from "./sessions/auth-store.js";
import { SessionManager } from "./sessions/session-manager.js";
import { createWorkerSupabaseClient } from "./supabase/client.js";
import { createWhatsAppRepository } from "./supabase/repository.js";

export function createWorkerRuntime({ config, logger, providerFactory, repository: suppliedRepository, authStore: suppliedAuthStore } = {}) {
  const client = suppliedRepository ? null : createWorkerSupabaseClient(config, logger);
  const repository = suppliedRepository || createWhatsAppRepository(client);
  const authStore = suppliedAuthStore || new WorkspaceAuthStore(config.sessionPath);
  const inboundProcessor = new InboundProcessor({ repository, logger });
  const receiptProcessor = new ReceiptProcessor({ repository, logger });
  const makeProvider = providerFactory || (({ workspaceId }) => new BaileysWhatsAppProvider({
    workspaceId,
    authStore,
    logger,
    reconnectBaseMs: config.reconnectBaseMs,
    reconnectMaxMs: config.reconnectMaxMs,
  }));
  const sessionManager = new SessionManager({
    providerFactory: makeProvider,
    repository,
    authStore,
    inboundProcessor,
    receiptProcessor,
    logger,
  });
  const queueProcessor = new QueueProcessor({ repository, sessionManager, config, logger });
  const app = createApiServer({ config, sessionManager, repository, logger });
  return { app, repository, authStore, sessionManager, queueProcessor };
}
