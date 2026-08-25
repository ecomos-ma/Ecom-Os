import { createClient } from "@supabase/supabase-js";

// IMPORTANT: only the PUBLISHABLE key belongs here. It is safe to ship to the
// browser because Row Level Security (RLS) policies on every table decide
// what an authenticated user is actually allowed to read/write.
// The SERVICE_ROLE key and all OAuth client secrets must never be imported
// into this file or anything under src/ — they only live in Supabase Edge
// Function secrets (see supabase/functions/*).
const configuredUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const configuredKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

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
