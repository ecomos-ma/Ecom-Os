import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { "x-ecomos-worker": config.workerId } },
});

