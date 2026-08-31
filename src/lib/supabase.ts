import { createClient } from "@supabase/supabase-js";

// IMPORTANT: only the PUBLISHABLE key belongs here. It is safe to ship to the
// browser because Row Level Security (RLS) policies on every table decide
// what an authenticated user is actually allowed to read/write.
// The SERVICE_ROLE key and all OAuth client secrets must never be imported
// into this file or anything under src/ — they only live in Supabase Edge
// Function secrets (see supabase/functions/*).
const viteEnv = typeof import.meta !== "undefined" && import.meta && "env" in import.meta ? import.meta.env : ({} as Record<string, string | undefined>);
const configuredUrl = (viteEnv.VITE_SUPABASE_URL as string | undefined)?.trim();
const configuredKey = (viteEnv.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const configurationProblems: string[] = [];
if (!configuredUrl) configurationProblems.push("VITE_SUPABASE_URL");
if (!configuredKey) configurationProblems.push("VITE_SUPABASE_ANON_KEY");

if (configuredUrl) {
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      configurationProblems.push("VITE_SUPABASE_URL must use HTTPS outside local development");
    }
  } catch {
    configurationProblems.push("VITE_SUPABASE_URL must be a valid URL");
  }
}

export const supabaseConfigurationError = configurationProblems.length
  ? `Missing or invalid browser configuration: ${configurationProblems.join(", ")}.`
  : null;

// Safe placeholders keep module imports deterministic so App can render a clear
// configuration screen. They never point at a production service.
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
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;
