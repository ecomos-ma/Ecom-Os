import { createClient } from "@supabase/supabase-js";

const getEnvVar = (key: string): string | undefined => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {
    // Ignore in non-Vite envs
  }
  return typeof process !== "undefined" && process.env ? process.env[key] : undefined;
};

const configuredUrl = (getEnvVar("VITE_SUPABASE_URL") || getEnvVar("SUPABASE_URL"))?.trim();
const configuredKey = (getEnvVar("VITE_SUPABASE_ANON_KEY") || getEnvVar("SUPABASE_SERVICE_ROLE_KEY"))?.trim();

const configurationProblems: string[] = [];
if (!configuredUrl) configurationProblems.push("VITE_SUPABASE_URL");
if (!configuredKey) configurationProblems.push("VITE_SUPABASE_ANON_KEY");

export const supabaseConfigurationError = configurationProblems.length
  ? `Missing or invalid browser configuration: ${configurationProblems.join(", ")}.`
  : null;

const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
const supabaseKey = configuredKey || "missing-publishable-key";

function clearLegacySupabaseAuthState() {
  if (typeof window === "undefined") return;

  const legacyKeys = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const lower = key.toLowerCase();
    if (
      key === "supabase.auth.token" ||
      key === "supabase.auth.refresh_token" ||
      key === "supabase.auth.session" ||
      key === "supabase.auth.user" ||
      key === "auth-token" ||
      key === "session-token" ||
      key === "jwt-token" ||
      lower.includes("supabase.auth") ||
      lower.includes("ecomos-auth") ||
      lower.includes("auth-token") ||
      lower.includes("session-token") ||
      lower.includes("jwt-token")
    ) {
      if (!lower.startsWith("sb-")) {
        legacyKeys.add(key);
      }
    }
  }

  for (const key of legacyKeys) {
    try {
      const value = window.localStorage.getItem(key);
      if (!value) {
        window.localStorage.removeItem(key);
        continue;
      }
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object") {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

clearLegacySupabaseAuthState();

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;
