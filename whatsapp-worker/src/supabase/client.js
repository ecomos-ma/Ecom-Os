import { createClient } from "@supabase/supabase-js";

export function createWorkerSupabaseClient(config, logger) {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    logger.warn("Supabase credentials are absent; session/QR smoke testing is available but automation processing is disabled");
    return null;
  }

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-ecomos-worker": config.workerId } },
  });
  logger.info("Supabase service client initialized");
  return client;
}
