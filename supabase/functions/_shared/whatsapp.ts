import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("ALLOWED_FRONTEND_ORIGINS") || "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return {
    ...(allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export async function authenticateUser(req: Request, client: SupabaseClient) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing authorization token");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authorization token");
  return data.user;
}

export async function authorizeWorkspace(client: SupabaseClient, userId: string, workspaceId: string) {
  const { data: membership, error } = await client
    .from("profile_workspaces")
    .select("workspace_id")
    .eq("profile_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) {
    const { data: profile } = await client.from("profiles").select("workspace_id, role").eq("id", userId).maybeSingle();
    if (profile?.workspace_id !== workspaceId) throw new Error("Workspace access denied");
  }
  const { data: actor, error: actorError } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (actorError) throw actorError;
  if (!["owner", "supervisor", "admin", "founder", "super_admin"].includes(String(actor?.role || "").toLowerCase())) {
    throw new Error("Workspace manager access required");
  }
}

export async function verifyHmac(rawBody: string, timestamp: string | null, signature: string | null) {
  if (!timestamp || !signature) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("WHATSAPP_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const hex = signature.replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
}
