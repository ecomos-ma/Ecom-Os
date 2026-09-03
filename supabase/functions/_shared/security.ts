import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@2.111.0/cors";
import { frontendOrigins } from "./app-url.ts";

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError("Service configuration is incomplete", 503);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function corsHeaders(_req: Request): Record<string, string> {
  const origin = _req.headers.get("origin") ?? "";
  const allowedOrigins = frontendOrigins();
  const { "Access-Control-Allow-Origin": _wildcardOrigin, ...canonicalCorsHeaders } = supabaseCorsHeaders;
  return {
    ...canonicalCorsHeaders,
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function errorResponse(req: Request, error: unknown): Response {
  const normalized = error instanceof HttpError ? error : new HttpError("Request failed", 500);
  return json(req, { error: normalized.message }, normalized.status);
}

export async function authenticate(req: Request, client: SupabaseClient): Promise<User> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError("Authentication required", 401);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError("Authentication required", 401);
  return data.user;
}

export function requireUuid(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpError(`${field} is invalid`, 400);
  }
  return normalized;
}

export async function authorizeWorkspace(
  client: SupabaseClient,
  userId: string,
  workspaceId: string,
  allowedRoles: string[] = ["owner", "admin", "manager"],
): Promise<{ role: string }> {
  const [{ data: profile, error: profileError }, { data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    client.from("profiles").select("id, is_active, deleted_at, status, role").eq("id", userId).maybeSingle(),
    client.from("workspaces").select("id, is_active, deleted_at, status").eq("id", workspaceId).maybeSingle(),
    client.from("profile_workspaces").select("id, role, is_owner, status").eq("profile_id", userId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (profileError || workspaceError || membershipError) throw new HttpError("Workspace authorization failed", 403);
  const profileStatus = String(profile?.status ?? "active").toLowerCase();
  const workspaceStatus = String(workspace?.status ?? "active").toLowerCase();
  if (
    !profile || profile.is_active === false || profile.deleted_at || ["suspended", "removed", "deleted", "inactive"].includes(profileStatus) ||
    !workspace || workspace.is_active === false || workspace.deleted_at || ["suspended", "removed", "deleted", "inactive"].includes(workspaceStatus) ||
    !membership || String(membership.status ?? "active").toLowerCase() !== "active"
  ) throw new HttpError("Workspace access denied", 403);

  const role = String(membership.is_owner ? "owner" : membership.role ?? profile.role ?? "user").toLowerCase();
  if (!allowedRoles.map((value) => value.toLowerCase()).includes(role)) {
    throw new HttpError("Workspace administrator permission required", 403);
  }
  return { role };
}

export async function authorizeOperationalWorkspace(
  client: SupabaseClient,
  userId: string,
  workspaceId: string,
  allowedRoles: string[] = ["owner", "admin", "manager"],
): Promise<{ role: string }> {
  const authorization = await authorizeWorkspace(client, userId, workspaceId, allowedRoles);
  const { data, error } = await client.rpc("resolve_workspace_access_v1", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
  });
  if (error) throw new HttpError("Workspace subscription could not be verified", 503);
  if (!data?.allowed) {
    const reason = String(data?.reason ?? "subscription_access_denied");
    throw new HttpError(`Workspace operational access denied: ${reason}`, 403);
  }
  return authorization;
}

export function assertOnlyKeys(body: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError("Request contains unsupported fields", 400);
  }
}
